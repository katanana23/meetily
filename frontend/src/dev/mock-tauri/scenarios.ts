// Сценарии режима заглушек. Выбираются параметром адреса ?mock=<id>,
// выбор запоминается в sessionStorage, чтобы переживать переходы
// между страницами (router.push теряет query-параметр).

import { createFullMeetings } from './fixtures/meetings';
import { createLongMeetings } from './fixtures/long';
import { createEdgeMeetings } from './fixtures/edge';
import type { MockMeeting } from './fixtures/types';

export type ScenarioId =
  | 'empty' | 'full' | 'long' | 'recording' | 'error' | 'onboarding'
  | 'silence-5s' | 'silence-hallucination' | 'noise-30s' | 'words-3' | 'words-12' | 'words-20' | 'heard-no-text'
  | 'recognition-failed' | 'mid-silence'
  | 'long-empty' | 'sparse' | 'no-model' | 'no-permission'
  | 'mic-denied' | 'mic-missing' | 'mic-prompt' | 'mic-core-refuses' | 'mic-silent' | 'mic-lost' | 'model-downloading'
  | 'mic-prompt-deny' | 'mic-unknown-zeros' | 'mic-unknown-ok' | 'mic-unknown-blind' | 'onboarding-mac' | 'onboarding-mac-unknown';

/**
 * Что «ядро» присылает во время записи. Речевой сегмент после VAD приходит
 * событием transcription-progress, распознанный текст событием transcript-update.
 * - normal: речь и текст по кругу;
 * - none: тишина, VAD молчит;
 * - few: три реплики, потом тишина;
 * - hallucination: тишина, на один шумовой сегмент модель выдаёт «Продолжение следует...»;
 * - script: реплики из scenario.script по одной на такт, потом тишина;
 * - noise: тишина с шумом, три коротких ложных срабатывания VAD (0,6 + 0,8 + 0,6 с),
 *   на которые модель выдаёт «...», «Продолжение следует...» и «♪»;
 * - vad-only: VAD слышит речь, но текста нет (модель не распознаёт);
 * - then-silence: пять реплик, потом тишина и скачок времени на silenceJumpSec.
 */
export type LiveMode = 'normal' | 'none' | 'few' | 'hallucination' | 'script' | 'noise' | 'vad-only' | 'then-silence';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  /** Встречи в «базе» на старте. */
  meetings: () => MockMeeting[];
  /** Онбординг пройден (false — покажется мастер первого запуска). */
  onboardingCompleted: boolean;
  /** Модели транскрипции и резюме уже скачаны. */
  modelsReady: boolean;
  /** «Ядро» уже пишет встречу в момент загрузки страницы. */
  recordingOnLoad: boolean;
  /** Команды падают (см. FAILING_COMMANDS в handlers.ts). */
  failing: boolean;
  /** Реплики во время записи: как обычно, ни одной или только три. */
  live?: LiveMode;
  /** Запись «началась» столько секунд назад: длинная запись без ожидания. */
  startOffsetSec?: number;
  /** then-silence: на сколько секунд «перематывается» время после последней реплики. */
  silenceJumpSec?: number;
  /** script: реплики без подписи спикера, по одной на такт. */
  script?: string[];
  /** script: длительность каждого сегмента в секундах вместо расчёта по длине текста. */
  scriptSeconds?: number;
  /** После реплик script ядро сообщает сбой распознавания (transcription-warning). */
  warnAfterScript?: boolean;
  /** false: нет доступа к микрофону (trigger_microphone_permission отвечает false). */
  micPermission?: boolean;
  /** Звук компьютера (trigger_system_audio_permission_command); по умолчанию как micPermission. */
  systemAudioPermission?: boolean;
  /** В списке устройств нет ни одного микрофона. */
  micDeviceMissing?: boolean;
  /** Вопрос macOS о микрофоне: ответ приходит через столько миллисекунд. */
  micPromptMs?: number;
  /** Ядро отказывается стартовать: verify_microphone_access не дождалось звука. */
  micCoreRefuses?: boolean;
  /**
   * Уровень микрофона во время записи (событие aid-mock-mic вместо getUserMedia):
   * ok — шум комнаты; silent — нули; lost — на 8-й секунде микрофон отключают.
   */
  micLive?: 'ok' | 'silent' | 'lost';
  /** На старте уже идёт скачивание модели распознавания (медленно, около минуты). */
  downloadOnLoad?: boolean;
  /**
   * Разрешение macOS, которое видит окно приложения (команда aid_mock_mac_mic вместо
   * getUserMedia): granted, denied, unknown (окно не ответило); prompt-granted и
   * prompt-denied — доступ не спрашивали, «вопрос macOS» отвечается через micPromptMs.
   * Без поля: не macOS, решает trigger_microphone_permission.
   */
  macMic?: 'granted' | 'denied' | 'unknown' | 'prompt-granted' | 'prompt-denied';
  /** Уведомления как в ядре по умолчанию: согласие есть, показ выключен. */
  notificationsCoreDefault?: boolean;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  empty: {
    id: 'empty', label: 'empty', description: 'Нет ни одной встречи',
    meetings: () => [], onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  full: {
    id: 'full', label: 'full', description: '9 встреч: резюме всех 6 шаблонов, задачи, транскрипты',
    meetings: createFullMeetings, onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  long: {
    id: 'long', label: 'long', description: 'Встреча на 3 часа (2100 реплик) и 45 встреч в сайдбаре',
    meetings: createLongMeetings, onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  recording: {
    id: 'recording', label: 'recording', description: 'Идёт запись: реплики приходят по таймеру, есть пауза',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
  },
  error: {
    id: 'error', label: 'error', description: 'Команды ядра падают с ошибками',
    meetings: () => [], onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: true,
  },
  onboarding: {
    id: 'onboarding', label: 'onboarding', description: 'Первый запуск: мастер настройки, модели не скачаны',
    meetings: () => [], onboardingCompleted: false, modelsReady: false, recordingOnLoad: false, failing: false,
  },
  'silence-5s': {
    id: 'silence-5s', label: 'silence-5s', description: 'Тишина: VAD ничего не слышит, реплик нет. Остановите через 5 секунд',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'none',
  },
  'silence-hallucination': {
    id: 'silence-hallucination', label: 'silence-hallucination', description: 'Три минуты тишины, на шум модель выдала «Продолжение следует...»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'hallucination', startOffsetSec: 180,
  },
  'noise-30s': {
    id: 'noise-30s', label: 'noise-30s', description: '30 секунд тишины с шумом: VAD трижды ложно срабатывает, всего на 2 секунды',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'noise', startOffsetSec: 25,
  },
  'recognition-failed': {
    id: 'recognition-failed', label: 'recognition-failed', description: '12 секунд речи, три коротких реплики и сбой распознавания: «Речь не распознана»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'script', startOffsetSec: 20, script: ['Так, начинаем.', 'Слышно меня?', 'Подождите.'], scriptSeconds: 4, warnAfterScript: true,
  },
  'words-3': {
    id: 'words-3', label: 'words-3', description: 'Три слова «Да, хорошо, давай»: меньше порога, встреча не сохраняется',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'script', startOffsetSec: 10, script: ['Да, хорошо, давай.'],
  },
  'words-12': {
    id: 'words-12', label: 'words-12', description: '12 слов в трёх репликах: меньше порога 15 слов, встреча не сохраняется',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'script', startOffsetSec: 20, script: ['Коротко: релиз переносим на четверг.', 'Тесты пока не прошли, жду отчёт.', 'Всё.'],
  },
  'words-20': {
    id: 'words-20', label: 'words-20', description: '20 слов и больше 10 секунд речи: встреча сохраняется',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'script', startOffsetSec: 30,
    script: [
      'Давайте договоримся: релиз переносим на четверг.',
      'Лада до среды пришлёт отчёт по тестам.',
      'Если всё зелёное, выкатываем утром.',
      'Возражений нет.',
    ],
  },
  'heard-no-text': {
    id: 'heard-no-text', label: 'heard-no-text', description: 'VAD слышит речь, текста нет и причины сбоя нет: встреча не сохраняется',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'vad-only', startOffsetSec: 30,
  },
  'mid-silence': {
    id: 'mid-silence', label: 'mid-silence', description: 'Пять реплик, потом две с лишним минуты тишины: подсказка «Остановить?»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'then-silence', silenceJumpSec: 130,
  },
  'long-empty': {
    id: 'long-empty', label: 'long-empty', description: 'Запись на 5 минут без единой реплики (подсказка «Не слышу речи») и такая же сохранённая встреча',
    meetings: () => [...createEdgeMeetings(), ...createFullMeetings().slice(0, 2)], onboardingCompleted: true, modelsReady: true,
    recordingOnLoad: true, failing: false, live: 'none', startOffsetSec: 300,
  },
  sparse: {
    id: 'sparse', label: 'sparse', description: 'Запись, в которой распознаны только три реплики',
    meetings: () => [...createEdgeMeetings(), ...createFullMeetings().slice(0, 2)], onboardingCompleted: true, modelsReady: true,
    recordingOnLoad: true, failing: false, live: 'few', startOffsetSec: 40,
  },
  'no-model': {
    id: 'no-model', label: 'no-model', description: 'Мастер пройден, но модель распознавания не скачана; уведомления как в ядре по умолчанию',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: false, recordingOnLoad: false, failing: false,
    notificationsCoreDefault: true,
  },
  'no-permission': {
    id: 'no-permission', label: 'no-permission', description: 'Нет доступа к микрофону и записи экрана',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micPermission: false,
  },
  'mic-denied': {
    id: 'mic-denied', label: 'mic-denied', description: 'Отказ в микрофоне, звук компьютера есть: карточка и «Записать только звук компьютера»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    // микрофон в записи даёт нули: в режиме «только звук компьютера» «Не слышу микрофон» не показывается
    micPermission: false, systemAudioPermission: true, micLive: 'silent', macMic: 'denied',
  },
  'mic-missing': {
    id: 'mic-missing', label: 'mic-missing', description: 'Микрофона нет в списке устройств, звук компьютера есть',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micDeviceMissing: true, systemAudioPermission: true,
  },
  'mic-prompt': {
    id: 'mic-prompt', label: 'mic-prompt', description: 'Доступ к микрофону ещё не спрашивали: «вопрос macOS» 2,5 с, потом разрешение и запись',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micPromptMs: 2500, micLive: 'ok', macMic: 'prompt-granted',
  },
  'mic-prompt-deny': {
    id: 'mic-prompt-deny', label: 'mic-prompt-deny', description: 'Доступ не спрашивали: по «Записать» «вопрос macOS», человек отказывает: карточка, кнопка «нужен доступ»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micPromptMs: 2000, macMic: 'prompt-denied', systemAudioPermission: true,
  },
  'mic-unknown-zeros': {
    id: 'mic-unknown-zeros', label: 'mic-unknown-zeros', description: 'Окно не ответило про разрешение, команда ядра «да», с микрофона нули: через 3 с остановка без сохранения и карточка',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    macMic: 'unknown', micLive: 'silent', systemAudioPermission: true,
  },
  'mic-unknown-ok': {
    id: 'mic-unknown-ok', label: 'mic-unknown-ok', description: 'Окно не ответило про разрешение, но микрофон шумит: запись идёт, доступ подтверждён звуком',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    macMic: 'unknown', micLive: 'ok',
  },
  'mic-unknown-blind': {
    id: 'mic-unknown-blind', label: 'mic-unknown-blind', description: 'Окно не ответило и слушать микрофон нечем: «Не удалось проверить микрофон», без речи после стопа карточка',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    macMic: 'unknown', live: 'none',
  },
  'onboarding-mac': {
    id: 'onboarding-mac', label: 'onboarding-mac', description: 'Первый запуск на macOS, доступ не спрашивали; на вопрос macOS человек отказывает',
    meetings: () => [], onboardingCompleted: false, modelsReady: false, recordingOnLoad: false, failing: false,
    micPromptMs: 1500, macMic: 'prompt-denied', systemAudioPermission: true,
  },
  'onboarding-mac-unknown': {
    id: 'onboarding-mac-unknown', label: 'onboarding-mac-unknown', description: 'Первый запуск на macOS, окно не отвечает про разрешение, команда ядра «да»: плитка не «Доступ есть»',
    meetings: () => [], onboardingCompleted: false, modelsReady: false, recordingOnLoad: false, failing: false,
    macMic: 'unknown',
  },
  'mic-core-refuses': {
    id: 'mic-core-refuses', label: 'mic-core-refuses', description: 'Проверка Aid прошла, но ядро не стартует без микрофона',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micCoreRefuses: true, systemAudioPermission: true,
  },
  'mic-silent': {
    id: 'mic-silent', label: 'mic-silent', description: 'Идёт запись, с микрофона нули, звук компьютера есть: через 15 с «Не слышу микрофон»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    micLive: 'silent',
  },
  'mic-lost': {
    id: 'mic-lost', label: 'mic-lost', description: 'Идёт запись, на 8-й секунде отключают микрофон (AirPods), ядро не переключилось',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    micLive: 'lost',
  },
  'model-downloading': {
    id: 'model-downloading', label: 'model-downloading', description: 'Модель распознавания ещё качается (около минуты)',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: false, recordingOnLoad: false, failing: false,
    downloadOnLoad: true,
  },
};

export const DEFAULT_SCENARIO: ScenarioId = 'full';
export const SCENARIO_STORAGE_KEY = 'meetily.mock.scenario';
/** Значение ?mock=off отключает заглушки до конца сессии вкладки. */
export const MOCK_OFF = 'off';

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Читает сценарий из адреса, иначе из sessionStorage, иначе берёт по умолчанию. */
export function resolveScenarioId(): ScenarioId | typeof MOCK_OFF {
  const fromUrl = new URLSearchParams(window.location.search).get('mock');
  const storage = safeSession();
  if (fromUrl) {
    if (fromUrl === MOCK_OFF || fromUrl in SCENARIOS) {
      storage?.setItem(SCENARIO_STORAGE_KEY, fromUrl);
      return fromUrl as ScenarioId | typeof MOCK_OFF;
    }
    console.warn(`[mock-tauri] Неизвестный сценарий "${fromUrl}", беру "${DEFAULT_SCENARIO}". Есть: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const saved = storage?.getItem(SCENARIO_STORAGE_KEY);
  if (saved && (saved === MOCK_OFF || saved in SCENARIOS)) return saved as ScenarioId | typeof MOCK_OFF;
  return DEFAULT_SCENARIO;
}

/** Переключает сценарий: сохраняет выбор и перезагружает текущую страницу. */
export function switchScenario(id: ScenarioId) {
  const storage = safeSession();
  storage?.setItem(SCENARIO_STORAGE_KEY, id);
  // флаги сценария (например, пройденный онбординг) сбрасываем
  storage?.removeItem(ONBOARDING_DONE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set('mock', id);
  window.location.href = url.toString();
}

/** В сценарии onboarding после «Завершить» приложение перезагружается; помним, что мастер пройден. */
export const ONBOARDING_DONE_KEY = 'meetily.mock.onboardingDone';
