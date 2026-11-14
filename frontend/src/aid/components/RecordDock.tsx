// Запись: плавает внизу по центру поверх контента на всех страницах.
// Состояния:
// - покой: круглая кнопка Mikado 88 px, на 28 px от низа с микрофоном, от неё расходятся две мягкие
//   волны; сочетание клавиш в подсказке;
// - запись: стеклянная капсула (.aid-glass): красная точка с кольцом на речь,
//   таймер, полосы речи, «Пауза» и красная «Остановить»; «Не слышу речи»
//   стеклянной карточкой над капсулой;
// - после «Остановить»: на месте кнопки записи одна карточка (FinishCard), которая меняет
//   состояние на месте: «Дописываю реплики» → «Сохраняю» → «Встреча сохранена» с «Открыть»
//   и крестиком; запись отбракована: та же карточка «Слишком коротко - запись не сохранена».
// Смена состояния появляется из размытия (.aid-dock-in), уходит плавно с размытием
// (.aid-dock-out, уходящая копия), только transform, opacity и filter; prefers-reduced-motion
// оставляет одну прозрачность. Док и тосты одна стопка (lib/notice-stack.ts): док внизу,
// тосты над ним, друг на друга не ложатся.
// Страницы оставляют снизу запас --dock-space, капсула не закрывает последние строки.
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука). Поэтому «уровень» здесь честный уровень речи: полосы за
// последние 9 секунд растут на каждый сигнал детектора речи и каждую реплику,
// кольцо вокруг точки вспыхивает на каждый сигнал.
'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Microphone, MicrophoneSlash, Pause, Play, SpeakerHigh, Stop, Waveform } from '@phosphor-icons/react';
import { FinishCard, type FinishCardStage, type DiscardReason } from '@/aid/components/FinishCard';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { SoundCheckDialog, silenceCause, useSoundState } from '@/aid/components/SoundCheck';
import { useRecordingControls, type FinishState } from '@/aid/lib/recording-controls';
import { previewFinish } from '@/aid/lib/finish-preview';
import { isMicBlocker } from '@/aid/lib/recording';
import { MicAccessCard, MicHint, micHintKind, type MicHintKind } from '@/aid/components/MicNotices';
import { useRecordingOutcome, type LiveSpeech } from '@/aid/lib/recording-outcome';
import { useNoticeStackAnchor } from '@/aid/lib/notice-stack';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useConfig } from '@/contexts/ConfigContext';
import { LANGUAGES } from '@/constants/languages';

/** Через сколько секунд без единой осмысленной реплики показать «Не слышу речи». */
export const NO_SPEECH_HINT_SEC = 20;

const LEVEL_BARS = 9;

/** Сколько длится уход (.aid-dock-out в globals.css). */
const LEAVE_MS = 280;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Карточка над капсулой (подсказки про микрофон и речь, доступ к микрофону): появляется из
 * размытия, а когда show сменилось на false, ещё LEAVE_MS держит последний вид и уходит
 * с размытием (.aid-dock-out). Обёртка одна и та же, содержимое не пересоздаётся.
 */
function DockLeave({ show, children }: { show: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(null);
  if (show) last.current = children;
  const [leaving, setLeaving] = useState(false);
  const was = useRef(show);
  useIsoLayoutEffect(() => {
    if (show) {
      was.current = true;
      setLeaving(false);
      return;
    }
    if (!was.current) return;
    was.current = false;
    setLeaving(true);
    const id = window.setTimeout(() => setLeaving(false), LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [show]);
  if (!show && !leaving) return null;
  return (
    <div className={cn('flex w-full flex-col items-center', !show && 'aid-dock-out pointer-events-none')} aria-hidden={!show || undefined}>
      {show ? children : last.current}
    </div>
  );
}

/** Точка записи с кольцом: вспышка на каждый сигнал речи (ключ меняется, анимация начинается заново). */
function ActivityDot({ pulse, paused }: { pulse: number; paused: boolean }) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center" aria-hidden>
      {!paused && pulse > 0 && <span key={pulse} className="aid-dock-speech absolute inset-0 rounded-full border-2 border-record" />}
      <span className={cn('size-3 rounded-full', paused ? 'bg-foreground/40' : 'aid-dock-dot aid-record-dot')} />
    </span>
  );
}

/** Уровень речи: полоса на каждую секунду за последние 9 с, высота по числу сигналов речи. */
function SpeechLevel({ live, duration, paused }: { live: LiveSpeech; duration: number; paused: boolean }) {
  const now = Math.floor(duration);
  const bars = useMemo(() => {
    const counts = new Map<number, number>();
    for (const sec of live.speechTimes) {
      const b = Math.floor(sec);
      if (b > now - LEVEL_BARS) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return Array.from({ length: LEVEL_BARS }, (_, i) => Math.min(counts.get(now - (LEVEL_BARS - 1) + i) ?? 0, 2) / 2);
  }, [live.speechTimes, now]);
  return (
    <span className="flex h-7 items-end gap-[3px] px-1" aria-hidden>
      {bars.map((v, i) => (
        <span
          key={i}
          className="aid-level-bar h-full w-1 rounded-full bg-foreground"
          style={{ transform: `scaleY(${paused ? 0.12 : 0.18 + v * 0.82})`, opacity: v > 0 ? 1 : 0.35 }}
        />
      ))}
    </span>
  );
}

/** «Не слышу речи» внутри плитки записи: детектор речь слышит или речь не доходит. */
function SpeechHint({ heard }: { heard: boolean }) {
  const [open, setOpen] = useState(false);
  const sound = useSoundState(true);
  const { transcriptModelConfig, selectedLanguage } = useConfig();
  if (heard) {
    const model = [transcriptModelConfig?.provider, transcriptModelConfig?.model].filter(Boolean).join(' · ') || t('unknownModel');
    const code = selectedLanguage || 'auto';
    const language =
      code === 'auto' ? t('languageAuto') : code === 'auto-translate' ? t('languageAutoTranslate') : (LANGUAGES.find((l) => l.code === code)?.name ?? code);
    return (
      <div className="flex min-w-0 items-center gap-3" role="status">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t('heardNoTextTitle')}</p>
          <p className="truncate text-xs text-muted-foreground" title={`${t('recognitionModel')}: ${model}. ${t('recognitionLanguage')}: ${language}.`}>
            {t('recognitionModel')}: {model} · {t('recognitionLanguage')}: {language}
          </p>
        </div>
        <Button asChild size="sm" variant="secondary" className="shrink-0">
          <Link href="/settings?tab=transcription">
            <Waveform />
            {t('openTranscriptionSettings')}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-3" role="status">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{t('noSpeechTitle')}</p>
        {/* 14 px, не больше двух строк; полный текст в подсказке */}
        <p className="line-clamp-2 text-sm text-muted-foreground" title={silenceCause(sound)}>
          {silenceCause(sound)}
        </p>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
        <SpeakerHigh />
        {t('soundCheck')}
      </Button>
      <SoundCheckDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Что показывает карточка после «Остановить». */
interface CardView {
  stage: FinishCardStage;
  title: string | null;
  meetingId: string | null;
  reason?: DiscardReason;
}

/** Кнопка записи в покое: круг 88 px, сплошной Mikado, от него расходятся две волны. */
function RecordButton() {
  const c = useRecordingControls();
  // Известно, что доступа к микрофону нет: кнопка «нужен доступ» (не лаймовая,
  // перечёркнутый микрофон, без волн), клик открывает карточку про микрофон
  if (c.micNeedsAccess && !c.isStarting) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={c.openMicCard}
            aria-label={t('micNeedsAccess')}
            data-aid-record="needs-access"
            className="flex size-[88px] shrink-0 items-center justify-center rounded-full bg-muted text-foreground shadow-lg transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
          >
            <MicrophoneSlash className="size-8" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t('micNeedsAccess')}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="group relative inline-flex size-[88px] shrink-0">
          {!c.isStarting && (
            <>
              <span className="aid-record-wave pointer-events-none absolute inset-0 rounded-full" aria-hidden />
              <span className="aid-record-wave aid-record-wave-late pointer-events-none absolute inset-0 rounded-full" aria-hidden />
            </>
          )}
          <button
            type="button"
            onClick={() => void c.startAnywhere()}
            disabled={c.isStarting}
            aria-label={t('startRecording')}
            aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
            className="aid-record-button relative flex size-full items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-80"
          >
            {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="size-8" aria-hidden />}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {t('startRecording')} · {c.hotkey} {c.hotkeyScope}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Кнопка записи в покое только на списке встреч. На настройках и на странице встречи её нет:
 * там она закрывала строки внизу (на настройках «Отправлять статистику»). Записать можно
 * со списка и сочетанием клавиш, оно работает везде. Капсула идущей записи и итог после
 * неё показываются на всех экранах: это управление записью, его не прячем. Пока кнопки нет,
 * у прокрутки обычный нижний отступ вместо запаса под капсулу (data-dock-off).
 */
function IdleRecordButton() {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const hidden = pathname !== '/' || params.has('id') || params.get('view') === 'settings' || params.has('finish');
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-dock-off', hidden);
    return () => root.removeAttribute('data-dock-off');
  }, [hidden]);
  return hidden ? null : <RecordButton />;
}

export function RecordDock() {
  const c = useRecordingControls();
  const { live, notice } = useRecordingOutcome();
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  // Разработка: карточка на заданном шаге без записи (?finish=…, finish-preview.ts)
  const [preview, setPreview] = useState<FinishState | null>(null);
  useEffect(() => setPreview(previewFinish(new URLSearchParams(window.location.search))), [pathname]);
  const fromFinish = (f: FinishState): CardView => ({ stage: f.stage, title: f.title, meetingId: f.meetingId });
  // Одна карточка на все шаги после стопа: обработка и итог из recording-controls, отбракованная
  // запись из recording-outcome (notice). Ключ состояния один, поэтому она не пересоздаётся
  const card: CardView | null = preview
    ? fromFinish(preview)
    : c.finish
      ? fromFinish(c.finish)
      : notice
        ? { stage: 'discarded', title: null, meetingId: null, reason: notice.verdict }
        : null;
  const state = c.isRecording ? 'recording' : card ? 'finishing' : 'idle';
  const openSaved = (id: string) => {
    c.dismissFinish();
    router.push(`/meeting-details?id=${encodeURIComponent(id)}`);
  };
  const closeCard = card?.stage === 'discarded' ? notice?.dismiss : c.dismissFinish;
  // Микрофон: карточка, если запись не началась из-за него, и подсказки во время записи (MicNotices)
  const [micHintClosed, setMicHintClosed] = useState<MicHintKind | null>(null);
  useEffect(() => setMicHintClosed(null), [c.isRecording]);
  const micHint = state === 'recording' ? micHintKind(c.micState, c.micMode === 'system-only', c.micBlind, c.duration) : null;
  const showMicHint = micHint !== null && micHint !== micHintClosed;
  const micBlocker = state === 'idle' && isMicBlocker(c.blocker) ? c.blocker : null;
  const openRecording = () => {
    c.setView('recording');
    if (pathname !== '/') router.push('/');
  };
  // Правило экрана записи: ложные срабатывания детектора на шум без осмысленного
  // текста речью не считаются
  const showSpeechHint =
    state === 'recording' && !showMicHint && live.tracking && live.textSegments === 0 && !live.recognitionFailed && c.duration >= NO_SPEECH_HINT_SEC;
  // Карточка уходит плавно: последний вид держим ещё LEAVE_MS с анимацией ухода. До отрисовки
  // (layout effect): иначе на кадр карточки нет, и тосты над доком дёргаются вниз и обратно
  const [leaving, setLeaving] = useState<CardView | null>(null);
  const lastCard = useRef<CardView | null>(null);
  const cardKey = card ? `${card.stage}:${card.meetingId ?? ''}:${card.reason ?? ''}:${card.title ?? ''}` : '';
  useIsoLayoutEffect(() => {
    if (state === 'finishing' && card) {
      lastCard.current = card;
      setLeaving(null);
      return;
    }
    const gone = lastCard.current;
    if (!gone) return;
    lastCard.current = null;
    // Ушла в запись (новый старт): без уходящей копии под капсулой
    if (state === 'recording') return;
    setLeaving(gone);
    const id = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(id);
    // card пересоздаётся на каждом рендере; его смысл в cardKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cardKey]);

  // Тосты встают над тем, что сейчас в доке (lib/notice-stack.ts)
  const sectionRef = useRef<HTMLElement>(null);
  useNoticeStackAnchor(sectionRef);

  return (
    <section
      ref={sectionRef}
      aria-label={t('recordingTile')}
      className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex flex-col items-center gap-2 px-4"
    >
      <DockLeave show={showMicHint && micHint !== null}>
        {micHint && (
          <div key={`mic-${micHint}`} className="aid-dock-in aid-glass pointer-events-auto relative w-full max-w-[560px] rounded-tile p-4">
            <MicHint kind={micHint} onClose={() => setMicHintClosed(micHint)} />
          </div>
        )}
      </DockLeave>

      <DockLeave show={micBlocker !== null}>
        {micBlocker && (
          <div key="mic-access" className="aid-dock-in pointer-events-auto">
            <MicAccessCard
              blocker={micBlocker}
              onRecheck={c.recheckMicrophone}
              onSystemOnly={() => void c.startAnywhere({ systemOnly: true })}
              onClose={c.dismissBlocker}
            />
          </div>
        )}
      </DockLeave>

      <DockLeave show={showSpeechHint}>
        <div key="hint" className="aid-dock-in aid-glass pointer-events-auto relative w-full max-w-[560px] rounded-tile p-4">
          <SpeechHint heard={live.vadSegments > 0} />
        </div>
      </DockLeave>

      <div key={state} className="aid-dock-in pointer-events-auto flex max-w-full justify-center">
        {state === 'idle' && (
          // useSearchParams в статической выгрузке требует границу Suspense
          <Suspense fallback={null}>
            <IdleRecordButton />
          </Suspense>
        )}

        {state === 'recording' && (
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="aid-glass relative flex items-center gap-2 rounded-full p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openRecording}
                  aria-label={`${t('openRecording')}, ${formatTimer(c.duration)}`}
                  className="flex h-14 shrink-0 items-center gap-2 rounded-full pl-3 pr-4 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ActivityDot pulse={live.vadSegments + live.textSegments} paused={c.isPaused} />
                  <span className="tabular text-2xl font-bold tracking-tight">{formatTimer(c.duration)}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{c.isPaused ? t('paused') : t('openRecording')}</TooltipContent>
            </Tooltip>

            <SpeechLevel live={live} duration={c.duration} paused={c.isPaused} />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="aid-icon-btn-glass size-14 [&_svg]:size-6"
                  onClick={() => void c.togglePause()}
                  disabled={c.busy !== null}
                  aria-label={c.isPaused ? t('resumeRecording') : t('pauseRecording')}
                >
                  {c.isPaused ? <Play /> : <Pause />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{c.isPaused ? t('resumeRecording') : t('pauseRecording')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="main" onClick={() => void c.stop()} disabled={c.busy !== null}>
                  {c.busy === 'stop' ? <Spinner tone="inherit" /> : <Stop />}
                  {t('stopRecording')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('stopRecording')} · {c.hotkey} {c.hotkeyScope}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {state === 'finishing' && card && (
          <FinishCard
            stage={card.stage}
            title={card.title}
            reason={card.reason}
            still={preview !== null}
            onOpen={card.meetingId && !preview ? () => openSaved(card.meetingId!) : preview && card.meetingId ? () => undefined : undefined}
            onClose={preview ? () => undefined : closeCard}
            onHold={card.stage === 'discarded' ? notice?.hold : undefined}
          />
        )}
      </div>

      {/* Уходящий итог: тот же вид, плавно гаснет и опускается, пока на его месте проявляется кнопка записи */}
      {leaving && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4" aria-hidden>
          <div className="aid-dock-out">
            <FinishCard stage={leaving.stage} title={leaving.title} reason={leaving.reason} still onClose={() => undefined} onOpen={leaving.meetingId ? () => undefined : undefined} />
          </div>
        </div>
      )}
    </section>
  );
}
