// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Loader2, Pause, Play, Square } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { toSegment } from '@/aid/lib/meeting';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useTranscripts } from '@/contexts/TranscriptContext';

interface RecordingViewProps {
  isPaused: boolean;
  isFinishing: boolean;
  duration: number;
  busy: 'pause' | 'stop' | null;
  onStop: () => void;
  onTogglePause: () => void;
}

export function RecordingView({ isPaused, isFinishing, duration, busy, onStop, onTogglePause }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment), [transcripts]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length]);

  if (isFinishing) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[880px] items-center px-8 py-10">
        <Card className="w-full px-8 py-14 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <h1 className="mt-5 text-2xl font-semibold">{t('saving')}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{t('savingHint')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 py-10">
      <Card className="flex flex-wrap items-center justify-between gap-6 p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
            <span
              className={cn('size-2.5 rounded-full', isPaused ? 'bg-muted-foreground' : 'animate-pulse bg-destructive')}
              aria-hidden
            />
            {isPaused ? t('paused') : t('recording')}
          </div>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight" aria-live="off">
            {formatTimer(duration)}
          </p>
          {meetingTitle && <p className="mt-1 truncate text-sm text-muted-foreground">{meetingTitle}</p>}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="xl" onClick={onTogglePause} disabled={busy !== null}>
            {isPaused ? <Play /> : <Pause />}
            {isPaused ? t('resumeRecording') : t('pauseRecording')}
          </Button>
          <Button variant="destructive" size="xl" onClick={onStop} disabled={busy !== null}>
            {busy === 'stop' ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />}
            {t('stopRecording')}
          </Button>
        </div>
      </Card>

      <section className="mt-6" aria-label={t('liveTranscript')}>
        <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">{t('liveTranscript')}</h2>
        {segments.length === 0 ? (
          <Card className="px-8 py-12">
            <p className="text-lg font-semibold">{t('waitingSpeech')}</p>
            <p className="mt-1 text-[15px] text-muted-foreground">{t('waitingSpeechHint')}</p>
            <div className="mt-6 space-y-3" aria-hidden>
              <Skeleton className="h-4 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
            </div>
          </Card>
        ) : (
          <Card className="px-2 py-2">
            <TranscriptList segments={segments} live />
            <div ref={endRef} />
          </Card>
        )}
      </section>
    </div>
  );
}
