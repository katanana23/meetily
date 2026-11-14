// Корзина встреч: то, что удалил человек или убрала проверка моделью (мало содержания,
// content-check.ts), TRASH_TTL_DAYS дней (30, discard-policy.ts) можно вернуть.
//
// Источник правды — диск. Удаление встречи (список, страница встречи, очистка пустых
// записей) переносит папку записи в «Корзину Shade» и кладёт в неё метку trashed.json
// (id встречи, прежний путь, название, дата удаления; recording-trash.ts). localStorage
// здесь только кеш: он свой у каждого адреса интерфейса (dev на localhost и собранное
// приложение), а база и папки общие. При запуске список корзины собирается из меток
// на диске и сверяется с кешем (loadTrash).
//
// Если папку перенести нельзя (папка вне доступной области, файла нет), встреча всё равно
// в корзине, но пометка только в кеше: в корзине у неё подпись «Файл записи остался в папке».
//
// Восстановление возвращает папку на прежнее место и снимает метку: строки базы
// (транскрипт, итоги, название) не удалялись. Окончательное удаление — по сроку при запуске,
// «Удалить насовсем» или «Очистить корзину» — в одном месте (eraseEntry): строка базы
// (api_delete_meeting) и папка по одной метке. Analytics.trackMeetingDeleted только здесь.
'use client';

import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';
import { forgetDetails } from './meeting-details-cache';
import { listTrash, moveRecordingToTrash, removeTrashFolder, restoreRecordingFromTrash, TRASH_TTL_DAYS, type TrashEntry } from './recording-trash';

const KEY = 'shade.meetingTrash.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRASH_TTL_MS = TRASH_TTL_DAYS * DAY_MS;

export interface TrashedMeeting {
  id: string;
  title: string;
  /** Где лежала папка записи: туда она вернётся. */
  folder: string | null;
  /** Где папка сейчас, в корзине; null, если перенести не удалось (пометка только в кеше). */
  trashedFolder: string | null;
  /** Когда удалили. */
  at: number;
}

function readCache(): TrashedMeeting[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
let cache: TrashedMeeting[] | null = null;

function write(next: TrashedMeeting[]) {
  const sorted = [...next].sort((a, b) => b.at - a.at);
  try {
    localStorage.setItem(KEY, JSON.stringify(sorted));
  } catch {
    /* хранилище недоступно: метки на диске остаются источником правды */
  }
  cache = sorted;
  listeners.forEach((fn) => fn());
}

export function trashedMeetings(): TrashedMeeting[] {
  if (cache === null) cache = readCache();
  return cache;
}

export function isTrashed(id: string): boolean {
  return trashedMeetings().some((x) => x.id === id);
}

/** Подписка на изменения корзины (удалили, вернули, очистили, сверили с диском). */
export function onTrashChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Сколько полных дней встреча ещё пролежит в корзине (не меньше 1, пока не удалена). */
export function daysLeft(m: TrashedMeeting, now = Date.now()): number {
  return Math.max(1, Math.ceil((m.at + TRASH_TTL_MS - now) / DAY_MS));
}

const fromDisk = (e: TrashEntry): TrashedMeeting | null =>
  e.marker.meetingId
    ? { id: e.marker.meetingId, title: e.marker.title ?? e.marker.name ?? '', folder: e.marker.from ?? null, trashedFolder: e.dir, at: e.marker.trashedAt }
    : null;

let loading: Promise<TrashedMeeting[]> | null = null;

/**
 * Сверить кеш с метками на диске (один раз за запуск, дальше из памяти). Встречи с папкой
 * в корзине берутся с диска; пометки только из кеша остаются, если папку перенести не
 * удалось; пометки, чьей папки в корзине уже нет (вернули или стёрли из другого адреса
 * интерфейса), убираются. Корзину не прочитать: верим кешу.
 */
export function loadTrash(): Promise<TrashedMeeting[]> {
  loading ??= (async () => {
    const disk = await listTrash();
    if (disk === null) return trashedMeetings();
    const found = disk.map(fromDisk).filter((x): x is TrashedMeeting => x !== null);
    const ids = new Set(found.map((x) => x.id));
    const localOnly = trashedMeetings().filter((x) => !ids.has(x.id) && x.trashedFolder === null);
    const dropped = trashedMeetings().filter((x) => !ids.has(x.id) && x.trashedFolder !== null);
    if (dropped.length) console.info(`[shade] Корзина: в кеше ${dropped.length}, а на диске папок нет, убираю из кеша`);
    write([...found, ...localOnly]);
    return trashedMeetings();
  })();
  return loading;
}

/** В корзину (удалил человек или проверка моделью): встреча и папка записи на TRASH_TTL_DAYS дней. */
export async function trashMeeting(id: string): Promise<void> {
  const meta = await invoke<{ title?: string; folder_path?: string | null } | null>('api_get_meeting_metadata', { meetingId: id });
  const folder = meta?.folder_path ?? null;
  const title = meta?.title ?? '';
  const at = Date.now();
  const trashedFolder = await moveRecordingToTrash(folder, title, { id, title, at });
  write([{ id, title, folder, trashedFolder, at }, ...trashedMeetings().filter((x) => x.id !== id)]);
  forgetDetails(id);
  console.info(
    `[shade] Встреча в корзине: ${id}; папка записи ${trashedFolder ? `перенесена в ${trashedFolder}` : `осталась на месте (${folder ?? 'нет папки'}), пометка только в кеше`}`,
  );
}

/** Вернуть из корзины: папку записи на прежнее место, встречу в список. */
export async function restoreMeeting(id: string): Promise<void> {
  const item = trashedMeetings().find((x) => x.id === id);
  if (!item) return;
  if (item.trashedFolder && item.folder) await restoreRecordingFromTrash(item.trashedFolder, item.folder);
  write(trashedMeetings().filter((x) => x.id !== id));
  console.info(`[shade] Встреча возвращена из корзины: ${id}`);
}

/** Встречи уже нет в базе (удалили другим путём): удалять из базы нечего. */
async function goneFromDatabase(id: string): Promise<boolean> {
  try {
    const meta = await invoke<unknown>('api_get_meeting_metadata', { meetingId: id });
    return !meta;
  } catch {
    return true;
  }
}

/**
 * Окончательное удаление одной записи корзины: строка базы, затем папка. Если строку
 * удалить не вышло, а встреча в базе есть, папку не трогаем: повторим при следующем запуске.
 */
async function eraseEntry(id: string | null, dir: string | null): Promise<boolean> {
  if (id) {
    try {
      await invoke('api_delete_meeting', { meetingId: id });
    } catch (error) {
      if (!(await goneFromDatabase(id))) {
        console.warn('[shade] Корзина: встречу не удалось удалить из базы, повторим позже:', id, error);
        return false;
      }
    }
    forgetDetails(id);
    void Analytics.trackMeetingDeleted(id);
  }
  if (dir) {
    try {
      await removeTrashFolder(dir);
    } catch (error) {
      console.warn('[shade] Корзина: папку не удалось стереть, повторим позже:', dir, error);
    }
  }
  return true;
}

/** «Удалить насовсем» у одной встречи в корзине. */
export async function deleteForever(id: string): Promise<void> {
  const item = trashedMeetings().find((x) => x.id === id);
  if (!item) return;
  if (!(await eraseEntry(id, item.trashedFolder))) throw new Error('Не удалось удалить встречу из базы');
  write(trashedMeetings().filter((x) => x.id !== id));
  console.info(`[shade] Встреча удалена насовсем: ${id}`);
}

/** «Очистить корзину»: всё, что в ней, удаляется насовсем, включая старые папки без встречи. */
export async function emptyTrash(): Promise<number> {
  return erase(() => true);
}

let purging: Promise<number> | null = null;

/** При запуске: что пролежало в корзине TRASH_TTL_DAYS дней, удаляется насовсем (база и папка вместе). */
export function purgeExpiredTrash(now = Date.now()): Promise<number> {
  purging ??= (async () => {
    await loadTrash();
    return erase((at) => now - at >= TRASH_TTL_MS);
  })().finally(() => {
    purging = null;
  });
  return purging;
}

/** Стереть насовсем записи корзины, чей срок подходит под условие. Возвращает число удалённых. */
async function erase(due: (at: number) => boolean): Promise<number> {
  const disk = (await listTrash()) ?? [];
  const gone = new Set<string>();
  let count = 0;
  // Папки на диске: встреча с меткой или старая папка без встречи (тишина до #21)
  for (const e of disk) {
    if (!due(e.marker.trashedAt)) continue;
    if (await eraseEntry(e.marker.meetingId ?? null, e.dir)) {
      count++;
      if (e.marker.meetingId) gone.add(e.marker.meetingId);
    }
  }
  // Встречи, чью папку перенести не удалось: пометка только в кеше
  for (const m of trashedMeetings()) {
    if (gone.has(m.id) || m.trashedFolder !== null || !due(m.at)) continue;
    if (await eraseEntry(m.id, null)) {
      count++;
      gone.add(m.id);
    }
  }
  if (gone.size) write(trashedMeetings().filter((x) => !gone.has(x.id)));
  if (count) console.info(`[shade] Корзина: удалено насовсем ${count}`);
  return count;
}
