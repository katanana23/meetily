// Плитка записи: полоса во всю ширину колонки страницы под плиткой контента,
// на всех страницах. Это единственная большая цветная плитка на экране, и только
// пока идёт запись.
// Состояния:
// - покой: нейтральная плитка; кнопка «Записать» Mikado с градиентом таблеткой 56 px и подсказка ⌘⇧R;
// - запись: вся плитка Risd (роль «идёт запись»): надзаголовок «Идёт запись»,
//   таймер 32/36, уровень речи, подсказка «Не слышу речи» внутри, пауза и стоп
//   таблетками (стоп красный: красный только у стопа и удаления);
// - завершение: «Завершаем запись» со спиннером;
// - запись не сохранена или не распознана: строка-карточка с крестиком; «Речь не
//   распознана» плиткой Giants (роль «Не распознано»), остальное нейтрально.
// Переходы между состояниями: только transform и opacity, prefers-reduced-motion
// их выключает (globals.css, .aid-dock-*).
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука). Поэтому «уровень» здесь честный уровень речи: полосы за
// последние 9 секунд растут на каждый сигнал детектора речи и каждую реплику,
// кольцо вокруг точки вспыхивает на каждый сигнал.
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Microphone, Pause, Play, SpeakerHigh, Stop, Waveform, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { SoundCheckDialog, silenceCause, useSoundState } from '@/aid/components/SoundCheck';
import { useRecordingControls } from '@/aid/lib/recording-controls';
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
    <span className="relative flex size-6 shrink-0 items-center justify-center" aria-hidden>
      {!paused && pulse > 0 && <span key={pulse} className="aid-dock-speech absolute inset-0 rounded-full border-2 border-record" />}
      <span className={cn('size-3 rounded-full', paused ? 'bg-on-role/40' : 'aid-dock-dot aid-record-dot')} />
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
    <span className="flex h-9 items-end gap-1" aria-hidden>
      {bars.map((v, i) => (
        <span
          key={i}
          className="aid-level-bar h-full w-1.5 rounded-full bg-on-role"
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
        <Button asChild size="sm" className="shrink-0 bg-on-role/10 text-on-role hover:bg-on-role/20">
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
      <Button size="sm" className="shrink-0 bg-on-role/10 text-on-role hover:bg-on-role/20" onClick={() => setOpen(true)}>
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{t(COPY[notice.verdict].title)}</p>
        <p className="truncate text-sm text-muted-foreground">{t(COPY[notice.verdict].hint)}</p>
      </div>
      {notice.verdict !== 'too-little' && (
        <Button
          variant="outline"
          className={cn(notice.verdict === 'unrecognized' && 'bg-on-role/10 text-on-role hover:bg-on-role/20')}
          onClick={() => setSoundCheck(true)}
        >
          <SpeakerHigh />
          {t('soundCheck')}
        </Button>
      )}
      {/* Крестик: X в начертании bold (залитый нарисован квадратом, CLAUDE.md) */}
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-4" onClick={notice.dismiss} aria-label={t('close')}>
        <X weight="bold" />
      </Button>
      <SoundCheckDialog open={soundCheck} onOpenChange={setSoundCheck} />
    </div>
  );
}

export function RecordDock() {
  const c = useRecordingControls();
  const { live, notice } = useRecordingOutcome();
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const state = c.isRecording ? 'recording' : c.phase ? 'finishing' : notice ? 'notice' : 'idle';
  const openRecording = () => {
    c.setView('recording');
    if (pathname !== '/') router.push('/');
  };
  // Правило экрана записи: ложные срабатывания детектора на шум без осмысленного
  // текста речью не считаются
  const showSpeechHint =
    state === 'recording' && live.tracking && live.textSegments === 0 && !live.recognitionFailed && c.duration >= NO_SPEECH_HINT_SEC;
  const role = state === 'recording' ? 'aid-role aid-role-risd' : state === 'notice' && notice?.verdict === 'unrecognized' ? 'aid-role aid-role-giants' : 'bg-card';

  return (
    <section
      aria-label={t('recordingTile')}
      className={cn('flex min-h-[var(--dock-height)] shrink-0 items-center rounded-tile px-5 py-3 transition-colors', role)}
    >
      <div key={state} className="aid-dock-in flex w-full min-w-0 items-center gap-4">
        {state === 'idle' && (
          <div className="flex w-full items-center justify-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="main"
                  className="min-w-[180px] text-base font-semibold"
                  onClick={() => void c.startAnywhere()}
                  disabled={c.isStarting}
                  aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
                >
                  {c.isStarting ? <Spinner tone="inherit" /> : <Microphone />}
                  {t('record')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('startRecording')} · {c.hotkey} {c.hotkeyScope}
              </TooltipContent>
            </Tooltip>
            <span className="text-sm text-muted-foreground">
              <kbd className="font-sans font-medium text-foreground">{c.hotkey}</kbd> {c.hotkeyScope}
            </span>
          </div>
        )}

        {state === 'recording' && (
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="flex w-full min-w-0 items-center gap-5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openRecording}
                  aria-label={`${t('openRecording')}, ${formatTimer(c.duration)}`}
                  className="-my-1 -ml-2 flex shrink-0 items-center gap-3 rounded-nested px-2 py-1 text-left transition-colors hover:bg-on-role/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ActivityDot pulse={live.vadSegments + live.textSegments} paused={c.isPaused} />
                  <span className="flex flex-col">
                    {/* Надзаголовок и крупное значение */}
                    <span className="text-xs font-semibold uppercase tracking-[0.06em]">{c.isPaused ? t('paused') : t('recording')}</span>
                    <span className="tabular text-[32px] font-bold leading-9 tracking-tight">{formatTimer(c.duration)}</span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('openRecording')}</TooltipContent>
            </Tooltip>

            <SpeechLevel live={live} duration={c.duration} paused={c.isPaused} />

            <div className="min-w-0 flex-1">{showSpeechHint && <SpeechHint heard={live.vadSegments > 0} />}</div>

            <div className="flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="main"
                    className="bg-on-role/10 px-5 text-on-role hover:bg-on-role/20"
                    onClick={() => void c.togglePause()}
                    disabled={c.busy !== null}
                  >
                    {c.isPaused ? <Play /> : <Pause />}
                    {c.isPaused ? t('resumeRecording') : t('pauseRecording')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{c.isPaused ? t('resumeRecording') : t('pauseRecording')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="main" className="bg-white px-6 text-record hover:bg-white/90" onClick={() => void c.stop()} disabled={c.busy !== null}>
                    {c.busy === 'stop' ? <Spinner tone="inherit" /> : <Stop />}
                    {t('stopRecording')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t('stopRecording')} · {c.hotkey} {c.hotkeyScope}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {state === 'finishing' && (
          <div role="status" aria-live="polite" className="flex w-full items-center justify-center gap-3 text-[15px] font-medium">
            <Spinner />
            {c.phase === 'opening' ? t('savedShort') : t('finishingShort')}
          </div>
        )}

        {state === 'notice' && notice && <NoticeRow notice={notice} />}
      </div>
    </section>
  );
}
