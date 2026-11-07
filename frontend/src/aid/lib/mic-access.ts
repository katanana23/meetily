// Доступ к микрофону перед записью и в онбординге.
//
// Почему не хватало того, что было:
// - Aid проверял только список устройств (get_audio_devices): микрофон в списке
//   есть и тогда, когда macOS запретила к нему доступ;
// - команда онбординга trigger_microphone_permission отвечает «поток звука
//   открылся», а не «человек разрешил»: при отказе поток открывается и пишет нули,
//   команда отвечает true;
// - ядро перед стартом (verify_microphone_access) ждёт первый буфер звука, а при
//   отказе macOS присылает буферы с нулями, и проверка проходит.
//
// Правило: «не знаю» никогда не значит «доступ есть». Ответ «есть» или «нет» на macOS
// даёт только окно приложения: getUserMedia в WebView. wry сам разрешает странице
// микрофон, поэтому ответ зависит только от разрешения macOS: отказ → NotAllowedError,
// не спрашивали → macOS сразу задаёт свой вопрос и ответ ждёт решения человека.
// Команда онбординга на macOS может сказать только «нет» (поток не открылся).
// Если окно не ответило, доступ «неизвестен»: запись стартует, но первые секунды
// под страховкой (mic-watch.ts: только нули → остановка и карточка).
//
// Итог проверки запоминается (localStorage aid.micAccess.v1): пока известно, что
// доступа нет, кнопка записи в состоянии «нужен доступ».
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

/** Браузер на заглушках (mock-tauri). */
export function isMock(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Win).__MEETILY_MOCK__);
}

/** Настоящее окно Tauri (не браузер и не заглушки). */
export function inRealTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Win).__TAURI_INTERNALS__) && !isMock();
}

/** macOS в окне Tauri: только там есть разрешение macOS и WebView на WebKit. */
export function isMacTauri(): boolean {
  if (!inRealTauri()) return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}

// ─── Что известно о доступе (между запусками) ───

const STORE_KEY = 'aid.micAccess.v1';
const STORE_EVENT = 'aid-mic-access';

/** Что известно наверняка: 'granted', 'denied' или ничего. */
export type KnownMicAccess = 'granted' | 'denied' | null;

export function knownMicAccess(): KnownMicAccess {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/** Запомнить, что известно; null — забыть (не знаем). */
export function rememberMicAccess(value: KnownMicAccess) {
  try {
    if (value) localStorage.setItem(STORE_KEY, value);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* не запомнится до перезапуска, проверка всё равно будет при записи */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORE_EVENT));
}

export function onMicAccessChange(cb: () => void): () => void {
  window.addEventListener(STORE_EVENT, cb);
  return () => window.removeEventListener(STORE_EVENT, cb);
}

// ─── Проверки ───

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

export interface MacAnswer {
  /** null: это не macOS в окне Tauri, разрешения macOS нет. */
  access: 'granted' | 'denied' | 'no-device' | 'unknown' | null;
  /** Почему так: есть ли mediaDevices, защищённая ли страница, имя ошибки, время. */
  detail: string;
}

/**
 * Разрешение macOS через окно приложения. Если доступ ещё не спрашивали, macOS
 * задаёт вопрос, и ответ ждёт решения человека (до PROMPT_WAIT_MS).
 * На заглушках ответ задаёт сценарий (команда aid_mock_mac_mic).
 */
export async function macMicrophoneAnswer(): Promise<MacAnswer> {
  if (isMock()) {
    const access = await invoke<MacAnswer['access']>('aid_mock_mac_mic').catch(() => null);
    return { access, detail: 'заглушка' };
  }
  if (!isMacTauri()) return { access: null, detail: 'не macOS в окне Tauri' };
  const md = navigator.mediaDevices;
  const secure = typeof window.isSecureContext === 'boolean' ? String(window.isSecureContext) : '?';
  if (!md?.getUserMedia) return { access: 'unknown', detail: `нет navigator.mediaDevices (защищённая страница: ${secure}, ${location.protocol})` };
  const started = performance.now();
  const took = () => `${Math.round(performance.now() - started)} мс`;
  try {
    const result = await timeout(md.getUserMedia({ audio: true }), PROMPT_WAIT_MS);
    if (result === 'timeout') return { access: 'unknown', detail: `нет ответа за ${PROMPT_WAIT_MS / 1000} с` };
    result.getTracks().forEach((track) => track.stop());
    return { access: 'granted', detail: `поток открылся за ${took()}` };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    const detail = `${name || 'ошибка'}: ${message.slice(0, 120)} за ${took()}`;
    if (name === 'NotAllowedError') return { access: 'denied', detail };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { access: 'no-device', detail };
    // SecurityError (страница не считается защищённой), NotReadableError (микрофон занят) и прочее
    return { access: 'unknown', detail };
  }
}

/** Проверка перед стартом записи. На macOS может показать вопрос macOS о микрофоне. */
export async function checkMicrophone(): Promise<MicCheck> {
  const trail: string[] = [];
  const devices = await listDevices();
  trail.push(devices ? `входов в списке ядра: ${devices.inputs.length}` : 'список устройств не получен');
  if (devices && devices.inputs.length === 0) return { access: 'no-device', trail };

  // macOS: сначала окно приложения, оно же задаёт вопрос, если доступ не спрашивали
  const mac = await macMicrophoneAnswer();
  if (mac.access !== null) {
    trail.push(`разрешение macOS через окно: ${mac.access} (${mac.detail})`);
    if (mac.access !== 'unknown') return { access: mac.access, trail };
  }

  // Команда онбординга. На macOS её «да» ничего не доказывает (при отказе поток тоже
  // открывается), поэтому там она может сказать только «нет»
  let command: boolean | null = null;
  try {
    command = await requestAccess('microphone');
    trail.push(`trigger_microphone_permission: ${command}`);
  } catch (error) {
    trail.push(error instanceof SlowError ? 'trigger_microphone_permission: нет ответа' : `trigger_microphone_permission: ${String(error)}`);
  }
  if (command === false) return { access: 'denied', trail };
  if (mac.access === 'unknown') return { access: 'unknown', trail };
  // Не macOS: разрешения macOS нет, ответа команды достаточно
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
