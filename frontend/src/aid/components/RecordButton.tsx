// Круглая кнопка записи 72 px: всегда внизу по центру (RecordDock). Монохром:
// круг цвета текста темы (белый в тёмной, чёрный в светлой) и красная точка
// записи внутри (.aid-record в globals.css). Кольцо мягко «дышит» снаружи.
'use client';

import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { t } from '@/aid/strings';

export function RecordButton({ tooltip = true }: { tooltip?: boolean }) {
  const c = useRecordingControls();
  const button = (
    <span className="relative inline-flex size-[72px] shrink-0">
      {!c.isStarting && <span className="aid-dock-breathe pointer-events-none absolute inset-0 rounded-full border-2 border-foreground/40" aria-hidden />}
      <button
        type="button"
        onClick={() => void c.startAnywhere()}
        disabled={c.isStarting}
        aria-label={t('startRecording')}
        aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
        className="aid-record relative flex size-full items-center justify-center rounded-full transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
      >
        {c.isStarting ? <Spinner tone="inherit" /> : <span className="aid-record-dot size-6 rounded-full" aria-hidden />}
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
