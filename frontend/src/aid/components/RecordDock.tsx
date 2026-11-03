// Полоса записи: вторая плитка внизу окна во всю ширину контента, 88 px, как плеер.
// Запись доступна отовсюду: полоса стоит на главной, на странице встречи и в настройках.
// Состояния:
// - покой: красная круглая кнопка 56 px (единственный акцент) и текст «Записать · ⌘⇧R»;
// - запись: капсула записи: красная точка с кольцом на сигнал речи, таймер, пауза, «Остановить»;
// - завершение: «Завершаем запись» со спиннером;
// - запись не сохранена: карточка «Тишина. Сохранять нечего» с «Проверить звук» и крестиком;
//   уходит сама (NOTICE_MS в recording-outcome.tsx).
// Переходы между состояниями анимируются только transform и opacity;
// prefers-reduced-motion их выключает (globals.css, .aid-dock-*).
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука), поэтому кольцо вокруг точки записи вспыхивает на каждый
// речевой сегмент детектора и каждую реплику: видно, что приложение слышит речь.
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Microphone, Pause, Play, SpeakerHigh, Stop, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { SoundCheckDialog } from '@/aid/components/SoundCheck';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { useRecordingOutcome, type DiscardNotice } from '@/aid/lib/recording-outcome';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

/** Точка записи с кольцом: вспышка на каждый сигнал речи (ключ меняется, анимация начинается заново). */
function ActivityRing({ pulse, paused }: { pulse: number; paused: boolean }) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center" aria-hidden>
      {!paused && pulse > 0 && <span key={pulse} className="aid-dock-speech absolute inset-0 rounded-full border-2 border-record" />}
      <span className={cn('size-3.5 rounded-full', paused ? 'bg-muted-foreground/60' : 'aid-dock-dot aid-record-dot')} />
    </span>
  );
}

const COPY = {
  'no-speech': { title: 'noSpeechNoticeTitle', hint: 'noSpeechNoticeHint' },
  'too-little': { title: 'tooLittleNoticeTitle', hint: 'tooLittleNoticeHint' },
  unrecognized: { title: 'unrecognizedNoticeTitle', hint: 'unrecognizedNoticeHint' },
} as const;

/** Карточка исхода в полосе: одна строка 88 px, текст слева, действия справа. */
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
      className="flex h-full w-full items-center gap-4 px-4"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{t(COPY[notice.verdict].title)}</p>
        <p className="truncate text-sm text-muted-foreground">{t(COPY[notice.verdict].hint)}</p>
      </div>
      {notice.verdict !== 'too-little' && (
        <Button variant="outline" onClick={() => setSoundCheck(true)}>
          <SpeakerHigh />
          {t('soundCheck')}
        </Button>
      )}
      {/* Крестик: X в начертании bold (залитый нарисован квадратом, CLAUDE.md) */}
      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground [&_svg]:size-4" onClick={notice.dismiss} aria-label={t('close')}>
        <X weight="bold" />
      </Button>
      <SoundCheckDialog open={soundCheck} onOpenChange={setSoundCheck} />
    </div>
  );
}

/** Покой: красная кнопка и подпись «Записать · ⌘⇧R». Вся капсула нажимается. */
function IdleRow() {
  const c = useRecordingControls();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void c.startAnywhere()}
          disabled={c.isStarting}
          aria-label={t('startRecording')}
          aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
          className="group flex h-16 items-center gap-4 rounded-full py-1 pl-1 pr-6 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
        >
          <span className="aid-record-button flex size-14 shrink-0 items-center justify-center rounded-full">
            {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="size-6" aria-hidden />}
          </span>
          <span className="text-base font-semibold">{t('record')}</span>
          <span className="text-sm text-muted-foreground" aria-hidden>
            · {c.hotkey}
          </span>
        </button>
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
  const openRecording = () => {
    c.setView('recording');
    if (pathname !== '/') router.push('/');
  };

  return (
    <div className="flex h-[var(--dock-height)] shrink-0 items-center justify-center rounded-tile bg-card px-4">
      <div key={state} className="aid-dock-in flex h-full w-full items-center justify-center">
        {state === 'idle' && <IdleRow />}

        {state === 'recording' && (
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openRecording}
                  aria-label={`${t('openRecording')}, ${formatTimer(c.duration)}`}
                  className="flex h-14 items-center gap-3 rounded-full pl-2 pr-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ActivityRing pulse={live.vadSegments + live.textSegments} paused={c.isPaused} />
                  <span className="tabular text-xl font-semibold">{formatTimer(c.duration)}</span>
                  <span className="hidden text-sm text-muted-foreground sm:inline">{c.isPaused ? t('paused') : t('recording')}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('openRecording')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-14"
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
                <Button size="main" onClick={() => void c.stop()} disabled={c.busy !== null}>
                  {c.busy === 'stop' ? <Spinner tone="inherit" /> : <Stop className="text-record" />}
                  {t('stopRecording')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('stopRecording')} · {c.hotkey} {c.hotkeyScope}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {state === 'finishing' && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 text-[15px] font-medium">
            <Spinner />
            {c.phase === 'opening' ? t('savedShort') : t('finishingShort')}
          </div>
        )}

        {state === 'notice' && notice && <NoticeRow notice={notice} />}
      </div>
    </div>
  );
}
