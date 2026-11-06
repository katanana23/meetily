// Шаг 3 «Почти готово»: прогресс модели распознавания; «Открыть ShadeNotes» активна, как только
// она скачана. Модель для итогов докачивается в фоне (тост DownloadProgressToastProvider
// появится уже в приложении). Ошибка загрузки: понятный текст и «Повторить».
'use client';

import { Sparkle, UserSound } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { HINT_CLASS, TITLE_CLASS, mainButtonClass } from './ui';

export interface SpeechModelState {
  ready: boolean;
  percent: number;
  downloadedMb: number;
  totalMb: number;
  failed: boolean;
  retrying: boolean;
}

const mb = (value: number) => Math.round(value).toLocaleString('ru-RU');

export function ReadyStep({
  speech,
  summaryReady,
  busy,
  onRetry,
  onOpen,
}: {
  speech: SpeechModelState;
  summaryReady: boolean;
  busy: boolean;
  onRetry: () => void;
  onOpen: () => void;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(speech.percent)));
  const caption = speech.failed
    ? t('obDownloadFailed')
    : speech.ready
      ? t('obModelReady')
      : speech.totalMb > 0
        ? t('obOfMb').replace('{done}', mb(speech.downloadedMb)).replace('{total}', mb(speech.totalMb))
        : t('obPreparing');

  return (
    <div className="flex flex-col">
      <h1 className={TITLE_CLASS}>{t('obReadyTitle')}</h1>
      <p className={`mt-2 ${HINT_CLASS}`}>{t('obReadyHint')}</p>

      <div className="mt-6 rounded-nested bg-muted py-4 pl-4 pr-3">
        <div className="flex items-center gap-3">
          <UserSound className="size-6 shrink-0 text-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-6">{t('obSpeechModel')}</p>
            <p role="status" className={cn('text-pretty text-[13px] leading-5', speech.failed ? 'text-giants-ink' : 'text-muted-foreground')}>
              {caption}
            </p>
          </div>
          {speech.failed ? (
            <Button variant="outline" className="shrink-0 bg-card hover:bg-background" disabled={speech.retrying} onClick={onRetry}>
              {speech.retrying && <Spinner size={20} tone="inherit" />}
              {t('retry')}
            </Button>
          ) : speech.ready ? null : percent === 0 ? (
            <Spinner size={20} className="shrink-0" />
          ) : (
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">{percent}%</span>
          )}
        </div>
        {/* Полоса прогресса: scaleX, без анимации ширины */}
        <div
          role="progressbar"
          aria-label={t('obSpeechModel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mr-1 mt-3 h-2 overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className={cn('aid-ob-bar h-full w-full rounded-full', speech.failed ? 'bg-giants' : 'bg-[hsl(var(--primary-edge))]')}
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 pl-4 text-[13px] leading-5 text-muted-foreground">
        <Sparkle className="size-4 shrink-0 text-indigo-ink" aria-hidden />
        {summaryReady ? t('obSummaryReady') : t('obSummaryLater')}
      </p>

      <Button size="main" className={mainButtonClass(busy, 'mt-6')} aria-busy={busy} disabled={!speech.ready || busy} onClick={onOpen}>
        {busy && <Spinner size={20} tone="inherit" />}
        {busy ? t('obOpening') : t('obOpenApp')}
      </Button>
    </div>
  );
}
