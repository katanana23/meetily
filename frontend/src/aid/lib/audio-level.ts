// Уровень звука записи: проверка перед тем, как выбросить запись без текста.
//
// Текст пуст не только в тишине: если распознавание сломалось целиком, слов и
// секунд речи тоже 0, а встреча настоящая. Поэтому решение «удалить» принимается
// по самому звуку: файл audio.mp4 из папки записи читается командой ядра
// read_audio_file (её же использует плеер оригинала, useAudioPlayer), декодируется
// в WebView (Web Audio, AAC в MP4) и меряются пик и средний уровень (RMS) в dBFS
// (0 dBFS — максимум цифрового сигнала).
//
// Всё, что не удалось измерить, считается не тишиной: запись сохраняется в
// «Не распознано». Ошибиться в сторону лишней записи дешевле, чем потерять встречу.
'use client';

import { invoke } from '@tauri-apps/api/core';

/**
 * Порог тишины по пику, dBFS. Речь у микрофона ноутбука даёт пики −25…−6 dBFS,
 * шум тихой комнаты и собственный шум микрофона редко поднимается выше −50.
 * −40 оставляет запас: щелчок клавиатуры может перейти порог, и тогда запись
 * просто сохранится в «Не распознано», а не удалится.
 */
export const SILENCE_PEAK_DBFS = -40;

/**
 * Порог тишины по среднему уровню (RMS), dBFS. Разговор в среднем −35…−20 dBFS,
 * тишина с шумом комнаты −70…−55. Запись тишина, только если и пик, и среднее
 * не выше своих порогов.
 */
export const SILENCE_RMS_DBFS = -55;

/**
 * Дольше этого запись не читается целиком: команда ядра отдаёт файл массивом
 * чисел через канал к ядру, а час звука это сотни мегабайт. Длинная запись без
 * текста не удаляется, а сохраняется в «Не распознано».
 */
export const MAX_ANALYZE_SECONDS = 20 * 60;

export interface AudioLevel {
  peakDb: number;
  rmsDb: number;
  /** Длительность декодированного звука, с. */
  seconds: number;
}

export type LevelResult = { kind: 'measured'; level: AudioLevel } | { kind: 'unknown'; reason: string };

const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

export function isSilent(level: AudioLevel): boolean {
  return level.peakDb <= SILENCE_PEAK_DBFS && level.rmsDb <= SILENCE_RMS_DBFS;
}

export function formatLevel(level: AudioLevel): string {
  return `пик ${level.peakDb.toFixed(1)} dBFS, среднее ${level.rmsDb.toFixed(1)} dBFS (порог тишины ${SILENCE_PEAK_DBFS} и ${SILENCE_RMS_DBFS})`;
}

export function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.endsWith(sep) ? folder + name : folder + sep + name;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readBytes(path: string): Promise<Uint8Array | null> {
  // Ядро дописывает audio.mp4 при остановке; если файла ещё нет, пробуем ещё пару раз
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await invoke<number[] | null>('read_audio_file', { filePath: path });
      if (data && data.length > 0) return Uint8Array.from(data);
    } catch {
      /* ниже попробуем ещё раз */
    }
    await sleep(500);
  }
  return null;
}

async function decode(bytes: Uint8Array): Promise<AudioBuffer> {
  const Offline =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('Web Audio недоступен');
  const ctx = new Offline(1, 1, 44_100);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // Старый WebKit знает только форму с колбэками
  return new Promise<AudioBuffer>((resolve, reject) => {
    const result = ctx.decodeAudioData(buffer, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (result && typeof result.then === 'function') result.then(resolve, reject);
  });
}

/** Пик и средний уровень звука записи в папке folder (audio.mp4). */
export async function measureRecordingLevel(folder: string | null, durationSec: number | null): Promise<LevelResult> {
  if (!folder) return { kind: 'unknown', reason: 'папка записи неизвестна' };
  if (durationSec !== null && durationSec > MAX_ANALYZE_SECONDS) {
    return { kind: 'unknown', reason: `запись длиннее ${MAX_ANALYZE_SECONDS / 60} мин, целиком не читается` };
  }
  const bytes = await readBytes(joinPath(folder, 'audio.mp4'));
  if (!bytes) return { kind: 'unknown', reason: 'файл звука не прочитан' };
  let audio: AudioBuffer;
  try {
    audio = await decode(bytes);
  } catch (error) {
    return { kind: 'unknown', reason: `звук не декодирован: ${String(error).slice(0, 120)}` };
  }
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
    }
    count += data.length;
  }
  if (count === 0) return { kind: 'unknown', reason: 'в файле нет звука' };
  return { kind: 'measured', level: { peakDb: toDb(peak), rmsDb: toDb(Math.sqrt(sum / count)), seconds: audio.duration } };
}
