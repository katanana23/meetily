// Экран записи: таймер, пауза, стоп и транскрипт в реальном времени.
// Реплики приходят из TranscriptContext (событие ядра transcript-update).
// Здесь же напоминание предупредить участников (вместо тоста оригинала),
// ошибки распознавания и «Похоже, встреча закончилась» после 2 минут тишины
// (сигналы: recording-outcome.tsx). «Не слышу речи» в плитке записи (RecordDock).
// Раскладка бенто: шапка-плитка, плитка уведомлений (если есть), «Пульс разговора»
// и плитка транскрипта.

'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTauriEvent } from '@/aid/lib/tauri-events';
import { ArrowDown, Stop, Warning } from '@phosphor-icons/react';
import { useFollowTail } from '@/aid/lib/follow-tail';
import { FinishGlyph } from '@/aid/components/FinishCard';
import { BackButton } from '@/aid/components/BackButton';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page, TILE } from '@/aid/components/Page';
import type { LiveSpeech } from '@/aid/lib/recording-outcome';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { LivePulse } from '@/aid/components/LivePulse';
import { VoiceGlow } from '@/aid/components/VoiceGlow';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { toSegment } from '@/aid/lib/meeting';
import { displayTitle } from '@/aid/lib/format';
import { isShownText } from '@/aid/lib/speech';
import { t } from '@/aid/strings';
import { useTranscripts } from '@/contexts/TranscriptContext';

interface RecordingViewProps {
  isPaused: boolean;
  duration: number;
  live: LiveSpeech;
  /** К списку встреч: запись продолжается, управление в кнопке записи внизу. */
  onBack: () => void;
  onStop: () => void;
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
        <Button variant="destructive" size="main" onClick={onStop}>
          <Stop />
          {t('stopRecording')}
        </Button>
      </div>
    </div>
  );
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

export function RecordingView({ isPaused, duration, live, onBack, onStop }: RecordingViewProps) {
  const { transcripts, meetingTitle } = useTranscripts();
  // Галлюцинации на тишине («Thank you.» на 0:00) не показываем (speech.ts, isShownText)
  const segments = useMemo(() => transcripts.filter((tr) => tr.text?.trim()).map(toSegment).filter((x) => isShownText(x.text)), [transcripts]);
  const listRef = useRef<HTMLDivElement>(null);
  const problems = useTranscriptionProblems();
  // «Продолжить» откладывает вопрос: следующий раз через те же 2 минуты тишины
  const [silenceDismissedAt, setSilenceDismissedAt] = useState(0);

  const silentSince = Math.max(live.lastSpeechAt ?? 0, silenceDismissedAt);
  const showLongSilence =
    live.tracking && !isPaused && live.lastSpeechAt !== null && duration - silentSince >= LONG_SILENCE_SEC;

  // Лента едет за новыми репликами, только если человек внизу (lib/follow-tail.ts)
  const hasLines = segments.length > 0;
  const { atBottom, jumpToEnd } = useFollowTail(listRef, hasLines);
  // Реплики, которые уже были, когда экран записи открылся (вернулись из списка):
  // их не перепечатываем; всё, что пришло после, печатается, включая первую
  const [settledIds] = useState(() => new Set(segments.map((x) => x.id)));

  // Шапка: «Назад» к списку (запись идёт дальше), большое название прокручивается с
  // лентой, в полосе остаётся короткое. Состояние записи, таймер, уровень речи, пауза и
  // «Остановить» только в капсуле записи (RecordDock).
  const title = meetingTitle ? displayTitle(meetingTitle) : t('recording');
  // Свечение голоса за капсулой: живое на записи, тонкая линия на паузе, уходит после «Остановить»
  const { busy } = useRecordingControls();
  const glow = busy === 'stop' ? 'off' : isPaused ? 'paused' : 'listen';

  return (
    <Page
      layout="bento"
      leading={<BackButton label={t('backFromRecording')} onClick={onBack} />}
      title={title}
      hero={<h1 className="truncate text-[36px] font-bold leading-10 tracking-tight">{title}</h1>}
    >
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

      {/* Снизу запас на высоту свечения: последняя реплика над ним */}
      <section className={`${TILE} relative isolate flex flex-col`} style={{ paddingBottom: 'var(--glow-h)' }} aria-label={t('liveTranscript')}>
        {/* Первым ребёнком: замер «доходит ли контент до капсулы» (Page) смотрит на последний */}
        <VoiceGlow mode={glow} />
        <h2 className="mb-4 text-[22px] font-bold leading-7 tracking-tight">{t('transcript')}</h2>
        {segments.length === 0 ? (
          // Ждём речь: по центру плитки мягкая иллюстрация (та же волна записи, что в карточке
          // после «Остановить», крупнее, на вложенной поверхности) и одна строка. Логотип не
          // повторяем. Запас под капсулу и свечение даёт сама плитка (--glow-h)
          <div className="flex min-h-[228px] flex-1 flex-col items-center justify-center gap-3" role="status">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
              <span className="scale-[1.6]">
                <FinishGlyph stage="transcribing" />
              </span>
            </span>
            <p className="aid-fg-text text-[15px] font-semibold">{t('waitingSpeech')}</p>
          </div>
        ) : (
          <>
            <div ref={listRef} className="max-w-[760px]">
              <TranscriptList segments={segments} live settledIds={settledIds} />
            </div>
            {/* Прокрутили вверх: лента стоит, над капсулой записи «К новым». Нулевая высота:
                появление кнопки не двигает ленту */}
            {!atBottom && (
              <div className="pointer-events-none sticky bottom-[calc(var(--dock-space)-12px)] z-20 flex h-0 justify-center">
                <button
                  type="button"
                  onClick={jumpToEnd}
                  className="aid-glass aid-dock-in pointer-events-auto absolute bottom-0 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
                >
                  <ArrowDown aria-hidden />
                  {t('toLatest')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </Page>
  );
}

/** Плитка уведомлений экрана записи: показывается, только если внутри что-то есть. */
function ConsentTile({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 rounded-tile bg-card p-5 empty:hidden [&:not(:has(*))]:hidden">{children}</div>;
}
