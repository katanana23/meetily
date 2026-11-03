// Главная кнопка записи: всегда под рукой. На главной внизу по центру области
// контента, на остальных страницах в правом нижнем углу: там колонка текста
// прижата влево, и кнопка не закрывает реплики и таблицы итогов.
// Состояния:
// - покой: круглая кнопка 72 px, кольцо мягко «дышит» (на главной её нет: там
//   кнопка 96 px в плитке «Новая запись»);
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
import { Pause, Play, SpeakerHigh, Stop } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { RecordButton } from '@/aid/components/RecordButton';
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

/** Секунды до удаления; на паузе цифра стоит. Для диктора отсчёт не озвучивается каждую секунду. */
function Countdown({ deadline, remaining }: { deadline: number | null; remaining: number }) {
  const secondsLeft = () => Math.max(0, Math.ceil(((deadline ?? Date.now() + remaining) - Date.now()) / 1000));
  const [left, setLeft] = useState(secondsLeft);
  useEffect(() => {
    setLeft(secondsLeft());
    if (deadline === null) return;
    const id = setInterval(() => setLeft(secondsLeft()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, remaining]);
  return (
    <span aria-hidden className={cn('tabular min-w-[1.5ch] text-right', deadline === null ? 'opacity-60' : 'opacity-80')} title={deadline === null ? t('restoreCountdownPaused') : undefined}>
      {left}
    </span>
  );
}

function NoticeCard({ notice }: { notice: DiscardNotice }) {
  const [soundCheck, setSoundCheck] = useState(false);
  const silent = notice.verdict === 'no-speech';
  const { hold } = notice;
  // Карточка уходит сама через 10 с; Esc закрывает раньше (кнопки-крестика нет:
  // залитый X из Phosphor нарисован квадратом)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !soundCheck && notice.dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notice, soundCheck]);
  // Пока открыта «Проверить звук», отсчёт стоит: иначе диалог закрылся бы вместе с карточкой
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
      data-aid-countdown={notice.deadline === null ? 'paused' : 'running'}
      onPointerEnter={() => hold('hover', true)}
      onPointerLeave={() => hold('hover', false)}
      onFocus={() => hold('focus', true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && hold('focus', false)}
      className="relative w-[min(440px,calc(100vw-2rem))] rounded-tile bg-card p-4 shadow-lg ring-1 ring-border/60"
    >
      <p className="text-[15px] font-semibold">{silent ? t('noSpeechNoticeTitle') : t('tooLittleNoticeTitle')}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{silent ? t('noSpeechNoticeHint') : t('tooLittleNoticeHint')}</p>
      <p className="sr-only">{t('restoreCountdownSr')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="main" onClick={notice.restore}>
          {t('restoreRecording')}
          <Countdown deadline={notice.deadline} remaining={notice.remaining} />
        </Button>
        {silent && (
          <Button variant="outline" size="main" onClick={() => setSoundCheck(true)}>
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
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-6 z-30 flex px-4', pathname === '/' ? 'justify-center' : 'justify-end pr-6')}>
      <div key={state} className="aid-dock-in pointer-events-auto">
        {/* На главной в покое кнопка записи стоит в плитке «Новая запись», здесь не дублируется */}
        {state === 'idle' && pathname !== '/' && <RecordButton size={72} />}

        {state === 'recording' && (
          // Активное состояние записи: капсула в стекле кобальта (.aid-glass-record), белый текст
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="aid-glass-record flex items-center gap-2 rounded-full p-2">
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
                {t('stopRecording')} · {c.hotkey} {c.hotkeyScope}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* На экране записи «Завершаем запись» уже крупно в карточке: здесь не дублируется */}
        {state === 'finishing' && !(pathname === '/' && c.view === 'recording') && (
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
