// Настоящая длительность записи: длина файла звука audio.mp4 в папке записи.
//
// Ядро не хранит длительность записи: в metadata.json и в базе есть только конец последней
// реплики (duration_seconds в metadata.json тоже он). Если человек говорил без пауз, а
// реплика одна, конец реплики меньше записи в разы: запись на 41 с показывалась как «8 с».
// Длина файла звука честная: в нём вся запись без пауз (пауза не пишет звук).
//
// Файл не читается целиком: идём по заголовкам блоков MP4 (по 8–16 байт), находим moov →
// mvhd и берём из него timescale и duration. Блок moov у ffmpeg обычно в конце файла, за
// mdat, поэтому mdat перепрыгиваем по его размеру. Нет файла, нет доступа или формат
// другой: null, и строка показывает конец последней реплики, как раньше.
'use client';

import { open, SeekMode, type FileHandle } from '@tauri-apps/plugin-fs';

/** Результат по папке: файл записи после сохранения не меняется. */
const cache = new Map<string, Promise<number | null>>();

const MAX_BOXES = 64;

async function readExact(file: FileHandle, at: number, size: number): Promise<DataView | null> {
  await file.seek(at, SeekMode.Start);
  const buf = new Uint8Array(size);
  let got = 0;
  while (got < size) {
    const chunk = new Uint8Array(size - got);
    const n = await file.read(chunk);
    if (!n) return null;
    buf.set(chunk.subarray(0, n), got);
    got += n;
  }
  return new DataView(buf.buffer);
}

const fourcc = (v: DataView, at: number) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

/** Заголовок блока: тип, где начинаются данные и где блок кончается. */
async function box(file: FileHandle, at: number, end: number): Promise<{ type: string; body: number; next: number } | null> {
  if (at + 8 > end) return null;
  const h = await readExact(file, at, 8);
  if (!h) return null;
  let size = h.getUint32(0);
  const type = fourcc(h, 4);
  let body = at + 8;
  if (size === 1) {
    const big = await readExact(file, at + 8, 8);
    if (!big) return null;
    size = Number(big.getBigUint64(0));
    body = at + 16;
  } else if (size === 0) {
    size = end - at;
  }
  if (size < body - at) return null;
  return { type, body, next: at + size };
}

/** Секунды из mvhd или null. */
async function mp4Duration(path: string): Promise<number | null> {
  const file = await open(path, { read: true });
  try {
    const end = await file.seek(0, SeekMode.End);
    let at = 0;
    for (let i = 0; i < MAX_BOXES && at < end; i++) {
      const top = await box(file, at, end);
      if (!top) return null;
      if (top.type === 'moov') {
        let inner = top.body;
        for (let j = 0; j < MAX_BOXES && inner < top.next; j++) {
          const child = await box(file, inner, top.next);
          if (!child) return null;
          if (child.type === 'mvhd') {
            const head = await readExact(file, child.body, 32);
            if (!head) return null;
            const version = head.getUint8(0);
            // v0: создание 4, изменение 4, timescale 4, duration 4; v1: 8, 8, 4, 8
            const timescale = version === 1 ? head.getUint32(20) : head.getUint32(12);
            const duration = version === 1 ? Number(head.getBigUint64(24)) : head.getUint32(16);
            return timescale > 0 && duration > 0 ? duration / timescale : null;
          }
          inner = child.next;
        }
        return null;
      }
      at = top.next;
    }
    return null;
  } finally {
    await file.close().catch(() => undefined);
  }
}

/** Длительность записи в секундах по файлу звука в папке; null, если узнать нельзя. */
export function recordedSeconds(folder: string | null | undefined): Promise<number | null> {
  if (!folder) return Promise.resolve(null);
  const hit = cache.get(folder);
  if (hit) return hit;
  const result = mp4Duration(`${folder.replace(/\/+$/, '')}/audio.mp4`).catch(() => null);
  cache.set(folder, result);
  // Неудачу не запоминаем: файл мог ещё дописываться
  void result.then((v) => v === null && cache.delete(folder));
  return result;
}

/** Длительность для показа: файл звука, иначе конец последней реплики. */
export function pickDuration(recorded: number | null, lastLineEnd: number | null | undefined): number | null {
  if (typeof recorded === 'number' && Number.isFinite(recorded) && recorded > 0) return recorded;
  return typeof lastLineEnd === 'number' ? lastLineEnd : null;
}
