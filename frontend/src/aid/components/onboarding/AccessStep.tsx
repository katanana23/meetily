// Шаг 2 «Доступ к звуку» (только macOS). Две карточки: микрофон (обязателен) и звук
// с компьютера (по желанию). У каждой своя кнопка и своё ожидание: в мастере оригинала
// флаг ожидания был общим, и одна зависшая проверка выключала обе кнопки.
//
// Ограничение ядра: команды «спросить доступ» отвечают, удалось ли открыть поток звука,
// а не что решил человек. Отдельной команды «узнать состояние доступа без запроса» нет.
// После возврата из Системных настроек ответ часто не меняется, пока приложение не
// перезапустят (так macOS применяет разрешение микрофона), поэтому неизменившийся ответ
// показываем нейтрально: «Проверим при первой записи», а не «Доступ есть».
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Microphone, SpeakerHigh } from '@phosphor-icons/react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import { SlowError, obLog, openPrivacySettings, requestAccess, type AccessKind, type AccessState } from '@/aid/lib/onboarding';
import { t } from '@/aid/strings';

const ICON = { microphone: Microphone, systemAudio: SpeakerHigh } as const;
const TITLE = { microphone: t('obMic'), systemAudio: t('obSystem') } as const;
const HINT = { microphone: t('obMicHint'), systemAudio: t('obSystemHint') } as const;

interface Props {
  /** Идёт сохранение настроек (этот шаг последний, если модель уже скачана). */
  busy: boolean;
  /** После этого шага приложение откроется сразу. */
  last: boolean;
  onContinue: () => void;
  onLater: () => void;
}

export function AccessStep({ busy, last, onContinue, onLater }: Props) {
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

  const mic = state.microphone;
  const micSettled = mic === 'granted' || mic === 'unverified' || mic === 'slow';
  const continueLabel = mic === 'slow' ? t('obContinueAnyway') : last ? t('obOpenApp') : t('obContinue');

  return (
    <div className="flex flex-col">
      <h1 className="text-[36px] font-bold leading-[40px] tracking-tight">{t('obAccessTitle')}</h1>
      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{t('obAccessHint')}</p>
      <div className="mt-6 flex flex-col gap-2">
        {(['microphone', 'systemAudio'] as const).map((kind) => (
          <AccessCard
            key={kind}
            kind={kind}
            state={state[kind]}
            primary={kind === 'microphone'}
            onAllow={() => ask(kind, false)}
            onOpenSettings={() => openSettings(kind)}
          />
        ))}
      </div>
      <Button size="main" className={cn('mt-8 w-full', busy && 'disabled:opacity-100')} aria-busy={busy} disabled={!micSettled || busy} onClick={onContinue}>
        {busy && <Spinner size={20} tone="inherit" />}
        {busy ? t('obOpening') : continueLabel}
      </Button>
      <button
        type="button"
        disabled={busy}
        onClick={onLater}
        className="mx-auto mt-2 h-12 rounded-full px-5 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {t('obLater')}
      </button>
    </div>
  );
}

function AccessCard({
  kind,
  state,
  primary,
  onAllow,
  onOpenSettings,
}: {
  kind: AccessKind;
  state: AccessState;
  primary: boolean;
  onAllow: () => void;
  onOpenSettings: () => void;
}) {
  const Icon = ICON[kind];
  const caption =
    state === 'pending'
      ? t('obPending')
      : state === 'granted'
        ? t('obGranted')
        : state === 'denied'
          ? t('obDenied')
          : state === 'unverified'
            ? t('obUnverified')
            : state === 'slow'
              ? t('obSlow')
              : HINT[kind];
  const needsSettings = state === 'denied' || state === 'unverified' || state === 'slow';

  return (
    <div className="flex min-h-[80px] items-center gap-3 rounded-nested bg-muted px-4 py-3">
      <Icon className="size-6 shrink-0 text-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-6">{TITLE[kind]}</p>
        <p
          role="status"
          className={cn(
            'flex items-center gap-1 text-[13px] leading-5',
            state === 'granted' ? 'text-primary-ink' : state === 'denied' ? 'text-giants-ink' : 'text-muted-foreground',
          )}
        >
          {state === 'granted' && <Check weight="bold" className="size-4 shrink-0" aria-hidden />}
          {caption}
        </p>
      </div>
      {state === 'granted' ? null : needsSettings ? (
        <Button variant="outline" className="shrink-0 bg-card hover:bg-background" onClick={onOpenSettings}>
          {t('obOpenSettings')}
        </Button>
      ) : (
        <Button
          variant={primary ? 'default' : 'outline'}
          className={cn('shrink-0', !primary && 'bg-card hover:bg-background')}
          disabled={state === 'pending'}
          onClick={onAllow}
        >
          {state === 'pending' && <Spinner size={20} tone="inherit" />}
          {t('obAllow')}
        </Button>
      )}
    </div>
  );
}
