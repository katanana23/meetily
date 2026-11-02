// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).
// Здесь же напоминание предупредить участников (вместо тоста оригинала)
// и ошибки распознавания во время записи.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, Check, Loader2, Pause, Play, Square } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { toSegment } from '@/aid/lib/meeting';
import { displayTitle, formatTimer } from '@/aid/lib/format';
import type { FinishPhase } from '@/aid/lib/recording';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useTranscripts } from '@/contexts/TranscriptContext';

interface RecordingViewProps {
  isPaused: boolean;
  phase: FinishPhase | null;
  duration: number;
  busy: 'pause' | 'stop' | 'check' | null;
  onStop: () => void;
  onTogglePause: () => void;
}

const PHASE: Record<FinishPhase, { title: string; hint: string }> = {
  transcribing: { title: t('finishTranscribing'), hint: t('finishTranscribingHint') },
  saving: { title: t('saving'), hint: t('savingHint') },
  opening: { title: t('saved'), hint: t('savedHint') },
  discarding: { title: t('finishTranscribing'), hint: t('discardingHint') },
};

const NOTICE_KEY = 'show_recording_notification'; // тот же ключ, что у оригинала (recordingNotification.tsx)

/** Напоминание предупредить участников. Настройка общая с оригиналом: preferences.json. */
function ConsentNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { Store } = await import('@tauri-apps/plugin-store');
        const store = await Store.load('preferences.json');
        const value = (await store.get<boolean>(NOTICE_KEY)) ?? true;
        if (alive) setShow(value);
      } catch {
        if (alive) setShow(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const never = async () => {
    setShow(false);
    try {
      const { Store } = await import('@tauri-apps/plugin-store');
      const store = await Store.load('preferences.json');
      await store.set(NOTICE_KEY, false);
      await store.save();
    } catch (error) {
      console.error('[aid] Не удалось сохранить настройку напоминания:', error);
    }
  };

  if (!show) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-5 py-3">
      <p className="text-sm">{t('consentNotice')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => void never()}>
          {t('consentNever')}
        </Button>
        <Button variant="outline" className="h-9 px-3" onClick={() => setShow(false)}>
          <Check />
          {t('consentDone')}
        </Button>
      </div>
    </div>
  );
}

/** Ошибки распознавания во время записи: звук пишется дальше, а текста не будет. */
function useTranscriptionProblems() {
  const [error, setError] = useState<{ message: string; raw: string } | null>(null);
  const [lagging, setLagging] = useState(false);

  useEffect(() => {
    const offs = [
      listen<{ error?: string; userMessage?: string; phase?: string }>('transcription-error', (e) => {
        if (e.payload?.phase === 'startup') return; // ошибку старта показывает главная
        setError({ message: t('transcriptionStopped'), raw: e.payload?.error || e.payload?.userMessage || '' });
      }),
      listen<string>('transcript-error', (e) => setError({ message: t('transcriptionStopped'), raw: String(e.payload ?? '') })),
      listen('chunk-drop-warning', () => setLagging(true)),
    ];
    return () => {
      offs.forEach((p) => void p.then((off) => off()));
    };
  }, []);

  return { error, lagging };
}

export function RecordingView({ isPaused, phase, duration, busy, onStop, onTogglePause }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment), [transcripts]);
  const endRef = useRef<HTMLDivElement>(null);
  const problems = useTranscriptionProblems();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length]);

  if (phase) {
    const copy = PHASE[phase];
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[880px] items-center px-8 py-10">
        <Card className="w-full px-8 py-14 text-center" role="status" aria-live="polite">
          {phase === 'opening' ? (
            <Check className="mx-auto size-8 text-primary" aria-hidden />
          ) : (
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
          )}
          <h1 className="mt-5 text-2xl font-semibold">{copy.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{copy.hint}</p>
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
          {meetingTitle && <p className="mt-1 truncate text-sm text-muted-foreground">{displayTitle(meetingTitle)}</p>}
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

      <ConsentNotice />

      {problems.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <div>
            <AlertTitle>{problems.error.message}</AlertTitle>
            <AlertDescription>
              <p>{t('transcriptionStoppedHint')}</p>
              <ErrorDetails raw={problems.error.raw} />
            </AlertDescription>
          </div>
        </Alert>
      )}
      {!problems.error && problems.lagging && (
        <p className="mt-4 px-1 text-sm text-muted-foreground" role="status">
          {t('transcriptionLagging')}
        </p>
      )}

      <section className="mt-6" aria-label={t('liveTranscript')}>
        {segments.length === 0 ? (
          <Card className="px-8 py-12 text-center">
            <p className="text-lg font-semibold">{t('waitingSpeech')}</p>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-muted-foreground">{t('waitingSpeechHint')}</p>
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
