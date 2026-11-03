// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).
// Здесь же напоминание предупредить участников (вместо тоста оригинала),
// ошибки распознавания и подсказки по тишине: «Не слышу речи» в первые 20 с
// и «Похоже, встреча закончилась» после 2 минут тишины (сигналы: recording-outcome.tsx).

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { CheckCircle, SpinnerGap, MicrophoneSlash, Pause, Play, SpeakerHigh, Stop, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page } from '@/aid/components/Page';
import { SoundCheckDialog, silenceCause, useSoundState } from '@/aid/components/SoundCheck';
import type { LiveSpeech } from '@/aid/lib/recording-outcome';
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
  live: LiveSpeech;
  onStop: () => void;
  onTogglePause: () => void;
}

/** Через сколько секунд без единого речевого сегмента показать «Не слышу речи». */
export const NO_SPEECH_HINT_SEC = 20;
/** Сколько секунд тишины после речи, чтобы спросить «Остановить?». Сама запись не останавливается. */
export const LONG_SILENCE_SEC = 120;

/** «Не слышу речи»: за первые 20 с VAD не нашёл ни одного речевого сегмента. */
function NoSpeechHint() {
  const [open, setOpen] = useState(false);
  const sound = useSoundState(true);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card px-5 py-4" role="status">
      <MicrophoneSlash className="size-5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('noSpeechTitle')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{silenceCause(sound)}</p>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SpeakerHigh />
        {t('soundCheck')}
      </Button>
      <SoundCheckDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Долгая тишина после речи: предложить остановить, но не останавливать самим. */
function LongSilencePrompt({ onStop, onContinue }: { onStop: () => void; onContinue: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card px-5 py-4" role="alert">
      <p className="min-w-0 flex-1 text-sm font-semibold">{t('longSilence')}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onContinue}>
          {t('continueRecording')}
        </Button>
        <Button variant="destructive" onClick={onStop}>
          <Stop />
          {t('stopRecording')}
        </Button>
      </div>
    </div>
  );
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-5 py-3">
      <p className="text-sm">{t('consentNotice')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => void never()}>
          {t('consentNever')}
        </Button>
        <Button variant="outline" className="h-9 px-3" onClick={() => setShow(false)}>
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

export function RecordingView({ isPaused, phase, duration, busy, live, onStop, onTogglePause }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment), [transcripts]);
  const endRef = useRef<HTMLDivElement>(null);
  const problems = useTranscriptionProblems();
  // «Продолжить» откладывает вопрос: следующий раз через те же 2 минуты тишины
  const [silenceDismissedAt, setSilenceDismissedAt] = useState(0);

  const heardNothing = live.vadSegments === 0 && live.textSegments === 0;
  const showNoSpeech = live.tracking && heardNothing && duration >= NO_SPEECH_HINT_SEC;
  const silentSince = Math.max(live.lastSpeechAt ?? 0, silenceDismissedAt);
  const showLongSilence =
    live.tracking && !isPaused && live.lastSpeechAt !== null && duration - silentSince >= LONG_SILENCE_SEC;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length]);

  if (phase) {
    const copy = PHASE[phase];
    return (
      <Page width="max-w-[840px]">
        <Card className="mt-10 w-full px-8 py-14 text-center" role="status" aria-live="polite">
          {phase === 'opening' ? (
            <CheckCircle className="mx-auto size-8 text-primary" aria-hidden />
          ) : (
            <SpinnerGap className="mx-auto size-8 animate-spin text-primary" aria-hidden />
          )}
          <h1 className="mt-5 text-2xl font-semibold">{copy.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{copy.hint}</p>
        </Card>
      </Page>
    );
  }

  // Панель записи в неподвижной шапке: таймер и «Остановить» всегда под рукой
  const header = (
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
            {busy === 'stop' ? <SpinnerGap className="animate-spin" /> : <Stop />}
            {t('stopRecording')}
          </Button>
        </div>
      </Card>
  );

  return (
    <Page width="max-w-[840px]" header={header}>
      {showLongSilence && <LongSilencePrompt onStop={onStop} onContinue={() => setSilenceDismissedAt(duration)} />}
      {!showLongSilence && showNoSpeech && <NoSpeechHint />}

      <ConsentNotice />

      {problems.error && (
        <Alert variant="destructive" className="mb-4">
          <WarningCircle />
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
        <p className="mb-4 px-1 text-sm text-muted-foreground" role="status">
          {t('transcriptionLagging')}
        </p>
      )}

      <section className="pt-2" aria-label={t('liveTranscript')}>
        {segments.length === 0 ? (
          <Card className="flex flex-col items-center px-8 py-12 text-center">
            <SpeakerHigh className="size-5 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-lg font-semibold">{t('waitingSpeech')}</p>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-muted-foreground">{t('waitingSpeechHint')}</p>
          </Card>
        ) : (
          <>
            <TranscriptList segments={segments} live />
            <div ref={endRef} />
          </>
        )}
      </section>
    </Page>
  );
}
