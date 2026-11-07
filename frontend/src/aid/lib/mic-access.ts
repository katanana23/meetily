// Доступ к микрофону перед записью.
//
// Почему не хватает того, что было:
// - Aid проверял только список устройств (get_audio_devices): микрофон в списке
//   есть и тогда, когда macOS запретила к нему доступ;
// - команда онбординга trigger_microphone_permission отвечает «поток звука
//   открылся», а не «человек разрешил»: при отказе поток открывается;
// - ядро перед стартом (verify_microphone_access) ждёт первый буфер звука, но при
//   отказе macOS присылает буферы с нулями, и проверка проходит. Запись идёт:
//   микрофон пишет тишину, звук компьютера пишется как обычно.
//
// Что делаем:
// 1. Список устройств: нет входов → «Микрофон не найден».
// 2. Та же команда, что у онбординга (requestAccess из onboarding.ts): если она
//    ответила «нет», доступа нет.
// 3. Только macOS в окне Tauri: getUserMedia в WebView. WebView (wry) сам
//    разрешает странице микрофон, поэтому ответ зависит только от разрешения
//    macOS для ShadeNotes: отказ → NotAllowedError, не спрашивали → macOS
//    показывает свой вопрос и ответ ждёт решения человека. Поток сразу закрывается.
// Всё, что проверить не удалось, считается «неизвестно» и запись не блокирует:
// ложный запрет хуже, чем запись без проверки.
'use client';

import { invoke } from '@tauri-apps/api/core';
import { SlowError, requestAccess } from './onboarding';

export type MicAccess = 'granted' | 'denied' | 'no-device' | 'unknown';

export interface MicCheck {
  access: MicAccess;
  /** Чем проверяли и что ответило: для журнала и чек-листа. */
  trail: string[];
}

/** Сколько ждать ответа macOS на вопрос о микрофоне (человек может думать). */
const PROMPT_WAIT_MS = 60_000;

const log = (message: string, extra?: unknown) =>
  extra === undefined ? console.info('[aid] mic', message) : console.info('[aid] mic', message, extra);

type Win = Window & { __TAURI_INTERNALS__?: unknown; __MEETILY_MOCK__?: unknown };

/** Настоящее окно Tauri (не браузер и не заглушки). */
export function inRealTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Win;
  return Boolean(w.__TAURI_INTERNALS__) && !w.__MEETILY_MOCK__;
}

/** macOS в окне Tauri: только там есть разрешение macOS и WebView на WebKit. */
export function isMacTauri(): boolean {
  if (!inRealTauri()) return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}

interface Device {
  name: string;
  device_type: 'Input' | 'Output';
}

/** Входы и выходы по списку ядра; null, если список не получен. */
async function listDevices(): Promise<{ inputs: string[]; outputs: string[] } | null> {
  try {
    const devices = await invoke<Device[]>('get_audio_devices');
    return {
      inputs: devices.filter((d) => d.device_type === 'Input').map((d) => d.name),
      outputs: devices.filter((d) => d.device_type === 'Output').map((d) => d.name),
    };
  } catch (error) {
    log('get_audio_devices: ошибка', error);
    return null;
  }
}

function timeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([work, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))]);
}

/** Разрешение macOS через WebView. 'unknown', если WebView проверить не может. */
async function probeWebView(): Promise<MicAccess> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) return 'unknown';
  try {
    const result = await timeout(md.getUserMedia({ audio: true }), PROMPT_WAIT_MS);
    if (result === 'timeout') return 'unknown';
    result.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    log(`getUserMedia: ${name || String(error)}`);
    if (name === 'NotAllowedError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
    // SecurityError (страница не считается защищённой) и прочее: проверить не можем
    return 'unknown';
  }
}

/** Проверка перед стартом записи. Может показать вопрос macOS о микрофоне. */
export async function checkMicrophone(): Promise<MicCheck> {
  const trail: string[] = [];
  const devices = await listDevices();
  trail.push(devices ? `входов в списке ядра: ${devices.inputs.length}` : 'список устройств не получен');
  if (devices && devices.inputs.length === 0) return { access: 'no-device', trail };

  let command: boolean | null = null;
  try {
    command = await requestAccess('microphone');
  } catch (error) {
    command = null;
    trail.push(error instanceof SlowError ? 'trigger_microphone_permission: нет ответа' : `trigger_microphone_permission: ${String(error)}`);
  }
  if (command !== null) trail.push(`trigger_microphone_permission: ${command}`);
  if (command === false) return { access: 'denied', trail };

  if (isMacTauri()) {
    const webview = await probeWebView();
    trail.push(`разрешение macOS через WebView: ${webview}`);
    if (webview !== 'unknown') return { access: webview, trail };
  }
  return { access: command === true ? 'granted' : 'unknown', trail };
}

/**
 * Есть ли звук компьютера: выход в списке ядра и та же команда, что у онбординга.
 * Вызывается, только когда с микрофоном беда: команда создаёт перехват звука
 * и при первом вызове может показать вопрос macOS.
 */
export async function checkSystemAudio(): Promise<boolean> {
  const devices = await listDevices();
  if (devices && devices.outputs.length === 0) return false;
  try {
    return await requestAccess('systemAudio');
  } catch {
    // macOS не ответила: не отнимаем выбор у человека
    return true;
  }
}

/** Ядро отказалось стартовать из-за микрофона (verify_microphone_access). */
export function isMicRefusal(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /Microphone access required|Microphone permission not granted|Cannot access microphone|Cannot start microphone/i.test(text);
}
