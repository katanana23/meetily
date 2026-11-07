// Запись: плавает внизу по центру поверх контента на всех страницах.
// Состояния:
// - покой: круглая кнопка Mikado 88 px, на 28 px от низа с микрофоном, от неё расходятся две мягкие
//   волны; сочетание клавиш в подсказке;
// - запись: стеклянная капсула (.aid-glass): красная точка с кольцом на речь,
//   таймер, полосы речи, «Пауза» и красная «Остановить»; «Не слышу речи»
//   стеклянной карточкой над капсулой;
// - завершение: капсула со спиннером: «Слушаю последние секунды», «Сохраняю встречу»;
// - запись не сохранена или не распознана: карточка с крестиком;
//   «Речь не распознана» плиткой Giants (роль «Не распознано»), остальное стеклом.
// Смена состояния появляется из размытия (.aid-dock-in), только transform,
// opacity и filter; prefers-reduced-motion их выключает.
// Страницы оставляют снизу запас --dock-space, капсула не закрывает последние строки.
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука). Поэтому «уровень» здесь честный уровень речи: полосы за
// последние 9 секунд растут на каждый сигнал детектора речи и каждую реплику,
// кольцо вокруг точки вспыхивает на каждый сигнал.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChatText, Microphone, MicrophoneSlash, Pause, Play, SpeakerHigh, Stop, Warning, Waveform, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { SoundCheckDialog, silenceCause, useSoundState } from '@/aid/components/SoundCheck';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { isMicBlocker } from '@/aid/lib/recording';
import { MicAccessCard, MicHint, micHintKind, type MicHintKind } from '@/aid/components/MicNotices';
import { useRecordingOutcome, type DiscardNotice, type LiveSpeech } from '@/aid/lib/recording-outcome';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useConfig } from '@/contexts/ConfigContext';
import { LANGUAGES } from '@/constants/languages';

/** Через сколько секунд без единой осмысленной реплики показать «Не слышу речи». */
export const NO_SPEECH_HINT_SEC = 20;

const LEVEL_BARS = 9;

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

const COPY = {
  'no-speech': { title: 'noSpeechNoticeTitle', hint: 'noSpeechNoticeHint' },
  'too-little': { title: 'tooLittleNoticeTitle', hint: 'tooLittleNoticeHint' },
  unrecognized: { title: 'unrecognizedNoticeTitle', hint: 'unrecognizedNoticeHint' },
} as const;

/** Карточка итога: плотное стекло, скругление плитки, воздух внутри. */
function NoticeCard({ notice }: { notice: DiscardNotice }) {
  return (
    <div className="aid-glass aid-glass-dense relative w-[min(560px,calc(100vw-8rem))] rounded-tile py-4 pl-4 pr-3">
      <NoticeRow notice={notice} />
    </div>
  );
}

function NoticeRow({ notice }: { notice: DiscardNotice }) {
  const [soundCheck, setSoundCheck] = useState(false);
  const { hold } = notice;
  // Esc закрывает (если не открыт диалог проверки звука)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !soundCheck && notice.dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notice, soundCheck]);
  // Пока открыта «Проверить звук», карточка не уходит: иначе диалог закрылся бы вместе с ней
  useEffect(() => hold('dialog', soundCheck), [hold, soundCheck]);
  useEffect(
    () => () => {
      hold('hover', false);
      hold('focus', false);
      hold('dialog', false);
    },
    [hold],
  );
  return (
    <div
      role="status"
      aria-live="polite"
      data-aid-outcome={notice.verdict}
      // pointerenter не приходит, если карточка появилась под неподвижным курсором (там была «Остановить»)
      onPointerMove={() => hold('hover', true)}
      onPointerLeave={() => hold('hover', false)}
      onFocus={() => hold('focus', true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && hold('focus', false)}
      className="flex w-full min-w-0 items-center gap-4"
    >
      {/* Спокойно и с воздухом: знак в круге 44 px слева (что случилось), две короткие строки,
          справа тихое действие текстом и крестик. Цвет роли только у знака «Не распознано» */}
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5',
          notice.verdict === 'unrecognized' ? 'bg-[hsl(var(--giants)/0.16)] text-giants-ink' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {notice.verdict === 'unrecognized' ? <Warning /> : notice.verdict === 'no-speech' ? <MicrophoneSlash /> : <ChatText />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-5">{t(COPY[notice.verdict].title)}</p>
        <p className="mt-1 truncate text-sm leading-5 text-muted-foreground">{t(COPY[notice.verdict].hint)}</p>
      </div>
      {notice.verdict !== 'too-little' && (
        <Button variant="ghost" className="h-10 shrink-0 px-3 text-sm font-medium hover:bg-muted" onClick={() => setSoundCheck(true)}>
          {t('soundCheck')}
        </Button>
      )}
      {/* Крестик: X в начертании bold (залитый нарисован квадратом, CLAUDE.md) */}
      <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4" onClick={notice.dismiss} aria-label={t('close')}>
        <X weight="bold" />
      </Button>
      <SoundCheckDialog open={soundCheck} onOpenChange={setSoundCheck} />
    </div>
  );
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

export function RecordDock() {
  const c = useRecordingControls();
  const { live, notice } = useRecordingOutcome();
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const state = c.isRecording ? 'recording' : c.phase ? 'finishing' : notice ? 'notice' : 'idle';
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
  // Экран завершения уже на месте (главная, вид записи): капсула его не повторяет
  const onFinishingScreen =
    state === 'finishing' && pathname === '/' && c.view === 'recording' && typeof window !== 'undefined' && !new URLSearchParams(window.location.search).has('id');

  // Итог уходит плавно: последний показанный держим ещё 280 мс с анимацией ухода
  const [leaving, setLeaving] = useState<DiscardNotice | null>(null);
  const lastNotice = useRef<DiscardNotice | null>(null);
  useEffect(() => {
    if (state === 'notice' && notice) {
      lastNotice.current = notice;
      setLeaving(null);
      return;
    }
    const gone = lastNotice.current;
    if (!gone) return;
    lastNotice.current = null;
    setLeaving(gone);
    const id = window.setTimeout(() => setLeaving(null), 280);
    return () => window.clearTimeout(id);
  }, [state, notice]);

  return (
    <section
      aria-label={t('recordingTile')}
      className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex flex-col items-center gap-2 px-4"
    >
      {showMicHint && micHint && (
        <div key={`mic-${micHint}`} className="aid-dock-in aid-glass pointer-events-auto relative w-full max-w-[560px] rounded-tile p-4">
          <MicHint kind={micHint} onClose={() => setMicHintClosed(micHint)} />
        </div>
      )}

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

      {showSpeechHint && (
        <div key="hint" className="aid-dock-in aid-glass pointer-events-auto relative w-full max-w-[560px] rounded-tile p-4">
          <SpeechHint heard={live.vadSegments > 0} />
        </div>
      )}

      <div key={state} className="aid-dock-in pointer-events-auto flex max-w-full justify-center">
        {state === 'idle' && <RecordButton />}

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
                  className="aid-btn-icon size-14 bg-foreground/[0.06] hover:bg-foreground/[0.12] [&_svg]:size-6"
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
                <Button size="main" className="bg-record px-6 text-white hover:bg-record/90" onClick={() => void c.stop()} disabled={c.busy !== null}>
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

        {state === 'finishing' && !onFinishingScreen && (
          <div role="status" aria-live="polite" className="aid-glass relative flex h-[72px] items-center gap-3 rounded-full px-7 text-[15px] font-medium">
            <Spinner />
            {c.phase === 'opening'
              ? t('savedShort')
              : c.phase === 'saving'
                ? t('savingShort')
                : c.phase === 'discarding'
                  ? t('discardingShort')
                  : t('finishingShort')}
          </div>
        )}

        {state === 'notice' && notice && <NoticeCard notice={notice} />}
      </div>

      {/* Уходящий итог: тот же вид, плавно гаснет и опускается, пока на его месте проявляется кнопка записи */}
      {leaving && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4" aria-hidden>
          <div className="aid-dock-out">
            <NoticeCard notice={leaving} />
          </div>
        </div>
      )}
    </section>
  );
}
