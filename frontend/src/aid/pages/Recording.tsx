// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).
// Здесь же напоминание предупредить участников (вместо тоста оригинала),
// ошибки распознавания и подсказки по тишине: «Не слышу речи» в первые 20 с
// и «Похоже, встреча закончилась» после 2 минут тишины (сигналы: recording-outcome.tsx).

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTauriEvent } from '@/aid/lib/tauri-events';
import { Check, MicrophoneSlash, SpeakerHigh, Stop, Warning } from '@phosphor-icons/react';
import { BackButton } from '@/aid/components/BackButton';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page } from '@/aid/components/Page';
import { SoundCheckDialog, silenceCause, useSoundState } from '@/aid/components/SoundCheck';
import type { LiveSpeech } from '@/aid/lib/recording-outcome';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { toSegment } from '@/aid/lib/meeting';
import { displayTitle } from '@/aid/lib/format';
import type { FinishPhase } from '@/aid/lib/recording';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useTranscripts } from '@/contexts/TranscriptContext';

interface RecordingViewProps {
  isPaused: boolean;
  phase: FinishPhase | null;
  duration: number;
  live: LiveSpeech;
  /** К списку встреч: запись продолжается, управление в кнопке записи внизу. */
  onBack: () => void;
  onStop: () => void;
}

/** Через сколько секунд без единой осмысленной реплики показать «Не слышу речи». */
export const NO_SPEECH_HINT_SEC = 20;
/** Сколько секунд тишины после речи, чтобы спросить «Остановить?». Сама запись не останавливается. */
export const LONG_SILENCE_SEC = 120;

/** «Не слышу речи»: 20 с без единой осмысленной реплики (шум и галлюцинации не в счёт). */
function NoSpeechHint() {
  const [open, setOpen] = useState(false);
  const sound = useSoundState(true);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-tile bg-card p-4" role="status">
      <MicrophoneSlash className="size-5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('noSpeechTitle')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{silenceCause(sound)}</p>
      </div>
      <Button variant="outline" size="main" onClick={() => setOpen(true)}>
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
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-tile bg-card p-4" role="alert">
      <p className="min-w-0 flex-1 text-sm font-semibold">{t('longSilence')}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="main" onClick={onContinue}>
          {t('continueRecording')}
        </Button>
        <Button variant="destructive" size="main" onClick={onStop}>
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
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-tile bg-card px-4 py-3">
      <p className="text-sm">{t('consentNotice')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 px-4 text-muted-foreground" onClick={() => void never()}>
          {t('consentNever')}
        </Button>
        <Button variant="outline" className="h-10 px-4" onClick={() => setShow(false)}>
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

  useTauriEvent<{ error?: string; userMessage?: string; phase?: string }>('transcription-error', (e) => {
    if (e.payload?.phase === 'startup') return; // ошибку старта показывает главная
    setError({ message: t('transcriptionStopped'), raw: e.payload?.error || e.payload?.userMessage || '' });
  });
  useTauriEvent<string>('transcript-error', (e) => setError({ message: t('transcriptionStopped'), raw: String(e.payload ?? '') }));
  useTauriEvent('chunk-drop-warning', () => setLagging(true));

  return { error, lagging };
}

export function RecordingView({ isPaused, phase, duration, live, onBack, onStop }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment), [transcripts]);
  const endRef = useRef<HTMLDivElement>(null);
  const problems = useTranscriptionProblems();
  // «Продолжить» откладывает вопрос: следующий раз через те же 2 минуты тишины
  const [silenceDismissedAt, setSilenceDismissedAt] = useState(0);

  // То же правило, что после стопа: ложные срабатывания детектора на шум без
  // осмысленного текста речью не считаются, поэтому подсказка от них не мигает
  const heardNothing = live.textSegments === 0 && !live.recognitionFailed;
  const showNoSpeech = live.tracking && heardNothing && duration >= NO_SPEECH_HINT_SEC;
  const silentSince = Math.max(live.lastSpeechAt ?? 0, silenceDismissedAt);
  const showLongSilence =
    live.tracking && !isPaused && live.lastSpeechAt !== null && duration - silentSince >= LONG_SILENCE_SEC;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length]);
  // Реплики, которые уже были, когда экран записи открылся (вернулись из списка):
  // их не перепечатываем; всё, что пришло после, печатается, включая первую
  const [settledIds] = useState(() => new Set(segments.map((x) => x.id)));
  // Реплика допечатана (печатная машинка в TranscriptList): докрутить к концу
  const scrollToEnd = useCallback(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), []);

  if (phase) {
    const copy = PHASE[phase];
    return (
      <Page width="max-w-[840px]">
        <Card className="mt-6 w-full px-6 py-12 text-center" role="status" aria-live="polite">
          {phase === 'opening' ? (
            <Check weight="bold" className="mx-auto size-5 text-primary-ink" aria-hidden />
          ) : (
            <Spinner className="mx-auto" />
          )}
          <h1 className="mt-5 text-2xl font-semibold">{copy.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{copy.hint}</p>
        </Card>
      </Page>
    );
  }

  // Шапка: «Назад» к списку (запись идёт дальше), состояние и название.
  // Таймер, пауза и «Остановить» в кнопке записи внизу (RecordDock).
  const header = (
    <div className="flex items-center gap-3">
      <BackButton label={t('backFromRecording')} onClick={onBack} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className={cn('size-2.5 rounded-full', isPaused ? 'bg-muted-foreground' : 'aid-dock-dot bg-destructive')} aria-hidden />
          {isPaused ? t('paused') : t('recording')}
        </div>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{meetingTitle ? displayTitle(meetingTitle) : t('recording')}</h1>
      </div>
    </div>
  );

  return (
    <Page width="max-w-[840px]" header={header}>
      {showLongSilence && <LongSilencePrompt onStop={onStop} onContinue={() => setSilenceDismissedAt(duration)} />}
      {!showLongSilence && showNoSpeech && <NoSpeechHint />}

      <ConsentNotice />

      {problems.error && (
        <Alert variant="destructive" className="mb-2">
          <Warning />
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
          <Card className="flex flex-col items-center px-6 py-12 text-center">
            <SpeakerHigh className="size-5 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-lg font-semibold">{t('waitingSpeech')}</p>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-muted-foreground">{t('waitingSpeechHint')}</p>
          </Card>
        ) : (
          <>
            <TranscriptList segments={segments} live onTyped={scrollToEnd} settledIds={settledIds} />
            <div ref={endRef} />
          </>
        )}
      </section>
    </Page>
  );
}
