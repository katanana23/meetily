// Экран 2, путь: три плитки-задачи. Микрофон (обязателен на macOS), звук с компьютера
// (по желанию), модель распознавания (качается с первого экрана). Готовая задача «загорается»;
// когда есть микрофон и модель, из размытия поднимается «Открыть ShadeNotes».
// На Windows и Linux остаётся только модель.
'use client';

import { useState } from 'react';
import { Check, Microphone, Sparkle, SpeakerHigh, UserSound } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import type { AccessKind, AccessState } from '@/aid/lib/onboarding';
import { t } from '@/aid/strings';
import type { SpeechModelState } from './AidOnboarding';
import { ProgressBar, QuietLink, TaskTile, TileButton, riseDelay } from './parts';
import { accessSettled, useAccessChecks } from './useAccessChecks';

const LOGO_SRC = '/brand/shadenotes.svg';

const ACCESS = {
  microphone: { icon: Microphone, title: t('obMic'), hint: t('obMicHint') },
  systemAudio: { icon: SpeakerHigh, title: t('obSystemOptional'), hint: t('obSystemHint') },
} as const;

function accessCaption(kind: AccessKind, state: AccessState) {
  switch (state) {
    case 'pending':
      return t('obPending');
    case 'granted':
      return t('obGranted');
    case 'denied':
      return t('obDenied');
    case 'unverified':
      return t('obUnverified');
    case 'slow':
      return t('obSlow');
    default:
      return ACCESS[kind].hint;
  }
}

const mb = (value: number) => Math.round(value).toLocaleString('ru-RU');

export function TasksStep({
  isMac,
  speech,
  summaryReady,
  busy,
  onRetry,
  onMicLater,
  onOpen,
}: {
  isMac: boolean;
  speech: SpeechModelState;
  summaryReady: boolean;
  busy: boolean;
  onRetry: () => void;
  onMicLater: () => void;
  onOpen: () => void;
}) {
  const { state, ask, openSettings } = useAccessChecks();
  const [micLater, setMicLater] = useState(false);
  const micDone = !isMac || accessSettled(state.microphone) || micLater;
  const allDone = micDone && speech.ready;

  const modelCaption = speech.failed
    ? t('obDownloadFailed')
    : speech.ready
      ? t('obModelReady')
      : speech.totalMb > 0
        ? t('obOfMb').replace('{done}', mb(speech.downloadedMb)).replace('{total}', mb(speech.totalMb))
        : t('obPreparing');

  return (
    <div className="flex flex-col gap-2">
      <section
        className={cn('aid-ob-rise grid gap-5 rounded-tile bg-card p-5', isMac && 'sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]')}
        style={riseDelay(0)}
      >
        <div className="flex min-w-0 flex-col">
          {!isMac && (
            // eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений
            <img src={LOGO_SRC} width={48} height={48} alt={t('appName')} draggable={false} className="mb-6 size-12" />
          )}
          <h1 className="mt-auto text-[36px] font-bold leading-[40px] tracking-tight">{t('obTasksTitle')}</h1>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{isMac ? t('obTasksHintMac') : t('obTasksHint')}</p>
        </div>
        {/* Показ: что спросит macOS и что нажать; когда микрофон решён, стоит на «Доступ есть» */}
        {isMac && <DemoPrompt done={micDone} />}
      </section>

      {isMac &&
        (['microphone', 'systemAudio'] as const).map((kind, i) => {
          const st = state[kind];
          const needsSettings = st === 'denied' || st === 'unverified' || st === 'slow';
          const secondary = needsSettings || kind !== 'microphone';
          return (
            <TaskTile
              key={kind}
              delay={80 + i * 60}
              icon={ACCESS[kind].icon}
              // Запись: знак роли лайм на нейтральной плитке
              iconClassName={kind === 'microphone' ? 'text-primary-ink' : undefined}
              title={ACCESS[kind].title}
              caption={accessCaption(kind, st)}
              tone={st === 'denied' ? 'warn' : 'muted'}
              done={st === 'granted'}
              action={
                st === 'granted' ? null : (
                  <Button
                    variant={secondary ? 'outline' : 'default'}
                    className="shrink-0"
                    disabled={st === 'pending'}
                    onClick={() => (needsSettings ? openSettings(kind) : ask(kind, false))}
                  >
                    {st === 'pending' && <Spinner tone="inherit" />}
                    {needsSettings ? t('obOpenSettings') : t('obAllow')}
                  </Button>
                )
              }
            />
          );
        })}

      <TaskTile
        delay={isMac ? 200 : 80}
        icon={UserSound}
        title={t('obSpeechModel')}
        caption={modelCaption}
        tone={speech.failed ? 'warn' : 'muted'}
        done={speech.ready}
        action={
          speech.failed ? (
            <Button variant="outline" className="shrink-0" disabled={speech.retrying} onClick={onRetry}>
              {speech.retrying && <Spinner tone="inherit" />}
              {t('retry')}
            </Button>
          ) : speech.ready ? null : speech.percent > 0 ? (
            <span className="shrink-0 text-[17px] font-bold tabular-nums">{Math.round(speech.percent)}%</span>
          ) : (
            <Spinner className="shrink-0" />
          )
        }
      >
        {!speech.ready && <ProgressBar percent={speech.percent} failed={speech.failed} label={t('obSpeechModel')} />}
      </TaskTile>

      <p className="aid-ob-rise flex items-center justify-center gap-2 px-5 text-[13px] leading-5 text-muted-foreground" style={riseDelay(260)}>
        <Sparkle className="size-4 shrink-0 text-indigo-ink" aria-hidden />
        {summaryReady ? t('obSummaryReady') : t('obSummaryLater')}
      </p>

      {allDone ? (
        <TileButton className="aid-ob-rise" busy={busy} onClick={onOpen}>
          {t('obOpenApp')}
        </TileButton>
      ) : (
        <div className="flex flex-col items-center">
          <p className="px-5 text-center text-[13px] leading-5 text-muted-foreground">
            {isMac && !micDone ? t('obWaitMicAndModel') : t('obWaitModel')}
          </p>
          {isMac && !micDone && (
            <QuietLink
              onClick={() => {
                setMicLater(true);
                onMicLater();
              }}
            >
              {t('obMicLater')}
            </QuietLink>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Показ запроса macOS (цикл 5 с): окно «ShadeNotes просит доступ к микрофону», указатель
 * нажимает «Разрешить», затем «Доступ есть». Иллюстрация, а не настоящий статус: настоящий
 * в плитке «Микрофон» ниже. done: доступ решён, цикл останавливается на последнем кадре.
 */
function DemoPrompt({ done }: { done: boolean }) {
  return (
    <div aria-hidden data-done={done || undefined} className="aid-ob-prompt relative flex h-[156px] min-w-0 items-center justify-center overflow-hidden rounded-nested bg-muted">
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
