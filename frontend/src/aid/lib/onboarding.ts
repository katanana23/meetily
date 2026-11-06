// Первый запуск ShadeNotes: вызовы ядра с пределом времени, журнал и доступ к звуку.
// Команды и аргументы те же, что у мастера оригинала (components/onboarding), плюс
// обязательный preferencePane у open_system_settings (оригинал его не передавал,
// и «Открыть настройки» молча не срабатывала).
'use client';

import { invoke } from '@tauri-apps/api/core';

/** Через сколько миллисекунд без ответа ядра показывать «Продолжить всё равно». */
export const SLOW_MS = 8000;

/** Строка журнала первого запуска: по ней видно, какой вызов и сколько ждал. */
export function obLog(message: string, extra?: unknown) {
  if (extra === undefined) console.info('[aid] onboarding', message);
  else console.info('[aid] onboarding', message, extra);
}

export class SlowError extends Error {
  constructor(label: string) {
    super(`${label}: нет ответа за ${SLOW_MS} мс`);
    this.name = 'SlowError';
  }
}

/**
 * Ждёт обещание не дольше SLOW_MS. Само обещание не отменяется: поздний ответ
 * ядра придёт в onLate (например, применить статус доступа, если человек ещё на шаге).
 */
export function withTimeout<T>(label: string, run: () => Promise<T>, onLate?: (value: T) => void): Promise<T> {
  const started = performance.now();
  obLog(`${label}: старт`);
  const work = run();
  let timedOut = false;
  work.then(
    (value) => {
      const ms = Math.round(performance.now() - started);
      obLog(`${label}: ответ за ${ms} мс`, value);
      if (timedOut) onLate?.(value);
    },
    (error) => obLog(`${label}: ошибка через ${Math.round(performance.now() - started)} мс`, error),
  );
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      obLog(`${label}: нет ответа за ${SLOW_MS} мс, показываем «Продолжить всё равно»`);
      reject(new SlowError(label));
    }, SLOW_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ─── Платформа ───

/** macOS: шаг «Доступ к звуку» нужен только там. Как в OnboardingFlow оригинала. */
export async function detectMac(): Promise<boolean> {
  try {
    const { platform } = await import('@tauri-apps/plugin-os');
    return platform() === 'macos';
  } catch {
    return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
  }
}

// ─── Доступ к звуку ───

export type AccessKind = 'microphone' | 'systemAudio';

/**
 * idle: ещё не спрашивали; pending: ждём ответа macOS; granted: доступ есть;
 * denied: доступ закрыт; unverified: ответ после возврата из настроек не изменился
 * (macOS часто применяет разрешение только после перезапуска приложения),
 * проверим при первой записи; slow: macOS не ответила за SLOW_MS.
 */
export type AccessState = 'idle' | 'pending' | 'granted' | 'denied' | 'unverified' | 'slow';

const COMMAND: Record<AccessKind, string> = {
  microphone: 'trigger_microphone_permission',
  systemAudio: 'trigger_system_audio_permission_command',
};

/** Раздел «Конфиденциальность и безопасность» для open_system_settings. */
export const SETTINGS_PANE: Record<AccessKind, string> = {
  microphone: 'Privacy_Microphone',
  // «Запись экрана и системного звука»: там же разрешение на звук с компьютера
  systemAudio: 'Privacy_ScreenCapture',
};

/** Просит доступ (или перепроверяет, если решение уже принято: тогда macOS окна не показывает). */
export function requestAccess(kind: AccessKind, onLate?: (granted: boolean) => void): Promise<boolean> {
  return withTimeout(COMMAND[kind], () => invoke<boolean>(COMMAND[kind]), onLate);
}

export function openPrivacySettings(kind: AccessKind): Promise<void> {
  return invoke<void>('open_system_settings', { preferencePane: SETTINGS_PANE[kind] }).catch((error) => {
    obLog('open_system_settings: ошибка', error);
  });
}
