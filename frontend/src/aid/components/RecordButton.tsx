// Круглая кнопка записи в стекле (.aid-glass-record в globals.css): плитка
// «Новая запись» на главной (96 px) и плавающая кнопка на других страницах (72 px).
// Кольцо «дышит» снаружи кнопки (у кнопки overflow hidden ради блика).
'use client';

import { Microphone } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

export function RecordButton({ size = 72, tooltip = true }: { size?: 72 | 96; tooltip?: boolean }) {
  const c = useRecordingControls();
  const button = (
    <span className={cn('relative inline-flex shrink-0', size === 96 ? 'size-24' : 'size-[72px]')}>
      {!c.isStarting && <span className="aid-dock-breathe pointer-events-none absolute inset-0 rounded-full border-2 border-primary" aria-hidden />}
      <button
        type="button"
        onClick={() => void c.startAnywhere()}
        disabled={c.isStarting}
        aria-label={t('startRecording')}
        aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
        className="aid-glass-record relative flex size-full items-center justify-center rounded-full text-white transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
      >
        {/* 28 px: единственная иконка крупнее 20 px (CLAUDE.md) */}
        {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="relative z-[1] size-7" />}
      </button>
    </span>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">
        {t('startRecording')} · {c.hotkey} {c.hotkeyScope}
      </TooltipContent>
    </Tooltip>
  );
}
