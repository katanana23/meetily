// Слой 1 против пустых записей: правила, мгновенно при «Остановить».
//
// Считаются уникальные значимые слова реплик. Не значимы:
// - галлюцинации модели на тишине (isHallucination и список HALLUCINATIONS в speech.ts);
// - междометия и заполнители («э», «ну», «ага», «um», «okay»);
// - проверочные фразы («раз-раз», «проверка», «алло», «слышно меня», «тест»);
// - счёт подряд: от COUNTING_RUN числительных («раз, два, три», «1 2 3»), в том числе
//   через границу реплик;
// - реплика из одного повторённого слова («алло, алло», «да. да. да.»).
// Числа и даты вне счёта значимы: «15 декабря в 10 утра».
//
// Функция чистая: без состояния, времени и вызовов ядра. Тесты: content-rules.test.ts.

import { CHECK_MAX_WORDS, COUNTING_RUN, EMPTY_MAX_WORDS } from './discard-policy';
import { isHallucination, normalize } from './speech';

/**
 * Междометия и заполнители: в любой реплике не считаются. Сравнение после normalize
 * (нижний регистр, «ё» как «е»). Чтобы добавить слово, допишите его сюда или в FILLER_PATTERNS.
 */
const FILLERS = new Set([
  // русские
  'а', 'ой', 'ах', 'ох', 'эх', 'ух', 'ай', 'ага', 'угу', 'ну', 'вот', 'да', 'ок', 'окей',
  'ладно', 'типа', 'короче', 'так', 'блин', 'значит',
  // английские: Parakeet без выбора языка отдаёт их и на русской встрече
  'so', 'ok', 'okay', 'yeah', 'yep', 'well', 'like', 'right', 'mhm', 'erm', 'ugh', 'huh',
]);
/** Растянутые междометия: «эээ», «ммм», «хмм», «uhhh». */
const FILLER_PATTERNS = [/^э+м*$/, /^м+$/, /^х+м+$/, /^(um+|uh+|hm+|mm+|ah+|oh+|er+|eh+)$/];

/**
 * Проверочные фразы: вырезаются из реплики целиком. Работают по тексту после normalize,
 * граница слова (?=\s|$): \b в JavaScript не понимает кириллицу.
 */
const CHECK_PHRASES: RegExp[] = [
  /(^|\s)раз(\s+раз)+(?=\s|$)/g,
  /(^|\s)(проверка|проверочка|проверяю|проверяем)(\s+(связи|звука|микрофона|записи))?(?=\s|$)/g,
  /(^|\s)(алло|ало|алле)(?=\s|$)/g,
  /(^|\s)(меня\s+)?слышно(\s+меня)?(?=\s|$)/g,
  /(^|\s)((вы|ты)\s+)?(меня\s+)?слыш(ите|ишь|ать)(\s+меня)?(?=\s|$)/g,
  /(^|\s)(тест|тестирую|тестируем|тестовая\s+запись)(?=\s|$)/g,
  /(^|\s)(test|testing|hello|mic\s+check|check(\s+check)+|can\s+you\s+hear\s+me|(one\s+)?two\s+three\s+testing)(?=\s|$)/g,
];

/** Числительные для поиска счёта: цифры и слова от нуля до ста. */
const NUMBER_WORDS = new Set([
  'ноль', 'раз', 'один', 'одна', 'два', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять',
  'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать',
  'девятнадцать', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто', 'сто',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
]);

const WORDLIKE = /[\p{L}\p{N}]/u;

const isFiller = (w: string) => FILLERS.has(w) || FILLER_PATTERNS.some((re) => re.test(w));
const isNumeral = (w: string) => /^\d+$/.test(w) || NUMBER_WORDS.has(w);

/** Слова одной реплики без проверочных фраз и заполнителей. */
function segmentTokens(text: string): string[] {
  let n = normalize(text);
  for (const re of CHECK_PHRASES) n = n.replace(re, ' ');
  const tokens = n.split(/\s+/).filter((w) => WORDLIKE.test(w) && !isFiller(w));
  // «Алло, алло», «Да. Да. Да.», «Спасибо, спасибо»: одно слово повторено — не речь
  if (tokens.length >= 2 && tokens.every((w) => w === tokens[0])) return [];
  return tokens;
}

/** Убрать счёт: отрезки из COUNTING_RUN числительных подряд и длиннее. */
function dropCounting(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumeral(tokens[i])) {
      out.push(tokens[i++]);
      continue;
    }
    let j = i;
    while (j < tokens.length && isNumeral(tokens[j])) j++;
    if (j - i < COUNTING_RUN) out.push(...tokens.slice(i, j));
    i = j;
  }
  return out;
}

/** Уникальные значимые слова реплик, в порядке появления. */
export function meaningfulWords(texts: string[]): string[] {
  const tokens = texts.filter((text) => text.trim() && !isHallucination(text)).flatMap(segmentTokens);
  return [...new Set(dropCounting(tokens))];
}

export type ContentTier =
  /** 0..EMPTY_MAX_WORDS значимых слов: запись не сохраняется. */
  | 'empty'
  /** До CHECK_MAX_WORDS: сохраняется и уходит на проверку моделью (content-check.ts). */
  | 'check'
  /** Больше CHECK_MAX_WORDS: обычное сохранение без проверки. */
  | 'keep';

export function contentTier(count: number): ContentTier {
  if (count <= EMPTY_MAX_WORDS) return 'empty';
  if (count <= CHECK_MAX_WORDS) return 'check';
  return 'keep';
}

export interface ContentAssessment {
  /** Уникальные значимые слова. */
  words: string[];
  count: number;
  tier: ContentTier;
}

export function assessContent(texts: string[]): ContentAssessment {
  const words = meaningfulWords(texts);
  return { words, count: words.length, tier: contentTier(words.length) };
}
