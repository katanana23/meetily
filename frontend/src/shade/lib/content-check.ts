// Слой 2 против пустых записей: проверка моделью для записей с 3..15 значимыми словами
// (discard-policy.ts). Короткий вопрос к той же модели, что делает итоги: есть ли в тексте
// содержательная информация — решения, задачи, факты, имена, сроки, договорённости. Ответ
// да/нет. Встреча к этому моменту уже сохранена и стоит в списке; «нет» переносит её в
// корзину (recording-outcome.tsx), всё остальное оставляет как есть.
//
// Провайдер и модель — настройки итогов оригинала (configService.getModelConfig, команда
// api_get_model_config). Спрашиваем только локальную модель:
// - ollama: запрос /api/generate прямо в Ollama (адрес из настроек, по умолчанию
//   localhost:11434, он же разрешён в CSP окна);
// - builtin-ai: встроенная модель доступна только через api_process_transcript, а эта команда
//   заполняет шаблон итогов и пишет результат в базу у существующей встречи. Короткого
//   вопроса без изменения ядра ей не задать: ответ «недоступна», встреча остаётся;
// - облачные провайдеры (OpenAI, Claude, Groq, OpenRouter, свой OpenAI): текст встречи
//   уходит в облако только по «Подвести итоги», без спроса не отправляем: «недоступна».
// Не ответила за MODEL_CHECK_TIMEOUT_MS, ошибка, ответ не да и не нет: «недоступна».

import { configService } from '@/services/configService';
import { MODEL_CHECK_TIMEOUT_MS } from './discard-policy';

export type ContentCheckResult =
  /** Модель нашла содержание: встреча остаётся. */
  | 'content'
  /** Модель ответила «нет»: встреча уходит в корзину. */
  | 'empty'
  /** Спросить не у кого или ответа нет: встреча остаётся. */
  | 'unavailable';

export interface ContentCheck {
  result: ContentCheckResult;
  /** Для журнала: провайдер, причина, время ответа. */
  detail: string;
}

const DEFAULT_OLLAMA = 'http://localhost:11434';

/** Вопрос модели. Текст в кавычках-ёлочках, ответ одним словом. */
export function contentPrompt(text: string): string {
  return [
    'Ниже расшифровка короткой записи разговора.',
    'Есть ли в ней содержательная информация: решения, задачи, факты, имена, сроки, договорённости?',
    'Проверка микрофона, счёт, приветствия, междометия и отдельные слова без смысла содержанием не считаются.',
    'Ответь одним словом: «да» или «нет».',
    '',
    `Расшифровка: «${text.trim()}»`,
  ].join('\n');
}

/**
 * Та ли это встреча, что только что записана: в корзину по ответу модели переносим, только
 * когда известны оба пути (папка записи и folder_path встречи) и они равны. Иначе человек мог
 * за время ожидания открыть другую встречу, и в корзину ушла бы чужая. Возвращает причину,
 * по которой переносить нельзя, или null, если можно.
 */
export function folderMismatch(recorded: string | null | undefined, saved: string | null | undefined): string | null {
  if (!recorded) return 'папка записи неизвестна';
  if (!saved) return 'у встречи нет папки записи';
  if (recorded !== saved) return `папка встречи другая (${saved}, ждали ${recorded})`;
  return null;
}

/** Ответ модели в да/нет; рассуждения <think>…</think> отбрасываются. null — ни то ни другое. */
export function parseAnswer(raw: string): boolean | null {
  const answer = raw
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ')
    .toLowerCase()
    .replace(/[«»"'*.,!?:;()\[\]]/g, ' ')
    .trim();
  const first = answer.split(/\s+/)[0] ?? '';
  if (first === 'да' || first === 'yes') return true;
  if (first === 'нет' || first === 'no') return false;
  return null;
}

/**
 * Только в разработке: исход проверки без модели. ?check=content|empty|unavailable|timeout
 * (timeout ждёт MODEL_CHECK_TIMEOUT_MS, как настоящий таймаут). Выбор запоминается на вкладку:
 * адрес теряет параметр при переходах.
 */
const DEV_KEY = 'shade.devContentCheck';
function devOverride(): string | null {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('check');
    if (fromUrl) sessionStorage.setItem(DEV_KEY, fromUrl);
    return fromUrl ?? sessionStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}

/** Запомнить ?check= из адреса при загрузке страницы (запись стартует позже, адрес уже другой). */
export function rememberDevCheck(): void {
  devOverride();
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      resolve();
    });
  });

async function askOllama(endpoint: string, model: string, text: string, signal: AbortSignal): Promise<boolean | null> {
  const res = await fetch(`${endpoint.replace(/\/+$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      prompt: contentPrompt(text),
      stream: false,
      // Модели с рассуждениями (qwen3, deepseek-r1) без них отвечают сразу; старые Ollama поле не знают
      think: false,
      options: { temperature: 0, num_predict: 8 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ответила ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return parseAnswer(data.response ?? '');
}

/**
 * Спросить модель итогов, есть ли в тексте содержание. Никогда не бросает: любая ошибка —
 * 'unavailable'. Ответ не позже timeoutMs (MODEL_CHECK_TIMEOUT_MS), что бы ни зависло.
 */
export async function checkContent(text: string, timeoutMs = MODEL_CHECK_TIMEOUT_MS): Promise<ContentCheck> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ContentCheck>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ result: 'unavailable', detail: `нет ответа за ${timeoutMs} мс` });
    }, timeoutMs);
  });
  try {
    return await Promise.race([ask(text, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function ask(text: string, signal: AbortSignal): Promise<ContentCheck> {
  const t0 = Date.now();
  const took = () => `${Date.now() - t0} мс`;
  try {
    const dev = devOverride();
    if (dev) {
      // timeout: ждём дольше предела, ответ даст таймер checkContent
      await sleep(dev === 'timeout' ? MODEL_CHECK_TIMEOUT_MS * 2 : 1500, signal);
      const result: ContentCheckResult = dev === 'content' || dev === 'empty' ? dev : 'unavailable';
      return { result, detail: `заглушка ?check=${dev}` };
    }

    const config = await configService.getModelConfig().catch(() => null);
    if (!config) return { result: 'unavailable', detail: 'настройки модели итогов не прочитаны' };
    if (config.provider !== 'ollama') {
      const why = config.provider === 'builtin-ai' ? 'встроенной модели короткий вопрос не задать без ядра' : 'облачная модель, текст без спроса не отправляем';
      return { result: 'unavailable', detail: `${config.provider}: ${why}` };
    }
    if (!config.model) return { result: 'unavailable', detail: 'ollama: модель не выбрана' };
    const answer = await askOllama(config.ollamaEndpoint || DEFAULT_OLLAMA, config.model, text, signal);
    if (answer === null) return { result: 'unavailable', detail: `ollama ${config.model}: ответ не да и не нет, ${took()}` };
    return { result: answer ? 'content' : 'empty', detail: `ollama ${config.model}: ${answer ? 'да' : 'нет'}, ${took()}` };
  } catch (error) {
    return { result: 'unavailable', detail: `ошибка: ${String(error)}, ${took()}` };
  }
}
