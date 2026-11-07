// Оценка содержания записи: была ли осмысленная речь.
// Решение не зависит от длительности записи: считаем слова после чистки
// галлюцинаций и, если ядро сообщило длительность речевых сегментов, секунды речи.

/**
 * Не меньше 15 слов после чистки: пара фраз («да, хорошо, давай», «релиз в четверг»)
 * встречей не считается, а короткий созвон на полминуты уже набирает 15 слов.
 */
export const MIN_MEANINGFUL_WORDS = 15;
/**
 * И не меньше 10 секунд речи, если длительность известна: у каждого сегмента
 * с текстом ядро присылает duration (длину речевого сегмента после VAD).
 */
export const MIN_SPEECH_SECONDS = 10;
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
  /^субтитры(?=\s|$)/,
  /^редактор субтитров(?=\s|$)/,
  /^корректор(?=\s|$)/,
  /^спасибо за (просмотр|внимание)$/,
  /^(подписывайтесь|подпишитесь) на( наш)? канал(?=\s|$)/,
  /^ставьте лайки?(?=\s|$)/,
  /^до (новых встреч|скорой встречи)$/,
  /^(динамичная |спокойная |веселая |грустная )?музыка$/,
  /^(аплодисменты|смех|тишина|шум)$/,
  /^thanks? (you )?for watching(?=\s|$)/,
  /^thank you( so much| very much| all)?$/,
  /^thanks$/,
  /^you$/,
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
 * Показывать ли реплику в интерфейсе. Реплика целиком из галлюцинации на тишине
 * («Thank you.» на 0:00, «Продолжение следует...», «Субтитры …», «♪») скрывается
 * в транскрипте; в базе она остаётся как есть.
 */
export function isShownText(text: string | null | undefined): boolean {
  return !isHallucination(text ?? '');
}

export interface SpeechSegment {
  text: string;
  /** Длина речевого сегмента в секундах (transcript-update.duration), если известна. */
  duration?: number | null;
}

/**
 * Чистка реплик после записи:
 * - без букв («...», «♪», цифры шума) выбрасываются;
 * - галлюцинации из списка выше выбрасываются;
 * - одна и та же короткая фраза подряд («угу», «угу», «угу») остаётся один раз.
 */
export function cleanSegments<T extends SpeechSegment>(segments: T[]): T[] {
  const out: T[] = [];
  let prev = '';
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!LETTER.test(text)) continue;
    if (isHallucination(text)) continue;
    const n = normalize(text);
    if (n === prev && words(text).length <= SHORT_PHRASE_WORDS) continue;
    prev = n;
    out.push(seg);
  }
  return out;
}

export interface SpeechAmount {
  words: number;
  /** Секунды речи; null, если хотя бы у одного сегмента нет длительности. */
  seconds: number | null;
}

export function measureSpeech(segments: SpeechSegment[]): SpeechAmount {
  const clean = cleanSegments(segments);
  const count = clean.reduce((sum, s) => sum + words(s.text).length, 0);
  const known = clean.every((s) => typeof s.duration === 'number' && Number.isFinite(s.duration));
  const seconds = known ? clean.reduce((sum, s) => sum + (s.duration as number), 0) : null;
  return { words: count, seconds };
}

export function hasMeaningfulSpeech(segments: SpeechSegment[]): boolean {
  const { words: count, seconds } = measureSpeech(segments);
  return count >= MIN_MEANINGFUL_WORDS && (seconds === null || seconds >= MIN_SPEECH_SECONDS);
}

export type RecordingVerdict =
  /** Есть осмысленная речь: обычная встреча. */
  | 'speech'
  /** Речь была, но меньше порога: сохраняется обычной встречей (текст есть). */
  | 'too-little'
  /** Речи не было: не сохраняется (с возможностью вернуть). */
  | 'no-speech'
  /** Детектор насчитал 10+ с речи, а текста нет по явной причине: «Речь не распознана». */
  | 'unrecognized';

/** Явная причина, почему у услышанной речи нет текста. */
export type NoTextReason = 'no-model' | 'recognition-error' | 'recognition-cancelled';

/** «Речь не распознана» сохраняется, только если детектор насчитал столько секунд речи. */
export const MIN_DETECTOR_SECONDS_FOR_UNRECOGNIZED = 10;

export interface RecordingEvidence {
  /** Реплики (текст без подписи спикера и длительность сегмента). */
  segments: SpeechSegment[];
  /** Речевых сегментов по VAD ядра (transcription-progress, transcription-queue-complete). */
  vadSegments: number;
  /**
   * Секунды речи по детектору: сумма длительностей речевых сегментов, о которых
   * ядро сообщило длину. null, если длительности не пришли совсем.
   */
  detectorSeconds: number | null;
  /** Явная причина отсутствия текста или null. */
  noTextReason: NoTextReason | null;
}

export interface RecordingJudgement {
  verdict: RecordingVerdict;
  /** Почему так: одна фраза для журнала. */
  reason: string;
  words: number;
  speechSeconds: number | null;
  segmentsBefore: number;
  segmentsAfter: number;
}

/**
 * Итог записи:
 * - осмысленная речь (15+ слов и 10+ секунд речи, если известно) → 'speech';
 * - детектор насчитал 10+ с речи и есть явная причина отсутствия текста
 *   (нет модели, ошибка или отмена распознавания) → 'unrecognized';
 * - после чистки остались слова, но меньше порога → 'too-little';
 * - иначе → 'no-speech'. Нет событий детектора от ядра значит речи не было.
 */
export function judgeRecording(e: RecordingEvidence): RecordingJudgement {
  const { words: count, seconds } = measureSpeech(e.segments);
  const clean = cleanSegments(e.segments);
  const base = { words: count, speechSeconds: seconds, segmentsBefore: e.segments.length, segmentsAfter: clean.length };

  if (count >= MIN_MEANINGFUL_WORDS && (seconds === null || seconds >= MIN_SPEECH_SECONDS)) {
    return { ...base, verdict: 'speech', reason: `осмысленная речь: ${count} слов` };
  }
  const detector = e.vadSegments > 0 ? (e.detectorSeconds ?? 0) : 0;
  if (detector >= MIN_DETECTOR_SECONDS_FOR_UNRECOGNIZED && e.noTextReason) {
    return { ...base, verdict: 'unrecognized', reason: `детектор слышал ${detector.toFixed(1)} с речи, осмысленного текста нет: ${e.noTextReason}` };
  }
  if (count > 0) {
    const why = count < MIN_MEANINGFUL_WORDS ? `${count} слов меньше ${MIN_MEANINGFUL_WORDS}` : `речи ${seconds?.toFixed(1)} с меньше ${MIN_SPEECH_SECONDS}`;
    return { ...base, verdict: 'too-little', reason: why };
  }
  if (e.vadSegments === 0) return { ...base, verdict: 'no-speech', reason: 'детектор речи не сработал' };
  // Ядро присылает длину только у сегментов с текстом; без неё секунды неизвестны
  const heard = e.detectorSeconds === null ? `${e.vadSegments} сегм., длительность неизвестна` : `${detector.toFixed(1)} с`;
  if (!e.noTextReason) return { ...base, verdict: 'no-speech', reason: `детектор сработал (${heard}), текста нет, причины сбоя нет` };
  return { ...base, verdict: 'no-speech', reason: `детектор слышал только ${heard}, меньше ${MIN_DETECTOR_SECONDS_FOR_UNRECOGNIZED} с` };
}

/**
 * Кандидат на удаление: текста нет совсем. Окончательно решает уровень звука
 * (audio-level.ts): тишина удаляется, остальное уходит в «Не распознано».
 * 'too-little' (слова есть, но меньше порога) не удаляется: текст есть, это
 * обычная короткая встреча.
 */
export function isDiscarded(v: RecordingVerdict): boolean {
  return v === 'no-speech';
}

export function countWords(text: string): number {
  return words(text).length;
}

/** Сколько слов брать в название из содержания. */
const TITLE_WORDS = 6;

/**
 * Название из содержания для встречи с автоматическим названием: первые слова
 * первой осмысленной реплики (3+ слова после чистки галлюцинаций).
 * null, если такой реплики нет. Хранимое название не меняется.
 */
export function contentTitle(texts: string[]): string | null {
  const first = cleanSegments(texts.map((text) => ({ text }))).find((s) => words(s.text).length >= 3);
  if (!first) return null;
  const parts = first.text.trim().split(/\s+/);
  const picked = parts.slice(0, TITLE_WORDS).join(' ').replace(/[\s,.;:!?…–-]+$/u, '');
  const title = picked.charAt(0).toUpperCase() + picked.slice(1);
  return parts.length > TITLE_WORDS ? `${title}…` : title;
}
