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
  /** Речь была, но меньше порога: не сохраняется (с возможностью вернуть). */
  | 'too-little'
  /** Речи не было: не сохраняется (с возможностью вернуть). */
  | 'no-speech'
  /** Детектор речи слышал голос, но текста нет: сохранить как «Речь не распознана». */
  | 'unrecognized';

export interface RecordingEvidence {
  /** Реплики (текст без подписи спикера и длительность сегмента). */
  segments: SpeechSegment[];
  /** Речевых сегментов по VAD ядра (transcription-progress, transcription-queue-complete). */
  vadSegments: number;
  /** Были ошибки или предупреждения распознавания. */
  recognitionFailed: boolean;
}

/**
 * Итог записи:
 * - осмысленная речь (15+ слов и 10+ секунд речи, если известно) → 'speech';
 * - VAD слышал речь, а распознавание не дало ни одной реплики или сбоило → 'unrecognized'
 *   (звук ценен, такие записи не удаляются);
 * - после чистки остались слова, но меньше порога → 'too-little';
 * - иначе → 'no-speech': VAD молчал, или модель выдала только мусор на шум.
 */
export function judgeRecording(e: RecordingEvidence): RecordingVerdict {
  if (hasMeaningfulSpeech(e.segments)) return 'speech';
  const heard = e.vadSegments > 0;
  const noTextAtAll = e.segments.every((s) => !LETTER.test(s.text));
  if (heard && (noTextAtAll || e.recognitionFailed)) return 'unrecognized';
  return measureSpeech(e.segments).words > 0 ? 'too-little' : 'no-speech';
}

/** Не сохраняем: «Вернуть» доступно 10 секунд. */
export function isDiscarded(v: RecordingVerdict): boolean {
  return v === 'no-speech' || v === 'too-little';
}
