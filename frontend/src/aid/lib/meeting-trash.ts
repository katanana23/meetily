// Корзина встреч: то, что удалил человек, 7 дней можно вернуть.
//
// Удаление встречи (список, страница встречи, очистка пустых записей) не стирает её сразу:
// - встреча помечается «в корзине» (localStorage, свой ключ; ключи оригинала не трогаем)
//   и пропадает из списка, поиска и страницы встречи;
// - папка записи (звук, транскрипт, метаданные) переносится в «Корзину ShadeNotes» внутри
//   папки записей (recording-trash.ts). Если перенести нельзя (папка вне доступной области,
//   файла нет), файл остаётся на месте, встреча всё равно в корзине.
// Восстановление из фильтра «Корзина» возвращает папку на прежнее место и снимает пометку:
// строки базы (транскрипт, итоги, название) не удалялись, встреча возвращается целиком.
// Через TRASH_TTL_DAYS дней при запуске строки базы удаляются (api_delete_meeting), папку
// удаляет очистка корзины по метке trashed.json (purgeTrash).
'use client';

import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';
import { forgetDetails } from './meeting-details-cache';
import { moveRecordingToTrash, restoreRecordingFromTrash, TRASH_TTL_DAYS } from './recording-trash';

const KEY = 'aid.meetingTrash.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRASH_TTL_MS = TRASH_TTL_DAYS * DAY_MS;

export interface TrashedMeeting {
  id: string;
  title: string;
  /** Где лежала папка записи: туда она вернётся. */
  folder: string | null;
  /** Где папка сейчас, в корзине; null, если перенести не удалось. */
  trashedFolder: string | null;
  /** Когда удалили. */
  at: number;
}

function read(): TrashedMeeting[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

function write(next: TrashedMeeting[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно: пометка проживёт до перезагрузки */
  }
  cache = next;
  listeners.forEach((fn) => fn());
}

let cache: TrashedMeeting[] | null = null;

export function trashedMeetings(): TrashedMeeting[] {
  if (cache === null) cache = read();
  return cache;
}

export function isTrashed(id: string): boolean {
  return trashedMeetings().some((x) => x.id === id);
}

/** Подписка на изменения корзины (удалили, вернули, очистили). */
export function onTrashChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Сколько полных дней встреча ещё пролежит в корзине (не меньше 1, пока не удалена). */
export function daysLeft(m: TrashedMeeting, now = Date.now()): number {
  return Math.max(1, Math.ceil((m.at + TRASH_TTL_MS - now) / DAY_MS));
}

/** Удаление человеком: встреча и папка записи в корзину на 7 дней. */
export async function trashMeeting(id: string): Promise<void> {
  const meta = await invoke<{ title?: string; folder_path?: string | null } | null>('api_get_meeting_metadata', { meetingId: id });
  const folder = meta?.folder_path ?? null;
  const title = meta?.title ?? '';
  const trashedFolder = await moveRecordingToTrash(folder, title, id);
  write([{ id, title, folder, trashedFolder, at: Date.now() }, ...trashedMeetings().filter((x) => x.id !== id)]);
  forgetDetails(id);
  void Analytics.trackMeetingDeleted(id);
  console.info(`[aid] Встреча в корзине: ${id}; папка записи ${trashedFolder ? `перенесена в ${trashedFolder}` : `осталась на месте (${folder ?? 'нет папки'})`}`);
}

/** Вернуть из корзины: папку записи на прежнее место, встречу в список. */
export async function restoreMeeting(id: string): Promise<void> {
  const item = trashedMeetings().find((x) => x.id === id);
  if (!item) return;
  if (item.trashedFolder && item.folder) await restoreRecordingFromTrash(item.trashedFolder, item.folder);
  write(trashedMeetings().filter((x) => x.id !== id));
  console.info(`[aid] Встреча возвращена из корзины: ${id}`);
}

/** При запуске: встречи, пролежавшие в корзине 7 дней, удаляются из базы насовсем. */
let purging: Promise<void> | null = null;

export function purgeTrashedMeetings(now = Date.now()): Promise<void> {
  // Одна очистка за раз: повторный вызов (второй эффект в разработке) ждёт первую
  purging ??= purge(now).finally(() => {
    purging = null;
  });
  return purging;
}

async function purge(now: number): Promise<void> {
  const due = trashedMeetings().filter((x) => now - x.at >= TRASH_TTL_MS);
  if (!due.length) return;
  const gone = new Set<string>();
  for (const m of due) {
    try {
      await invoke('api_delete_meeting', { meetingId: m.id });
      forgetDetails(m.id);
      gone.add(m.id);
    } catch (error) {
      console.warn('[aid] Корзина: встречу не удалось удалить, повторим при следующем запуске:', m.id, error);
    }
  }
  if (gone.size) write(trashedMeetings().filter((x) => !gone.has(x.id)));
}
