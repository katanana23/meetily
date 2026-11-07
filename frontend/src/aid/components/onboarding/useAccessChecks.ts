// Доступ к звуку (только macOS): запрос, «Открыть настройки» и перепроверка при возврате
// фокуса. У каждого вида доступа своё ожидание: в мастере оригинала флаг ожидания был
// общим, и одна зависшая проверка выключала обе кнопки.
//
// Ограничение ядра: команды «спросить доступ» отвечают, удалось ли открыть поток звука,
// а не что решил человек. Отдельной команды «узнать состояние доступа без запроса» нет.
// После возврата из Системных настроек ответ часто не меняется, пока приложение не
// перезапустят (так macOS применяет разрешение микрофона), поэтому неизменившийся ответ
// показываем нейтрально: «Проверим при первой записи», а не «Доступ есть».
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { SlowError, obLog, openPrivacySettings, requestAccess, type AccessKind, type AccessState } from '@/aid/lib/onboarding';

/** Доступ можно считать решённым: есть, не проверить сейчас (проверим при записи) или macOS не ответила. */
export const accessSettled = (s: AccessState) => s === 'granted' || s === 'unverified' || s === 'slow';

export function useAccessChecks() {
  const { setPermissionStatus } = useOnboarding();
  const [state, setState] = useState<Record<AccessKind, AccessState>>({ microphone: 'idle', systemAudio: 'idle' });
  // Человек ушёл в Системные настройки: при возвращении фокуса перепроверить этот доступ
  const awaitingReturn = useRef<Set<AccessKind>>(new Set());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const apply = useCallback(
    (kind: AccessKind, next: AccessState) => {
      if (!mounted.current) return;
      setState((prev) => ({ ...prev, [kind]: next }));
      // В контекст оригинала только то, что ядро сказало определённо
      if (next === 'granted') setPermissionStatus(kind, 'authorized');
      else if (next === 'denied') setPermissionStatus(kind, 'denied');
    },
    [setPermissionStatus],
  );

  const ask = useCallback(
    (kind: AccessKind, recheck: boolean) => {
      setState((prev) => ({ ...prev, [kind]: 'pending' }));
      requestAccess(kind, (granted) => {
        // Поздний ответ после «macOS не ответила»: применить, если человек ещё здесь
        apply(kind, granted ? 'granted' : recheck ? 'unverified' : 'denied');
      })
        .then((granted) => {
          // Перепроверка после настроек: изменился ответ на «да» — доступ есть;
          // не изменился — не утверждаем ни того, ни другого
          if (recheck) apply(kind, granted ? 'granted' : 'unverified');
          else apply(kind, granted ? 'granted' : 'denied');
        })
        .catch((error) => {
          if (error instanceof SlowError) apply(kind, 'slow');
          else apply(kind, recheck ? 'unverified' : 'denied');
        });
    },
    [apply],
  );

  const openSettings = useCallback((kind: AccessKind) => {
    awaitingReturn.current.add(kind);
    obLog(`открываем Системные настройки: ${kind}`);
    void openPrivacySettings(kind);
  }, []);

  // Возврат из Системных настроек: окно снова в фокусе, перепроверяем сами
  useEffect(() => {
    let last = 0;
    const onBack = () => {
      if (document.visibilityState === 'hidden' || awaitingReturn.current.size === 0) return;
      const now = Date.now();
      if (now - last < 800) return; // focus и visibilitychange приходят парой
      last = now;
      const kinds = Array.from(awaitingReturn.current);
      awaitingReturn.current.clear();
      obLog(`окно снова в фокусе, перепроверяем: ${kinds.join(', ')}`);
      kinds.forEach((kind) => ask(kind, true));
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    // В окне Tauri фокус окна приходит и событием ядра
    let offTauri: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) onBack();
        }),
      )
      .then((off) => {
        if (cancelled) off();
        else offTauri = off;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
      offTauri?.();
    };
  }, [ask]);

  return { state, ask, openSettings };
}
