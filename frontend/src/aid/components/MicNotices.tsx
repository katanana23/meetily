// Карточки про микрофон у кнопки записи (в стиле NoticeCard из RecordDock):
// - MicAccessCard: запись не началась, потому что нет доступа к микрофону или самого
//   микрофона. «Открыть настройки» ведёт в Системные настройки, при возврате в окно
//   доступ перепроверяется сам. «Записать только звук компьютера» — явный выбор.
// - MicHint: во время записи «Не слышу микрофон», «Микрофон отключился» и
//   напоминание «Пишу только звук компьютера». Запись не обрывается.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowClockwise, GearSix, MicrophoneSlash, SpeakerHigh, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { SoundCheckDialog } from '@/aid/components/SoundCheck';
import { openPrivacySettings } from '@/aid/lib/onboarding';
import type { StartBlocker } from '@/aid/lib/recording';
import type { MicWatchState } from '@/aid/lib/mic-watch';
import { aidToast } from '@/aid/lib/toasts';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

type MicBlocker = Extract<StartBlocker, { kind: 'no-microphone' | 'mic-denied' }>;

/**
 * Окно снова в фокусе после Системных настроек: вызвать cb. Тот же способ, что в
 * онбординге (useAccessChecks): focus, visibilitychange и событие окна Tauri.
 */
function useWindowReturn(cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let last = 0;
    const onBack = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - last < 800) return; // focus и visibilitychange приходят парой
      last = now;
      cbRef.current();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    let offTauri: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onFocusChanged(({ payload }) => payload && onBack()))
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
  }, []);
}

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('aid-glass aid-glass-dense relative w-[min(560px,calc(100vw-8rem))] rounded-tile py-4 pl-4 pr-3', className)}>{children}</div>
  );
}

function Sign({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5" aria-hidden>
      {children}
    </span>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    // Крестик: X в начертании bold (залитый нарисован квадратом, CLAUDE.md)
    <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4" onClick={onClick} aria-label={t('close')}>
      <X weight="bold" />
    </Button>
  );
}

/** Запись не началась: нет доступа к микрофону или микрофона. */
export function MicAccessCard({
  blocker,
  onRecheck,
  onSystemOnly,
  onClose,
}: {
  blocker: MicBlocker;
  /** Перепроверить доступ: есть, нет или проверить не удалось. */
  onRecheck: () => Promise<'granted' | 'denied' | 'unknown'>;
  onSystemOnly: () => void;
  onClose: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const awaiting = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus(), [blocker.kind]);

  const recheck = useCallback(async () => {
    setChecking(true);
    const answer = await onRecheck().catch(() => 'denied' as const);
    setChecking(false);
    if (answer === 'granted') aidToast.success(t('micAccessBack'));
    // Проверить не удалось: карточка уходит, но «доступ есть» не утверждаем
    else if (answer === 'unknown') aidToast.info(t('micAccessUnknownBack'));
  }, [onRecheck]);

  // Вернулись из Системных настроек: перепроверяем сами, без лишнего нажатия
  useWindowReturn(() => {
    if (!awaiting.current) return;
    awaiting.current = false;
    void recheck();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const denied = blocker.kind === 'mic-denied';
  const systemAudio = Boolean(blocker.systemAudio);
  const title = denied ? t('micDeniedTitle') : t('micMissingTitle');
  const hint = denied
    ? blocker.stillDenied
      ? t('micStillDeniedHint')
      : blocker.zeros
        ? t('micZerosHint')
        : blocker.unverified
          ? t('micUnverifiedHint')
          : t('micDeniedHint')
    : systemAudio
      ? t('micMissingHint')
      : t('micMissingNoSystemHint');

  return (
    <CardShell>
      <div role="alert" data-aid-mic={blocker.kind} className="flex w-full min-w-0 items-start gap-4">
        <Sign>
          <MicrophoneSlash />
        </Sign>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[15px] font-semibold leading-5">{title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{hint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {denied ? (
              <Button
                ref={primary}
                size="main"
                disabled={checking}
                onClick={() => {
                  awaiting.current = true;
                  void openPrivacySettings('microphone');
                }}
              >
                {checking ? <Spinner tone="inherit" /> : <GearSix />}
                {t('micOpenSettings')}
              </Button>
            ) : (
              <Button ref={primary} size="main" disabled={checking} onClick={() => void recheck()}>
                {checking ? <Spinner tone="inherit" /> : <ArrowClockwise />}
                {t('checkAgain')}
              </Button>
            )}
            {systemAudio && !(denied && blocker.coreRefused) && (
              <Button size="main" variant="secondary" disabled={checking} onClick={onSystemOnly}>
                <SpeakerHigh />
                {t('recordSystemOnly')}
              </Button>
            )}
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
    </CardShell>
  );
}

const HINT = {
  silent: { title: 'micSilentTitle', hint: 'micSilentHint' },
  lost: { title: 'micLostTitle', hint: 'micLostHint' },
  'system-only': { title: 'systemOnlyTitle', hint: 'systemOnlyHint' },
  blind: { title: 'micBlindTitle', hint: 'micBlindHint' },
} as const;

export type MicHintKind = keyof typeof HINT;

/** Какую подсказку о микрофоне показать во время записи, или null. */
export function micHintKind(watch: MicWatchState, systemOnly: boolean, blind: boolean, duration: number): MicHintKind | null {
  // Выбор человека: напомнить в первые 8 секунд, дальше не мешать
  if (systemOnly) return duration < 8 ? 'system-only' : null;
  if (watch === 'lost') return 'lost';
  if (watch === 'silent') return 'silent';
  if (blind) return 'blind';
  return null;
}

/** Подсказка над капсулой записи: тихая, с крестиком, запись не трогает. */
export function MicHint({ kind, onClose }: { kind: MicHintKind; onClose: () => void }) {
  const [soundCheck, setSoundCheck] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3" role="status" data-aid-mic-hint={kind}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{t(HINT[kind].title)}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{t(HINT[kind].hint)}</p>
      </div>
      {kind === 'blind' ? (
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void openPrivacySettings('microphone')}>
          <GearSix />
          {t('micOpenSettings')}
        </Button>
      ) : (
        kind !== 'system-only' && (
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setSoundCheck(true)}>
            <SpeakerHigh />
            {t('soundCheck')}
          </Button>
        )
      )}
      <CloseButton onClick={onClose} />
      <SoundCheckDialog open={soundCheck} onOpenChange={setSoundCheck} />
    </div>
  );
}
