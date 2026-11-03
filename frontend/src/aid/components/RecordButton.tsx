// Кнопка записи 72 px: всегда внизу (RecordDock). Круглая, сплошной кобальт
// (акцент приложения, --primary) без градиента, белый микрофон 28 px. Живость без
// стекла и свечения: в покое от кнопки расходятся две мягкие волны, как от звука.
// Сочетание клавиш во всплывающей подсказке. prefers-reduced-motion выключает
// волны (globals.css, .aid-record-*).
'use client';

import { Microphone } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { t } from '@/aid/strings';

export function RecordButton() {
  const c = useRecordingControls();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="group relative inline-flex size-[72px] shrink-0">
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
            {/* 28 px: единственная иконка крупнее 20 px (CLAUDE.md) */}
            {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="size-7" aria-hidden />}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {t('startRecording')} · {c.hotkey} {c.hotkeyScope}
      </TooltipContent>
    </Tooltip>
  );
}
