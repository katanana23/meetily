// Форматирование дат, длительности и времени реплик.

export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  if (m > 0) return `${m} мин`;
  return `${total} с`;
}

/** Метка времени реплики от начала записи: 4:07 или 1:02:15 */
export function formatOffset(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Таймер записи: 04:07 или 1:02:15 */
export function formatTimer(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 3 октября 2026, 09:30 */
export function formatDateTime(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** Короткая дата для списка: «сегодня, 09:30», «вчера», «3 окт» */
export function formatShortDate(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `вчера, ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace(' г.', '');
}

export type DateGroup = 'today' | 'yesterday' | 'week' | 'earlier';

/** Группа списка встреч по дате: сегодня, вчера, последние 7 дней, раньше. */
export function dateGroup(value: string | Date | null | undefined, now = new Date()): DateGroup {
  const d = toDate(value);
  if (!d) return 'earlier';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'earlier';
}

/** Время встречи для строки в группе «Сегодня» и «Вчера»: дата уже в заголовке группы. */
export function formatTime(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
}

/** Число с разрядами по-русски: 33 434 (узкий неразрывный пробел). */
export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Автоматическое название из useRecordingStart: «Meeting ДД_ММ_ГГ_ЧЧ_ММ_СС».
const AUTO_TITLE = /^Meeting (\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/;

/**
 * Название для показа: автоматическое «Meeting 02_11_26_21_34_11» становится
 * «Встреча 2 ноября, 21:34». В базе название не меняется.
 */
export function displayTitle(title: string | null | undefined, now = new Date()): string {
  const raw = (title ?? '').trim();
  const m = raw.match(AUTO_TITLE);
  if (!m) return raw || 'Встреча без названия';
  const [, dd, mm, yy, hh, mi] = m;
  const d = new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi));
  if (Number.isNaN(d.getTime())) return raw;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace(' г.', '');
  return `Встреча ${date}, ${hh}:${mi}`;
}

/** Название придумано приложением, а не человеком. */
export function isAutoTitle(title: string | null | undefined): boolean {
  return AUTO_TITLE.test((title ?? '').trim());
}

/**
 * Название для показа: своё название человека (или название из итогов ИИ) как есть;
 * автоматическое «Meeting …» становится датой «Встреча 7 ноября, 09:40». Из текста
 * встречи название не берётся: первая реплика бывает мусором (песня с компьютера,
 * «Thank you.» на тишине). Второй аргумент остался для совместимости и не используется.
 */
export function shownTitle(title: string | null | undefined, _fromContent?: string | null): string {
  return displayTitle(title);
}

/** Текст для поля переименования: своё название как есть, автоматическое датой. */
export function editableTitle(title: string | null | undefined, _fromContent?: string | null): string {
  return displayTitle(title);
}

/** «12 мин · 340 слов» для строки списка. */
export function formatVolume(durationSec: number | null | undefined, words: number | null | undefined): string | null {
  const parts = [formatDuration(durationSec), words ? `${formatNumber(words)} ${plural(words, 'слово', 'слова', 'слов')}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
