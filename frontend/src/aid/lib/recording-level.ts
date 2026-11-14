// Уровень звука во время записи: событие ядра recording-level (~30 раз в секунду,
// только пока идёт запись и не на паузе). Ядро считает RMS по буферам, которые уже
// получает поток захвата (микрофон и звук компьютера), и переводит в 0..1 по dB от -60
// до 0. Устройство заново не открывается.
//
// Одна подписка на всё приложение: свечение (VoiceGlow) и полосы в капсуле записи
// читают отсюда. Подписка живёт, пока есть хотя бы один слушатель.
//
// На заглушках (?mock=…) ядра нет: уровень демонстрационный, слоги и паузы как в
// прототипе (docs/prototypes/voice-glow.html). В настоящем приложении его нет.
'use client';

import { subscribe } from './tauri-events';
import { isMock } from './mic-access';

export interface RecordingLevelPayload {
  /** max(mic, system), 0..1 */
  level: number;
  mic: number;
  system: number;
}

type Listener = (level: number) => void;

/** Событие старше этого: уровень 0 (пауза, стоп, ядро замолчало). */
const STALE_MS = 250;

let latest = 0;
let latestAt = 0;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;

function push(level: number) {
  latest = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  latestAt = performance.now();
  listeners.forEach((fn) => fn(latest));
}

/** Демо-уровень для заглушек: короткие всплески 120-260 мс, паузы между словами и фразами. */
function startDemo(): () => void {
  let syl = { start: 0, until: 0, peak: 0 };
  const tick = () => {
    const now = performance.now();
    if (now > syl.until) {
      const pause = Math.random() < 0.18 ? 260 + Math.random() * 320 : 40 + Math.random() * 90;
      const len = 120 + Math.random() * 140;
      syl = { start: now + pause, until: now + pause + len, peak: 0.55 + Math.random() * 0.4 };
    }
    // Как у ядра: шкала dB, тишина комнаты около 0,15, речь 0,5-0,9
    let level = 0.12 + Math.random() * 0.05;
    if (now >= syl.start) {
      const k = (now - syl.start) / (syl.until - syl.start);
      level = Math.max(level, syl.peak * Math.sin(Math.PI * k) * (0.9 + Math.random() * 0.2));
    }
    push(level);
  };
  const id = window.setInterval(tick, 33);
  return () => window.clearInterval(id);
}

function start() {
  if (stop || typeof window === 'undefined') return;
  stop = isMock() ? startDemo() : subscribe<RecordingLevelPayload>('recording-level', (e) => push(e.payload?.level ?? 0));
}

/** Подписка на уровень: обработчик зовётся на каждое событие ядра (~30 Гц). */
export function onRecordingLevel(fn: Listener): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
      latest = 0;
    }
  };
}

/** Последний уровень 0..1; давнее событие считается тишиной. */
export function readRecordingLevel(): number {
  return performance.now() - latestAt > STALE_MS ? 0 : latest;
}

/**
 * Уровень ядра → сила голоса для интерфейса: шум комнаты (до -49 dB) отсекается,
 * обычная речь (-30…-15 dB) занимает большую часть шкалы.
 */
export function voiceAmount(level: number): number {
  return Math.min(1, Math.max(0, (level - 0.18) / 0.62));
}
