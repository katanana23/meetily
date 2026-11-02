// Оценка содержания записи: была ли осмысленная речь.
// Решение не зависит от длительности: короткая запись с одной внятной фразой
// сохраняется, а длинная тишина с «галлюцинациями» распознавания нет.

/** Реплика считается осмысленной, если в ней не меньше 3 слов («созвон переносим на пятницу»). */
export const MIN_WORDS_IN_SEGMENT = 3;
/** Или если в сумме набралось 5 слов: несколько коротких ответов («да», «согласен»…) тоже разговор. */
export const MIN_TOTAL_WORDS = 5;
/** Короткая фраза: столько слов и меньше. Повтор такой фразы подряд считается сбоем распознавания. */
const SHORT_PHRASE_WORDS = 3;

/**
 * Фразы, которые модели распознавания (особенно Whisper) выдают на тишине и шуме:
 * они пришли из субтитров, на которых модель обучалась. Сравнение без учёта
 * регистра, знаков препинания и «ё». Чтобы добавить фразу, допишите строку.
 * Граница слова пишется (?=\s|$): \b в JavaScript не понимает кириллицу.
 */
export const HALLUCINATIONS: RegExp[] = [
  /^продолжение следует$/,
  /^субтитры (сделал|сделаны|создавал|подготовил|делал|подогнал)(?=\s|$)/,
  /^редактор субтитров(?=\s|$)/,
  /^корректор(?=\s|$)/,
  /^спасибо за (просмотр|внимание)$/,
  /^(подписывайтесь|подпишитесь) на( наш)? канал(?=\s|$)/,
  /^ставьте лайки?(?=\s|$)/,
  /^до (новых встреч|скорой встречи)$/,
  /^(динамичная |спокойная |веселая |грустная )?музыка$/,
  /^(аплодисменты|смех|тишина|шум)$/,
  /^thanks? (you )?for watching(?=\s|$)/,
  /^thank you$/,
  /^subtitles? by(?=\s|$)/,
  /^(music|applause|silence|laughter|blank audio|no speech)$/,
  /amara\.org/,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\[\](){}♪♫*«»"'.,!?…:;–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LETTER = /\p{L}/u;

function words(text: string): string[] {
  return normalize(text).split(' ').filter((w) => LETTER.test(w));
}

export function isHallucination(text: string): boolean {
  const n = normalize(text);
  if (!n) return true;
  // «Спасибо. Спасибо. Спасибо.» и подобное: фраза повторена внутри реплики
  const parts = text.split(/[.!?…]+/).map(normalize).filter(Boolean);
  const unique = new Set(parts);
  if (parts.length > 1 && unique.size === 1 && words(parts[0]).length <= SHORT_PHRASE_WORDS) return true;
  return HALLUCINATIONS.some((re) => re.test(n));
}

/**
 * Чистка реплик после записи:
 * - без букв («...», «♪», цифры шума) выбрасываются;
 * - галлюцинации из списка выше выбрасываются;
 * - одна и та же короткая фраза подряд («угу», «угу», «угу») остаётся один раз.
 */
export function cleanSegments(texts: string[]): string[] {
  const out: string[] = [];
  let prev = '';
  for (const raw of texts) {
    const text = raw.trim();
    if (!LETTER.test(text)) continue;
    if (isHallucination(text)) continue;
    const n = normalize(text);
    if (n === prev && words(text).length <= SHORT_PHRASE_WORDS) continue;
    prev = n;
    out.push(text);
  }
  return out;
}

export function hasMeaningfulSpeech(texts: string[]): boolean {
  const clean = cleanSegments(texts);
  const counts = clean.map((t) => words(t).length);
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.some((c) => c >= MIN_WORDS_IN_SEGMENT) || total >= MIN_TOTAL_WORDS;
}

export type RecordingVerdict =
  /** Есть осмысленная речь: обычная встреча. */
  | 'speech'
  /** Речи не было: встреча не сохраняется (с возможностью вернуть). */
  | 'no-speech'
  /** Детектор речи слышал голос, но текста нет: сохранить как «Речь не распознана». */
  | 'unrecognized';

export interface RecordingEvidence {
  /** Тексты реплик (без подписи спикера). */
  texts: string[];
  /** Речевых сегментов по VAD ядра (transcription-progress, transcription-queue-complete). */
  vadSegments: number;
  /** Были ошибки или предупреждения распознавания. */
  recognitionFailed: boolean;
}

/**
 * Итог записи:
 * - осмысленная речь есть → 'speech';
 * - VAD слышал речь, а распознавание не дало ни одной реплики или сбоило → 'unrecognized'
 *   (звук ценен, такие записи не удаляются);
 * - иначе → 'no-speech': VAD молчал, или модель выдала только мусор на шум.
 */
export function judgeRecording(e: RecordingEvidence): RecordingVerdict {
  if (hasMeaningfulSpeech(e.texts)) return 'speech';
  const heard = e.vadSegments > 0;
  const noTextAtAll = e.texts.every((t) => !LETTER.test(t));
  if (heard && (noTextAtAll || e.recognitionFailed)) return 'unrecognized';
  return 'no-speech';
}
