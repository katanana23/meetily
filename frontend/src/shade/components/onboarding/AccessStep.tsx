// Шаг 2 «Доступ к звуку» (только macOS). Сверху показ: что спросит macOS и что нажать.
// Ниже две карточки: микрофон (обязателен) и звук с компьютера (по желанию), у каждой
// своя кнопка и своё ожидание. Запрос, «Открыть настройки» и перепроверка при возврате
// фокуса в useAccessChecks.
'use client';

import { Check, Microphone, SpeakerHigh } from '@phosphor-icons/react';
import { Button } from '@/shade/components/ui/button';
import { Spinner } from '@/shade/components/ui/spinner';
import { cn } from '@/shade/lib/utils';
import type { AccessKind, AccessState } from '@/shade/lib/onboarding';
import { t } from '@/shade/strings';
import { accessSettled, useAccessChecks } from './useAccessChecks';
import { HINT_CLASS, TITLE_CLASS, mainButtonClass } from './ui';

const LOGO_SRC = '/brand/shade.svg';
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
  // Показ: крутится, пока микрофон не решён; «Доступ есть» только при настоящем доступе,
  // при отказе или непроверенном ответе стоит окно запроса без указателя
  const demo: DemoState = mic === 'granted' ? 'granted' : mic === 'idle' || mic === 'pending' ? 'loop' : 'still';

  return (
    <div className="flex flex-col">
      <DemoPrompt state={demo} />
      <h1 className={`mt-6 ${TITLE_CLASS}`}>{t('obAccessTitle')}</h1>
      <p className={`mt-2 ${HINT_CLASS}`}>{t('obAccessHint')}</p>
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
      <Button size="main" className={mainButtonClass(busy, 'mt-6')} aria-busy={busy} disabled={!accessSettled(mic) || busy} onClick={onContinue}>
        {busy && <Spinner size={20} tone="inherit" />}
        {busy ? t('obOpening') : continueLabel}
      </Button>
      <button
        type="button"
        disabled={busy}
        onClick={onLater}
        className="mx-auto mt-2 h-10 rounded-full px-5 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {t('obLater')}
      </button>
    </div>
  );
}

type DemoState = 'loop' | 'granted' | 'still';

/**
 * Показ запроса macOS (цикл 5,6 с, .shade-ob-prompt-* в globals.css): стилизованное окно
 * «Shade просит доступ к микрофону» на подложке обложки, указатель подходит сбоку
 * по кривой и нажимает «Разрешить» (кнопка сжимается), окно гаснет, «Доступ есть» стоит
 * около 2 с и плавно уходит перед повтором. Иллюстрация, а не системное окно: без рамки
 * и тени macOS, чуть меньше настоящего; настоящий статус в карточке «Микрофон» ниже.
 * granted: стоит «Доступ есть»; still: стоит окно без указателя (отказ, проверим позже).
 */
function DemoPrompt({ state }: { state: DemoState }) {
  return (
    <div aria-hidden data-state={state} className="shade-ob-prompt relative flex aspect-[8/3] items-center justify-center overflow-hidden rounded-nested bg-muted p-5">
      <div className="shade-ob-prompt-card -mt-1 w-[300px] max-w-full rounded-[16px] bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
          <img src={LOGO_SRC} width={32} height={32} alt="" className="size-8 shrink-0" />
          <p className="text-balance text-[15px] font-semibold leading-5">{t('obDemoPrompt')}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[13px] font-medium">
          <span className="rounded-full bg-muted py-1.5 text-center">{t('obDemoDeny')}</span>
          <span className="relative">
            <span className="shade-ob-prompt-ok block rounded-full bg-primary py-1.5 text-center text-on-role">{t('obAllow')}</span>
            {/* Указатель: кончик у правого края кнопки, надпись не закрывает */}
            <span className="shade-ob-prompt-cursor-x absolute left-[calc(100%-14px)] top-[60%]">
              <span className="shade-ob-prompt-cursor-y block">
                <svg viewBox="0 0 16 22" className="shade-ob-prompt-cursor block h-[22px] w-4 drop-shadow-sm">
                  <path d="M1 1v17.5l4.6-4.4 3 6.7 2.9-1.3-3-6.6H15L1 1Z" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
          </span>
        </div>
      </div>
      <span className="shade-ob-prompt-done absolute flex items-center gap-2 text-[17px] font-semibold text-primary-ink">
        <Check weight="bold" className="size-6" />
        {t('obGranted')}
      </span>
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
    <div className="flex min-h-[72px] items-center gap-3 rounded-nested bg-muted py-3 pl-4 pr-3">
      <Icon className="size-6 shrink-0 text-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-6">{TITLE[kind]}</p>
        <p
          role="status"
          className={cn(
            'flex items-center gap-1 text-pretty text-[13px] leading-5',
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
