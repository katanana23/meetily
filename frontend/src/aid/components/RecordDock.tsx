// Главная кнопка записи: всегда под рукой, внизу по центру области контента.
// Состояния:
// - покой: круглая кнопка 64 px, кольцо мягко «дышит»;
// - запись: капсула с кольцом активности, таймером, паузой и «Остановить»;
// - завершение: «Завершаем запись» со спиннером;
// - запись не сохранена: короткая карточка «Тишина. Сохранять нечего» на 10 с
//   с «Вернуть запись» и «Проверить звук» (вместо тоста).
// Переходы между состояниями и кольца анимируются только transform и opacity;
// prefers-reduced-motion их выключает (globals.css, .aid-dock-*).
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука), поэтому кольцо вокруг точки записи вспыхивает на каждый
// речевой сегмент детектора и каждую реплику: видно, что приложение слышит речь.
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Microphone, Pause, Play, SpeakerHigh, Stop } from '@phosphor-icons/react';
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
  // На кобальтовой капсуле: белое кольцо вспыхивает на речь, красная точка записи в белом круге
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center" aria-hidden>
      {!paused && pulse > 0 && <span key={pulse} className="aid-dock-speech absolute inset-0 rounded-full border-2 border-white/80" />}
      <span className="flex size-5 items-center justify-center rounded-full bg-white">
        <span className={cn('size-2.5 rounded-full', paused ? 'bg-neutral-400' : 'aid-dock-dot bg-[#E5372B]')} />
      </span>
    </span>
  );
}

function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((until - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [until]);
  return <span className="tabular min-w-[1.5ch] text-right opacity-80">{left}</span>;
}

function NoticeCard({ notice }: { notice: DiscardNotice }) {
  const [soundCheck, setSoundCheck] = useState(false);
  const silent = notice.verdict === 'no-speech';
  // Карточка уходит сама через 10 с; Esc закрывает раньше (кнопки-крестика нет:
  // залитый X из Phosphor нарисован квадратом)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !soundCheck && notice.dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notice, soundCheck]);
  return (
    <div
      role="status"
      aria-live="polite"
      data-aid-outcome={notice.verdict}
      className="relative w-[min(440px,calc(100vw-2rem))] rounded-[20px] bg-card p-4 shadow-lg ring-1 ring-border/60"
    >
      <p className="text-[15px] font-semibold">{silent ? t('noSpeechNoticeTitle') : t('tooLittleNoticeTitle')}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{silent ? t('noSpeechNoticeHint') : t('tooLittleNoticeHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="h-14 rounded-full px-6" onClick={notice.restore}>
          {t('restoreRecording')}
          <Countdown until={notice.until} />
        </Button>
        {silent && (
          <Button variant="outline" className="h-14 rounded-full px-6" onClick={() => setSoundCheck(true)}>
            <SpeakerHigh />
            {t('soundCheck')}
          </Button>
        )}
      </div>
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

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div key={state} className="aid-dock-in pointer-events-auto">
        {state === 'idle' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void c.startAnywhere()}
                disabled={c.isStarting}
                aria-label={t('startRecording')}
                aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
                className="aid-accent-fill relative flex size-[72px] items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform hover:scale-[1.04] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
              >
                {!c.isStarting && <span className="aid-dock-breathe absolute inset-0 rounded-full border-2 border-primary" aria-hidden />}
                {/* 28 px: единственная иконка крупнее 20 px (CLAUDE.md) */}
                {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="size-7" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('startRecording')} · {c.hotkey}
            </TooltipContent>
          </Tooltip>
        )}

        {state === 'recording' && (
          // Активное состояние записи: капсула на акцентном градиенте, белый текст
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="aid-accent-fill flex items-center gap-2 rounded-full p-2 text-primary-foreground shadow-lg">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openRecording}
                  aria-label={`${t('openRecording')}, ${formatTimer(c.duration)}`}
                  className="flex h-14 items-center gap-2 rounded-full pl-2 pr-3 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ActivityRing pulse={live.vadSegments + live.textSegments} paused={c.isPaused} />
                  <span className="tabular text-lg font-semibold">{formatTimer(c.duration)}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('openRecording')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-14 rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white"
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
                <Button variant="ghost" className="h-14 rounded-full bg-white px-6 text-[#C42519] hover:bg-white/90 hover:text-[#C42519]" onClick={() => void c.stop()} disabled={c.busy !== null}>
                  {c.busy === 'stop' ? <Spinner tone="inherit" /> : <Stop />}
                  {t('stopRecording')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('stopRecording')} · {c.hotkey}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {state === 'finishing' && (
          <div role="status" aria-live="polite" className="flex h-[72px] items-center gap-3 rounded-full bg-card px-7 text-[15px] font-medium shadow-lg ring-1 ring-border/60">
            <Spinner />
            {c.phase === 'opening' ? t('savedShort') : t('finishingShort')}
          </div>
        )}

        {state === 'notice' && notice && <NoticeCard notice={notice} />}
      </div>
    </div>
  );
}
