// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).
// Здесь же напоминание предупредить участников (вместо тоста оригинала),
// ошибки распознавания и «Похоже, встреча закончилась» после 2 минут тишины
// (сигналы: recording-outcome.tsx). «Не слышу речи» в плитке записи (RecordDock).
// Раскладка бенто: шапка-плитка, плитка уведомлений (если есть), «Пульс разговора»
// и плитка транскрипта.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTauriEvent } from '@/aid/lib/tauri-events';
import { SpeakerHigh, Stop, Warning } from '@phosphor-icons/react';
import { BackButton } from '@/aid/components/BackButton';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page, TILE } from '@/aid/components/Page';
import type { LiveSpeech } from '@/aid/lib/recording-outcome';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { LivePulse } from '@/aid/components/LivePulse';
import { FinishingScreen, type FinishStage } from '@/aid/components/FinishingScreen';
import { toSegment } from '@/aid/lib/meeting';
import { displayTitle } from '@/aid/lib/format';
import type { FinishPhase } from '@/aid/lib/recording';
import { t } from '@/aid/strings';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { RecordingStatus, useRecordingState } from '@/contexts/RecordingStateContext';

interface RecordingViewProps {
  isPaused: boolean;
  phase: FinishPhase | null;
  duration: number;
  live: LiveSpeech;
  /** К списку встреч: запись продолжается, управление в кнопке записи внизу. */
  onBack: () => void;
  onStop: () => void;
  /** Запись не сохраняется: тишина или пара фраз (заголовок экрана завершения). */
  discardVerdict?: 'no-speech' | 'too-little' | null;
}

/** Сколько секунд тишины после речи, чтобы спросить «Остановить?». Сама запись не останавливается.
 *  «Не слышу речи» (первые 20 с без реплик) живёт в плитке записи (RecordDock). */
export const LONG_SILENCE_SEC = 120;

/** Долгая тишина после речи: предложить остановить, но не останавливать самим. */
function LongSilencePrompt({ onStop, onContinue }: { onStop: () => void; onContinue: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-nested bg-muted p-4" role="alert">
      <p className="min-w-0 flex-1 text-sm font-semibold">{t('longSilence')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="main" onClick={onContinue}>
          {t('continueRecording')}
        </Button>
        {/* Красный только у стопа и удаления */}
        <Button size="main" className="bg-record text-white hover:bg-record/90" onClick={onStop}>
          <Stop />
          {t('stopRecording')}
        </Button>
      </div>
    </div>
  );
}

// Итог решения «не сохранять» (тишина или пара фраз) показывается только после решения;
// до него стадии экрана обработки идут по статусу записи (FinishingScreen)
const NO_SPEECH = { title: t('discardedNoSpeech'), hint: t('discardedNoSpeechHint') };
const TOO_LITTLE = { title: t('discardedTooLittle'), hint: t('discardedTooLittleHint') };

/** Стадия экрана обработки по статусу записи оригинала (RecordingStateContext): сцены обложки по факту, не по таймеру. */
function finishStage(phase: FinishPhase, status: RecordingStatus): FinishStage {
  if (phase === 'discarding') return 'discarded';
  if (status === RecordingStatus.STOPPING) return 'stopped';
  if (status === RecordingStatus.PROCESSING_TRANSCRIPTS) return 'transcribing';
  if (status === RecordingStatus.SAVING) return 'saving';
  if (status === RecordingStatus.COMPLETED) return 'saved';
  return phase === 'opening' ? 'saved' : phase === 'saving' ? 'saving' : 'transcribing';
}

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
    // Прямо на плитке, без вложенной подложки
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[15px]">{t('consentNotice')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 px-4 text-muted-foreground" onClick={() => void never()}>
          {t('consentNever')}
        </Button>
        <Button variant="secondary" className="h-10 px-4" onClick={() => setShow(false)}>
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

export function RecordingView({ isPaused, phase, duration, live, onBack, onStop, discardVerdict = null }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  const { status } = useRecordingState();
  // После остановки таймер записи обнуляется: для экрана обработки держим последнюю длительность.
  // Если экран открылся уже после остановки, берём время последней реплики или сигнала речи
  const lastDuration = useRef(0);
  if (duration > 0) lastDuration.current = duration;
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment), [transcripts]);
  const endRef = useRef<HTMLDivElement>(null);
  const problems = useTranscriptionProblems();
  // «Продолжить» откладывает вопрос: следующий раз через те же 2 минуты тишины
  const [silenceDismissedAt, setSilenceDismissedAt] = useState(0);

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
    // Своя плитка без запаса под капсулу записи: на этом экране её нет (RecordDock)
    return (
      <main className="aid-page-in aid-scroll relative flex h-full min-w-0 flex-1 overflow-y-auto rounded-tile bg-card px-5">
        <FinishingScreen
          stage={finishStage(phase, status)}
          discardCopy={discardVerdict === 'too-little' ? TOO_LITTLE : NO_SPEECH}
          title={meetingTitle ? displayTitle(meetingTitle) : null}
          durationSec={Math.max(lastDuration.current, ...segments.map((x) => x.start ?? 0), ...live.speechTimes)}
          segments={segments}
          speechTimes={live.speechTimes}
        />
      </main>
    );
  }

  // Шапка-плитка: «Назад» к списку (запись идёт дальше) и название. Состояние записи,
  // таймер, уровень речи, пауза и «Остановить» только в плитке записи (RecordDock).
  const header = (
    <div className="flex items-center gap-4">
      <BackButton label={t('backFromRecording')} onClick={onBack} />
      <div className="min-w-0">
        <h1 className="truncate text-[36px] font-bold leading-10 tracking-tight">{meetingTitle ? displayTitle(meetingTitle) : t('recording')}</h1>
      </div>
    </div>
  );

  return (
    <Page layout="bento" header={header}>
      {/* Уведомления одной плиткой: «Похоже, встреча закончилась», напоминание об участниках, ошибки */}
      <ConsentTile>
        {showLongSilence && <LongSilencePrompt onStop={onStop} onContinue={() => setSilenceDismissedAt(duration)} />}
        <ConsentNotice />
        {problems.error && (
          <Alert variant="destructive">
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
          <p className="px-1 text-sm text-muted-foreground" role="status">
            {t('transcriptionLagging')}
          </p>
        )}
      </ConsentTile>

      <LivePulse live={live} duration={duration} isPaused={isPaused} segments={segments} />

      <section className={TILE} aria-label={t('liveTranscript')}>
        <h2 className="mb-4 text-[22px] font-bold leading-7 tracking-tight">{t('transcript')}</h2>
        {segments.length === 0 ? (
          <div className="flex flex-col items-start py-6">
            <SpeakerHigh className="size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t('waitingSpeech')}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('waitingSpeechHint')}</p>
          </div>
        ) : (
          <div className="max-w-[760px]">
            <TranscriptList segments={segments} live onTyped={scrollToEnd} settledIds={settledIds} />
            <div ref={endRef} />
          </div>
        )}
      </section>
    </Page>
  );
}

/** Плитка уведомлений экрана записи: показывается, только если внутри что-то есть. */
function ConsentTile({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 rounded-tile bg-card p-5 empty:hidden [&:not(:has(*))]:hidden">{children}</div>;
}
