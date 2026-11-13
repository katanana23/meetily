// Оценка содержания записи: была ли распознанная речь.
// Решение не зависит от длительности записи и секунд речи: считаем только слова
// после чистки галлюцинаций. Есть речь — встреча сохраняется, любой длины.

/**
 * Речь есть, если после чистки галлюцинаций осталось столько слов: «Да, хорошо, давай»
 * уже встреча. Одно-два слова на тишине («Угу», «Алло?») чаще шум, чем разговор.
 */
export const MIN_MEANINGFUL_WORDS = 3;
/**
 * «Подвести итоги» показывается от стольких слов: из нескольких фраз модель заполнила бы
 * разделы заглушками «Ничего не отмечено». Порог здесь один на весь Aid; сама встреча
 * сохраняется и короче, а итоги, сделанные раньше, видны при любой длине.
 */
export const MIN_SUMMARY_WORDS = 80;
/** Короткая фраза: столько слов и меньше. Повтор такой фразы подряд считается сбоем распознавания. */
const SHORT_PHRASE_WORDS = 3;
/**
 * Зацикливание модели: короткая фраза повторена в реплике столько раз и больше
 * («Спасибо. Спасибо. Спасибо. Спасибо.»). Человек тоже повторяет: «Пять, пять, пять»
 * или «Да. Да. Да.» — три повтора речью остаются. Фраза из списка галлюцинаций
 * («Thank you. Thank you.») отбрасывается уже со второго повтора.
 */
const LOOP_REPEATS = 4;

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
  // Междометия-заполнители одни в реплике: модель без выбора языка (Parakeet) отдаёт их на
  // коротком куске шума или вдоха, в русской встрече они приходят английскими («Um», «Okay, so»).
  // Реплика целиком из таких слов не речь; внутри фразы они остаются
  /^((um+|uh+|hm+|mm+|mhm|ah+|oh+|er+|erm|eh+|ugh|okay so|ok so|so|э+|эм+|мм+|хм+)\s?)+$/,
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
  if (HALLUCINATIONS.some((re) => re.test(n))) return true;
  // Зацикливание: одна короткая фраза повторена внутри реплики (LOOP_REPEATS раз и больше;
  // фраза из списка галлюцинаций уже со второго раза). Запятые не делят: «пять, пять, пять»
  // одна фраза человека, а не повтор модели
  const parts = text.split(/[.!?…]+/).map(normalize).filter(Boolean);
  if (parts.length < 2 || new Set(parts).size !== 1 || words(parts[0]).length > SHORT_PHRASE_WORDS) return false;
  return parts.length >= LOOP_REPEATS || HALLUCINATIONS.some((re) => re.test(parts[0]));
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

/**
 * Пустая запись короче этого (секунды записи без пауз) — случайный старт: тихо отменяем,
 * без предупреждения и «Проверить звук».
 */
export const SHORT_EMPTY_SECONDS = 10;

export type RecordingVerdict =
  /** Есть распознанная речь (3+ слова после чистки): обычная встреча любой длины. */
  | 'speech'
  /** Короткая пустая запись (до SHORT_EMPTY_SECONDS): случайный старт, ничего не сохраняем. */
  | 'cancelled'
  /** Длиннее, а детектор речи не сработал: ничего не записалось, возможно, проблема со звуком. */
  | 'no-speech'
  /** Детектор слышал речь, а текста нет: встреча не создаётся, карточка «Речь не распознана». */
  | 'unrecognized';

/** Явная причина, почему у услышанной речи нет текста. */
export type NoTextReason = 'no-model' | 'recognition-error' | 'recognition-cancelled';

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
  /** Длительность записи без пауз, секунды; null, если неизвестна (тогда короткой не считаем). */
  durationSec?: number | null;
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
 * Итог записи — по контексту, чтобы «Проверить звук» и предупреждение были только там,
 * где есть основание подозревать звук:
 * - 3+ слова после чистки галлюцинаций → 'speech', сохраняем (секунды и длина не важны);
 * - пустая и короче SHORT_EMPTY_SECONDS → 'cancelled': случайный старт, тихо отменяем;
 * - длиннее, детектор речи не сработал → 'no-speech': ничего не записалось, проверьте звук;
 * - детектор слышал речь, текста нет → 'unrecognized': встреча не создаётся, нейтральная карточка
 *   (звук был, не справилось распознавание; noTextReason уточняет причину в журнале).
 */
export function judgeRecording(e: RecordingEvidence): RecordingJudgement {
  const { words: count, seconds } = measureSpeech(e.segments);
  const clean = cleanSegments(e.segments);
  const base = { words: count, speechSeconds: seconds, segmentsBefore: e.segments.length, segmentsAfter: clean.length };

  if (count >= MIN_MEANINGFUL_WORDS) return { ...base, verdict: 'speech', reason: `распознанная речь: ${count} слов` };
  const heard = e.vadSegments === 0 ? 'детектор речи не сработал' : `детектор сработал (${e.vadSegments} сегм.)`;
  if (typeof e.durationSec === 'number' && e.durationSec < SHORT_EMPTY_SECONDS) {
    return { ...base, verdict: 'cancelled', reason: `пустая запись ${e.durationSec.toFixed(1)} с короче ${SHORT_EMPTY_SECONDS} с: случайный старт` };
  }
  if (e.vadSegments === 0) return { ...base, verdict: 'no-speech', reason: `${heard}, слов ${count}` };
  return { ...base, verdict: 'unrecognized', reason: `${heard}, слов ${count} меньше ${MIN_MEANINGFUL_WORDS}${e.noTextReason ? `, причина: ${e.noTextReason}` : ''}` };
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
