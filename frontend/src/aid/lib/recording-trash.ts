// Корзина записей: папка «Корзина ShadeNotes» внутри папки записей.
//
// Корзина только для того, что удалил человек (meeting-trash.ts): автоматически
// (тишина, короткая запись) сюда ничего не уходит. Папка записи целиком (audio.mp4, metadata.json,
// transcripts.json) переносится в корзину, рядом кладётся trashed.json с датой
// переноса. Через TRASH_TTL_DAYS дней такая папка удаляется при запуске приложения.
// Открыть корзину можно в настройках.
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
export const TRASH_TTL_DAYS = 7;
const MARKER = 'trashed.json';
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrashMarker {
  trashedAt: number;
  name: string | null;
  /** Встреча, удалённая человеком (meeting-trash.ts): по ней восстанавливается. */
  meetingId?: string;
  /** Откуда перенесли: туда папка вернётся при восстановлении. */
  from?: string;
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
export async function moveRecordingToTrash(folder: string | null, name: string | null, meetingId?: string): Promise<string | null> {
  if (!folder) return null;
  try {
    const trash = trashPath(parentOf(folder));
    if (!(await exists(trash))) await mkdir(trash, { recursive: true });
    let target = joinPath(trash, baseName(folder));
    for (let n = 2; await exists(target); n++) target = joinPath(trash, `${baseName(folder)} ${n}`);
    await rename(folder, target);
    const marker: TrashMarker = { trashedAt: Date.now(), name, meetingId, from: folder };
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

async function recordingsRoot(): Promise<string | null> {
  try {
    const prefs = await invoke<{ save_folder?: string } | null>('get_recording_preferences');
    return prefs?.save_folder ?? null;
  } catch {
    return null;
  }
}

/** При запуске: удалить из корзины записи старше TRASH_TTL_DAYS дней. Возвращает число удалённых. */
export async function purgeTrash(root?: string | null): Promise<number> {
  const base = root ?? (await recordingsRoot());
  if (!base) return 0;
  const trash = trashPath(base);
  let removed = 0;
  try {
    if (!(await exists(trash))) return 0;
    const entries = (await readDir(trash)) ?? [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const dir = joinPath(trash, entry.name);
      let marker: TrashMarker | null = null;
      try {
        marker = JSON.parse(await readTextFile(joinPath(dir, MARKER))) as TrashMarker;
      } catch {
        continue; // без отметки о переносе не трогаем: папку положили сюда не мы
      }
      if (!marker?.trashedAt || Date.now() - marker.trashedAt < TRASH_TTL_DAYS * DAY_MS) continue;
      await remove(dir, { recursive: true });
      removed++;
      console.info(`[aid] Корзина: удалена запись старше ${TRASH_TTL_DAYS} дней: ${entry.name}`);
    }
  } catch (error) {
    console.warn('[aid] Корзину не удалось очистить, повторим при следующем запуске:', error);
  }
  return removed;
}

/** Открыть корзину в Finder (Проводнике). Папка создаётся, если её ещё нет. */
export async function openTrash(root: string): Promise<void> {
  const trash = trashPath(root);
  try {
    if (!(await exists(trash))) await mkdir(trash, { recursive: true });
  } catch {
    /* откроем как есть; если папки нет, система скажет */
  }
  // Команда ядра открывает адрес системной командой open (xdg-open, start): папку тоже
  await invoke('open_external_url', { url: trash });
}
