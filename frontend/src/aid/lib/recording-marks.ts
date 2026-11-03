// Пометки записей Aid: что не сохранять, что показывать в разделе «Не распознано»,
// что пользователь оставил сам. Хранится в localStorage под своим ключом
// (ключи оригинала не трогаем); запись опознаётся по папке записи (folder_path
// в метаданных встречи), запасной признак: имя встречи от ядра.
//
// Зачем: решение «не сохранять» принимается после стопа, а встреча могла попасть
// в базу другим путём. Пока пометка «удалить» жива, такая встреча скрыта из списка
// и недоступна по прямому адресу. Удаляется она после 10 секунд отсчёта карточки
// «Тишина» (отсчёт стоит, пока пользователь на ней) или при следующем запуске,
// если приложение закрыли раньше. «Вернуть» снимает пометку.
'use client';

import { invoke } from '@tauri-apps/api/core';

const KEY = 'aid.recordingMarks.v1';
/** Сколько хранить пометку «удалить» после срока: на случай, если встреча появится в базе позже. */
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiscardMark {
  folder: string | null;
  name: string | null;
  /** Когда принято решение. */
  at: number;
  /** До этого времени можно «Вернуть»; после встреча удаляется. */
  until: number;
}

interface Marks {
  discarded: DiscardMark[];
  /** Папки записей, где детектор слышал речь, а текста нет («Не распознано»). */
  unrecognized: string[];
  /** Папки записей без текста, которые пользователь вернул сам: показываются в общем списке. */
  kept: string[];
  /** Однократный вопрос «Удалить N пустых записей?» уже задан. */
  emptyCleanupAsked: boolean;
}

const EMPTY: Marks = { discarded: [], unrecognized: [], kept: [], emptyCleanupAsked: false };

function read(): Marks {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as Partial<Marks>) : {};
    return {
      discarded: Array.isArray(value.discarded) ? value.discarded : [],
      unrecognized: Array.isArray(value.unrecognized) ? value.unrecognized : [],
      kept: Array.isArray(value.kept) ? value.kept : [],
      emptyCleanupAsked: Boolean(value.emptyCleanupAsked),
    };
  } catch {
    return EMPTY;
  }
}

function write(next: Marks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно: пометка проживёт только до перезагрузки */
  }
  window.dispatchEvent(new Event(KEY));
}

const uniq = (list: string[]) => [...new Set(list)];

/** Подписка на изменения пометок (список перечитывает скрытые встречи). */
export function onMarksChange(cb: () => void) {
  window.addEventListener(KEY, cb);
  return () => window.removeEventListener(KEY, cb);
}

export function markDiscarded(folder: string | null, name: string | null, windowMs: number): DiscardMark {
  const now = Date.now();
  const mark: DiscardMark = { folder, name, at: now, until: now + windowMs };
  const m = read();
  write({ ...m, discarded: [...m.discarded.filter((d) => !(folder && d.folder === folder)), mark] });
  return mark;
}

/**
 * Пометки, у которых сейчас открыта карточка «Тишина»: срок удаления ведёт карточка
 * (её отсчёт встаёт на паузу), поэтому перечитывание списка их не удаляет. Только
 * в памяти: после перезапуска набор пуст и просроченные пометки удаляются как обычно.
 */
const live = new Set<string>();
const liveKey = (folder: string | null, name: string | null) => (folder ? `f:${folder}` : `n:${name ?? ''}`);

export function setDiscardLive(folder: string | null, name: string | null, on: boolean) {
  if (on) live.add(liveKey(folder, name));
  else live.delete(liveKey(folder, name));
}

/** Отсчёт карточки закончился: пометка становится просроченной сейчас же. */
export function expireDiscard(folder: string | null, name: string | null) {
  const now = Date.now();
  const m = read();
  write({
    ...m,
    discarded: m.discarded.map((d) => ((folder ? d.folder === folder : !d.folder && d.name === name) ? { ...d, until: Math.min(d.until, now) } : d)),
  });
}

/** «Вернуть»: снять пометку и запомнить, что запись оставлена намеренно. */
export function keepRecording(folder: string | null) {
  const m = read();
  write({
    ...m,
    discarded: m.discarded.filter((d) => d.folder !== folder),
    kept: folder ? uniq([...m.kept, folder]) : m.kept,
  });
}

export function markUnrecognized(folder: string | null) {
  if (!folder) return;
  const m = read();
  write({ ...m, unrecognized: uniq([...m.unrecognized, folder]) });
}

export function setEmptyCleanupAsked() {
  write({ ...read(), emptyCleanupAsked: true });
}

export function marksSnapshot(): Readonly<Marks> {
  return read();
}

interface MeetingRef {
  title?: string | null;
  folder_path?: string | null;
}

function findMark(m: MeetingRef, marks: Marks = read()): DiscardMark | undefined {
  return marks.discarded.find(
    (d) => (d.folder && m.folder_path && d.folder === m.folder_path) || (!d.folder && d.name && m.title === d.name),
  );
}

/** Встреча помечена «не сохранять»: скрыть из списка и не открывать по адресу. */
export function isDiscarded(m: MeetingRef): boolean {
  return Boolean(findMark(m));
}

export function isUnrecognized(m: MeetingRef): boolean {
  return Boolean(m.folder_path && read().unrecognized.includes(m.folder_path));
}

export function isKept(m: MeetingRef): boolean {
  return Boolean(m.folder_path && read().kept.includes(m.folder_path));
}

/**
 * Удаляет встречи, у которых истекло окно «Вернуть», и забывает старые пометки.
 * Вызывается после отсчёта карточки «Тишина» и при запуске; пометки с открытой
 * карточкой пропускает. Возвращает число удалённых.
 */
export async function purgeDiscarded(): Promise<number> {
  const marks = read();
  const now = Date.now();
  const due = marks.discarded.filter((d) => d.until <= now && !live.has(liveKey(d.folder, d.name)));
  if (!due.length) return 0;
  let removed = 0;
  try {
    const list = await invoke<Array<{ id: string; title: string }>>('api_get_meetings');
    for (const meeting of list) {
      const meta = await invoke<{ folder_path?: string | null; title?: string }>('api_get_meeting_metadata', { meetingId: meeting.id }).catch(
        () => null,
      );
      const ref = { title: meeting.title, folder_path: meta?.folder_path ?? null };
      const mark = findMark(ref, { ...marks, discarded: due });
      if (!mark) continue;
      await invoke('api_delete_meeting', { meetingId: meeting.id });
      removed++;
      console.info(`[aid] Удалена пустая запись после окна «Вернуть»: ${meeting.id}`);
    }
  } catch (error) {
    console.warn('[aid] Не удалось удалить пустые записи, повторим при следующем запуске:', error);
    return removed;
  }
  // Пометки держим неделю: если встреча появится в базе позже, она всё равно будет скрыта и удалена.
  // Пишем только при изменениях: запись будит список, а лишние перечитывания нагружают ядро
  const latest = read();
  const kept = latest.discarded.filter((d) => now - d.until < TOMBSTONE_TTL_MS);
  if (removed > 0 || kept.length !== latest.discarded.length) write({ ...latest, discarded: kept });
  return removed;
}
