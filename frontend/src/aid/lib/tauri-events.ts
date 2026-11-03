// Безопасные подписки на события Tauri для Aid.
//
// В настоящем Tauri повторный вызов unlisten роняет user-script:
// «TypeError: undefined is not an object (evaluating 'listeners[eventId].handlerId')»
// в unregisterListener. Это случается, когда отписка вызывается дважды или когда
// компонент размонтирован раньше, чем разрешился промис listen().
// subscribe() возвращает синхронную функцию отписки, которая:
// - ждёт промис listen и вызывает unlisten ровно один раз;
// - если отписались до подписки, отписывается сразу, как только подписка пришла;
// - после отписки не передаёт события обработчику;
// - не пробрасывает ошибки отписки (окно закрывается, ядро уже убрало слушателя).
'use client';

import { useEffect, useRef } from 'react';
import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Вызывает unlisten один раз. Сразу после разрешения listen() Tauri может ещё не
 * записать слушателя в свою таблицу на стороне страницы, и unregisterListener
 * падает на listeners[eventId]. Поэтому отписка откладывается на такт, а при
 * ошибке повторяется один раз через 100 мс; ошибки наружу не пробрасываются.
 */
function unlistenOnce(fn: UnlistenFn, retry = true) {
  setTimeout(() => {
    try {
      const result = fn() as unknown;
      if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => undefined);
    } catch (error) {
      if (retry) setTimeout(() => unlistenOnce(fn, false), 100);
      else console.warn('[aid] Отписка от события Tauri не удалась:', error);
    }
  }, 0);
}

export function subscribe<T>(event: string, handler: EventCallback<T>): () => void {
  let disposed = false;
  let off: UnlistenFn | null = null;

  listen<T>(event, (e) => {
    if (!disposed) handler(e);
  })
    .then((fn) => {
      if (disposed) unlistenOnce(fn);
      else off = fn;
    })
    .catch((error) => console.warn(`[aid] Не удалось подписаться на ${event}:`, error));

  return () => {
    if (disposed) return;
    disposed = true;
    const fn = off;
    off = null;
    if (fn) unlistenOnce(fn);
  };
}

/**
 * Подписка на время жизни компонента. Обработчик берётся из ref, поэтому
 * смена замыкания не переподписывает (раньше эффект переподписывался на каждый
 * рендер и мог пропускать события между отпиской и новой подпиской).
 */
export function useTauriEvent<T>(event: string, handler: EventCallback<T>) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe<T>(event, (e) => ref.current(e)), [event]);
}

let guardInstalled = false;

/**
 * Страховка для подписок, которые Aid не контролирует (оригинальные хуки).
 * useRecordingStop после стопа подписывается на transcription-complete и сразу
 * отписывается: get_transcription_status отвечает «готово» мгновенно. Отписка
 * приходит раньше, чем Tauri записал слушателя в таблицу на странице, и
 * unregisterListener бросает «listeners[eventId].handlerId» необработанным
 * отказом промиса. Обёртка ловит сбой и повторяет отписку через 50 мс
 * (к этому времени слушатель уже записан); настоящая повторная отписка
 * просто пишет предупреждение в консоль. Оригинальные файлы не меняются.
 */
export function installTauriEventGuard() {
  if (guardInstalled || typeof window === 'undefined') return;
  const internals = (window as unknown as {
    __TAURI_EVENT_PLUGIN_INTERNALS__?: { unregisterListener?: (event: string, id: unknown) => void };
  }).__TAURI_EVENT_PLUGIN_INTERNALS__;
  const original = internals?.unregisterListener;
  if (!internals || typeof original !== 'function') return;
  guardInstalled = true;
  try {
    internals.unregisterListener = (event, id) => {
      try {
        original.call(internals, event, id);
      } catch {
        setTimeout(() => {
          try {
            original.call(internals, event, id);
          } catch (error) {
            console.warn(`[aid] Отписка от ${event} уже выполнена или не найдена:`, error);
          }
        }, 50);
      }
    };
  } catch (error) {
    console.warn('[aid] Не удалось поставить страховку отписки Tauri:', error);
  }
}
