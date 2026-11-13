// Корзина записей: папка «Корзина ShadeNotes» внутри папки записей.
//
// Корзина для того, что удалил человек, и для сохранённых встреч без содержания по проверке
// моделью (meeting-trash.ts, content-check.ts); пустые записи (0..2 значимых слова) не
// сохраняются и сюда не попадают. Папка записи целиком (audio.mp4, metadata.json,
// transcripts.json) переносится в корзину, рядом кладётся trashed.json с датой
// переноса. Через TRASH_TTL_DAYS дней такая папка удаляется при запуске приложения
// вместе со строкой базы (meeting-trash.ts, purgeExpiredTrash).
//
// Доступ к папке записей даёт право fs:scope в tauri.conf.json (отдельный коммит
// по разрешению Айдына): папка записей по умолчанию ($VIDEO на macOS, $AUDIO на
// Windows, $DOCUMENT на Linux). Если папку записей сменили на свою, плагин fs туда
// не пустит: файл тогда остаётся на месте, ничего не удаляется. Имена без точки
// в начале: шаблон области ** по умолчанию не всегда совпадает со скрытыми.
'use client';

import { invoke } from '@tauri-apps/api/core';
import { exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';

/** Путь внутри папки: тот же разделитель, что в пути папки (Windows или Unix). */
export function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.endsWith(sep) ? folder + name : folder + sep + name;
}

export const TRASH_DIR_NAME = 'Корзина ShadeNotes';
/** Срок корзины: discard-policy.ts. */
export { TRASH_TTL_DAYS } from './discard-policy';
const MARKER = 'trashed.json';

/**
 * Метка trashed.json в папке корзины: источник правды о том, что лежит в корзине.
 * localStorage в meeting-trash.ts только кеш: он свой у каждого адреса интерфейса
 * (dev и собранное приложение), а база и папки общие.
 */
export interface TrashMarker {
  trashedAt: number;
  name: string | null;
  /** Встреча, удалённая человеком (meeting-trash.ts): по ней восстанавливается и удаляется из базы. */
  meetingId?: string;
  /** Откуда перенесли: туда папка вернётся при восстановлении. */
  from?: string;
  /** Название встречи для списка корзины. */
  title?: string;
}

export interface TrashEntry {
  /** Папка в корзине. */
  dir: string;
  marker: TrashMarker;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i > 0 ? trimmed.slice(0, i) : trimmed;
}

function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(i + 1);
}

export function trashPath(recordingsRoot: string): string {
  return joinPath(recordingsRoot, TRASH_DIR_NAME);
}

/**
 * Перенести папку записи в корзину. Возвращает новый путь или null, если перенос
 * не удался (папка вне доступной области, файла нет): тогда запись остаётся на месте.
 */
export async function moveRecordingToTrash(
  folder: string | null,
  name: string | null,
  meeting?: { id: string; title: string; at: number },
): Promise<string | null> {
  if (!folder) return null;
  try {
    const trash = trashPath(parentOf(folder));
    if (!(await exists(trash))) await mkdir(trash, { recursive: true });
    let target = joinPath(trash, baseName(folder));
    for (let n = 2; await exists(target); n++) target = joinPath(trash, `${baseName(folder)} ${n}`);
    await rename(folder, target);
    const marker: TrashMarker = meeting
      ? { trashedAt: meeting.at, name, meetingId: meeting.id, from: folder, title: meeting.title }
      : { trashedAt: Date.now(), name };
    await writeTextFile(joinPath(target, MARKER), JSON.stringify(marker));
    return target;
  } catch (error) {
    console.warn('[aid] Не удалось перенести запись в корзину, файл остаётся на месте:', folder, error);
    return null;
  }
}

/**
 * Вернуть папку записи из корзины на прежнее место. Бросает ошибку, если не вышло:
 * тогда встреча остаётся в корзине, а не возвращается без звука (папку удалила бы очистка).
 */
export async function restoreRecordingFromTrash(trashed: string, folder: string): Promise<void> {
  if (await exists(folder)) throw new Error(`На прежнем месте уже есть папка: ${folder}`);
  await rename(trashed, folder);
  try {
    await remove(joinPath(folder, MARKER));
  } catch {
    /* метка без папки корзины ничего не значит */
  }
}

export async function recordingsRoot(): Promise<string | null> {
  try {
    const prefs = await invoke<{ save_folder?: string } | null>('get_recording_preferences');
    return prefs?.save_folder ?? null;
  } catch {
    return null;
  }
}

/**
 * Что лежит в корзине: папки с меткой trashed.json. null, если корзину прочитать не
 * удалось (папка записей неизвестна или вне доступной области): тогда верим кешу.
 */
export async function listTrash(root?: string | null): Promise<TrashEntry[] | null> {
  const base = root ?? (await recordingsRoot());
  if (!base) return null;
  const trash = trashPath(base);
  try {
    if (!(await exists(trash))) return [];
    const entries = (await readDir(trash)) ?? [];
    const out: TrashEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const dir = joinPath(trash, entry.name);
      try {
        const marker = JSON.parse(await readTextFile(joinPath(dir, MARKER))) as TrashMarker;
        if (marker?.trashedAt) out.push({ dir, marker });
      } catch {
        // без метки не наше: папку положили сюда не мы
      }
    }
    return out;
  } catch (error) {
    console.warn('[aid] Корзину не удалось прочитать:', error);
    return null;
  }
}

/** Стереть папку из корзины насовсем. */
export async function removeTrashFolder(dir: string): Promise<void> {
  await remove(dir, { recursive: true });
}
