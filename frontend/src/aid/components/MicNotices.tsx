// Карточки про микрофон у кнопки записи (в стиле NoticeCard из RecordDock):
// - MicAccessCard: запись не началась, потому что нет доступа к микрофону или самого
//   микрофона. «Открыть настройки» ведёт в Системные настройки, при возврате в окно
//   доступ перепроверяется сам. «Записать только звук компьютера» — явный выбор.
// - MicHint: во время записи «Не слышу микрофон», «Микрофон отключился» и
//   напоминание «Пишу только звук компьютера». Запись не обрывается.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GearSix, MicrophoneSlash, SpeakerHigh, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { SoundCheckDialog } from '@/aid/components/SoundCheck';
import { openPrivacySettings } from '@/aid/lib/onboarding';
import type { StartBlocker } from '@/aid/lib/recording';
import type { MicWatchState } from '@/aid/lib/mic-watch';
import { aidToast } from '@/aid/lib/toasts';
import { BRAND_MARK_SRC } from '@/aid/components/BrandMark';
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
  const systemAudio = Boolean(blocker.systemAudio) && !(denied && blocker.coreRefused);
  // Мелкая строка под заголовком только там, где без неё непонятно, что случилось
  const note = denied ? (blocker.zeros ? t('micNotSaved') : blocker.stillDenied ? t('micRestartNote') : null) : null;

  return (
    <CardShell>
      <div role="alert" data-aid-mic={blocker.kind} className="flex w-full min-w-0 items-start gap-4">
        <Sign>
          <MicrophoneSlash />
        </Sign>
        <div className="min-w-0 flex-1 pt-3">
          <p className="text-[15px] font-semibold leading-5">{denied ? t('micDeniedTitle') : t('micMissingTitle')}</p>
          {note && <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{note}</p>}
          {/* Подсказка картинкой: строка «ShadeNotes» с включающимся переключателем, как в Системных настройках */}
          {denied && <SettingsHint />}
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {denied ? (
              <Button
                ref={primary}
                disabled={checking}
                onClick={() => {
                  awaiting.current = true;
                  void openPrivacySettings('microphone');
                }}
              >
                {checking && <Spinner tone="inherit" />}
                {t('micOpenSettings')}
              </Button>
            ) : (
              <Button ref={primary} disabled={checking} onClick={() => void recheck()}>
                {checking && <Spinner tone="inherit" />}
                {t('checkAgain')}
              </Button>
            )}
            {systemAudio && (
              <Button variant="ghost" className="px-4 text-muted-foreground hover:text-foreground" disabled={checking} onClick={onSystemOnly}>
                {t('systemOnlyShort')}
              </Button>
            )}
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
    </CardShell>
  );
}

/**
 * Мини-иллюстрация «включите в настройках». Это картинка, а не элемент управления:
 * - миниатюрное окно Системных настроек (кнопки окна, подпись «Микрофон»), мельче
 *   интерфейса, на подложке, читается как снимок экрана;
 * - переключатель нажимает нарисованный указатель, тот же, что в показе онбординга;
 * - на картинку нельзя навести и нажать (pointer-events: none), курсор обычный.
 * Цикл 2,8 с (.aid-mic-demo в globals.css); при «уменьшить движение» переключатель
 * включён, указатель стоит на нём. Для читалки экрана одна фраза.
 */
function SettingsHint() {
  return (
    <div className="mt-3 w-[240px] max-w-full">
      <div aria-hidden className="aid-mic-demo pointer-events-none select-none overflow-hidden rounded-nested bg-muted p-2.5">
        <div className="rounded-[10px] bg-card px-2.5 pb-2.5 pt-2 shadow-sm">
          <div className="flex items-center gap-1">
            <span className="size-[6px] rounded-full bg-foreground/15" />
            <span className="size-[6px] rounded-full bg-foreground/15" />
            <span className="size-[6px] rounded-full bg-foreground/15" />
            <span className="ml-1.5 text-[11px] font-semibold leading-none text-muted-foreground">{t('micDemoPane')}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
            <img src={BRAND_MARK_SRC} width={16} height={16} alt="" className="size-4 rounded-[4px]" />
            <span className="flex-1 text-[12px] font-medium leading-none">ShadeNotes</span>
            <span className="relative">
              <span className="aid-mic-demo-track relative block h-[15px] w-[26px] rounded-full">
                <span className="aid-mic-demo-knob absolute left-[1.5px] top-[1.5px] size-3 rounded-full bg-white shadow-sm" />
              </span>
              {/* Указатель: кончик на переключателе */}
              <span className="aid-mic-demo-cursor absolute left-[14px] top-[7px]">
                <svg viewBox="0 0 16 22" className="block h-[18px] w-[13px] drop-shadow-sm">
                  <path d="M1 1v17.5l4.6-4.4 3 6.7 2.9-1.3-3-6.6H15L1 1Z" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
          </div>
        </div>
      </div>
      <span className="sr-only">{t('micSwitchHint')}</span>
    </div>
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
