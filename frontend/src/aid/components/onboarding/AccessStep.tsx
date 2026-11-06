// Шаг 2 «Доступ к звуку» (только macOS). Сверху показ: что спросит macOS и что нажать.
// Ниже две карточки: микрофон (обязателен) и звук с компьютера (по желанию), у каждой
// своя кнопка и своё ожидание. Запрос, «Открыть настройки» и перепроверка при возврате
// фокуса в useAccessChecks.
'use client';

import { Check, Microphone, SpeakerHigh } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import type { AccessKind, AccessState } from '@/aid/lib/onboarding';
import { t } from '@/aid/strings';
import { accessSettled, useAccessChecks } from './useAccessChecks';

const LOGO_SRC = '/brand/shadenotes.svg';
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
  const { state, ask, openSettings } = useAccessChecks();
  const mic = state.microphone;
  const continueLabel = mic === 'slow' ? t('obContinueAnyway') : last ? t('obOpenApp') : t('obContinue');

  return (
    <div className="flex flex-col">
      <DemoPrompt done={accessSettled(mic)} />
      <h1 className="mt-6 text-[22px] font-bold leading-7">{t('obAccessTitle')}</h1>
      <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{t('obAccessHint')}</p>
      <div className="mt-4 flex flex-col gap-2">
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
      <Button
        size="main"
        className={cn('mt-6 w-full', busy && 'disabled:opacity-100')}
        aria-busy={busy}
        disabled={!accessSettled(mic) || busy}
        onClick={onContinue}
      >
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

/**
 * Показ запроса macOS (цикл 5 с): окно «ShadeNotes просит доступ к микрофону», указатель
 * нажимает «Разрешить», затем «Доступ есть». Иллюстрация, а не настоящий статус: настоящий
 * в карточке «Микрофон» ниже. done: доступ решён, цикл останавливается на последнем кадре.
 */
function DemoPrompt({ done }: { done: boolean }) {
  return (
    <div aria-hidden data-done={done || undefined} className="aid-ob-prompt relative flex h-[156px] items-center justify-center overflow-hidden rounded-nested bg-muted">
      <div className="aid-ob-prompt-card w-[232px] rounded-[14px] bg-card p-3.5 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
        <img src={LOGO_SRC} width={24} height={24} alt="" className="size-6" />
        <p className="mt-1.5 text-[13px] font-semibold leading-5">{t('obDemoPrompt')}</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[13px]">
          <span className="rounded-full bg-muted py-1.5 text-center">{t('obDemoDeny')}</span>
          <span className="aid-ob-prompt-ok rounded-full bg-primary py-1.5 text-center text-on-role">{t('obAllow')}</span>
        </div>
      </div>
      <span className="aid-ob-prompt-done absolute flex items-center gap-2 text-[15px] font-semibold text-primary-ink">
        <Check weight="bold" className="size-6" />
        {t('obGranted')}
      </span>
      <span className="aid-ob-prompt-cursor absolute size-4 rounded-full bg-foreground/80 ring-4 ring-foreground/15" />
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
