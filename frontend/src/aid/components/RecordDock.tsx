// Главная кнопка записи: всегда под рукой. На главной внизу по центру области
// контента, на остальных страницах в правом нижнем углу: там колонка текста
// прижата влево, и кнопка не закрывает реплики и таблицы итогов.
// Состояния:
// - покой: круглая кнопка 72 px, монохром с красной точкой, кольцо мягко «дышит»;
// - запись: капсула того же цвета с точкой записи, таймером, паузой и «Остановить»;
// - завершение: «Завершаем запись» со спиннером;
// - запись не сохранена: короткая карточка «Тишина. Сохранять нечего» с «Проверить
//   звук» и крестиком; уходит сама (NOTICE_MS в recording-outcome.tsx).
// Переходы между состояниями и кольца анимируются только transform и opacity;
// prefers-reduced-motion их выключает (globals.css, .aid-dock-*).
//
// Уровня звука во время записи ядро не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука), поэтому кольцо вокруг точки записи вспыхивает на каждый
// речевой сегмент детектора и каждую реплику: видно, что приложение слышит речь.
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Pause, Play, SpeakerHigh, Stop, X } from '@phosphor-icons/react';
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
  // На монохромной капсуле: красная точка записи, на речь вспыхивает красное кольцо
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center" aria-hidden>
      {!paused && pulse > 0 && <span key={pulse} className="aid-dock-speech absolute inset-0 rounded-full border-2 border-[hsl(var(--record))]" />}
      <span className={cn('size-3.5 rounded-full', paused ? 'bg-background/40' : 'aid-dock-dot aid-record-dot')} />
    </span>
  );
}

function NoticeCard({ notice }: { notice: DiscardNotice }) {
  const [soundCheck, setSoundCheck] = useState(false);
  const silent = notice.verdict === 'no-speech';
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
      className="relative w-[min(400px,calc(100vw-2rem))] rounded-tile bg-card p-4 pr-14 shadow-lg ring-1 ring-border/60"
    >
      {/* Крестик: X в начертании bold (залитый нарисован квадратом, CLAUDE.md) */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-10 rounded-full text-muted-foreground hover:text-foreground [&_svg]:size-4"
        onClick={notice.dismiss}
        aria-label={t('close')}
      >
        <X weight="bold" />
      </Button>
      <p className="text-[15px] font-semibold">{silent ? t('noSpeechNoticeTitle') : t('tooLittleNoticeTitle')}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{silent ? t('noSpeechNoticeHint') : t('tooLittleNoticeHint')}</p>
      {silent && (
        <Button variant="outline" className="mt-3 h-10 rounded-full px-4" onClick={() => setSoundCheck(true)}>
          <SpeakerHigh />
          {t('soundCheck')}
        </Button>
      )}
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
        {state === 'idle' && <RecordButton />}

        {state === 'recording' && (
          // Активное состояние записи: монохромная капсула (.aid-record) с красной точкой
          <div role="group" aria-label={c.isPaused ? t('paused') : t('recording')} className="aid-record flex items-center gap-2 rounded-full p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openRecording}
                  aria-label={`${t('openRecording')}, ${formatTimer(c.duration)}`}
                  className="flex h-14 items-center gap-2 rounded-full pl-2 pr-3 hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
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
                  className="size-14 rounded-full bg-background/10 text-background hover:bg-background/20 hover:text-background"
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
                <Button variant="ghost" className="h-14 rounded-full bg-background px-6 text-foreground hover:bg-background/85 hover:text-foreground" onClick={() => void c.stop()} disabled={c.busy !== null}>
                  {c.busy === 'stop' ? <Spinner tone="inherit" /> : <Stop className="text-[hsl(var(--record))]" />}
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
