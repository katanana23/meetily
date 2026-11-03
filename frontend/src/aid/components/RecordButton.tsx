// Кнопка записи 72 px: всегда внизу (RecordDock). Сплошной красный цвета записи
// (--record) без градиента, белый микрофон 28 px. Живость без стекла и свечения:
// в покое от кнопки расходятся две мягкие волны, как от звука; при наведении и
// фокусе с клавиатуры круг раскрывается в капсулу «Записать ⌘⇧R», поэтому
// отдельная подсказка не нужна. prefers-reduced-motion выключает волны и
// раскрытие становится мгновенным (globals.css, .aid-record-*).
'use client';

import { Microphone } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { t } from '@/aid/strings';

export function RecordButton() {
  const c = useRecordingControls();
  return (
    <span className="group relative inline-flex h-[72px] shrink-0 items-center">
      {!c.isStarting && (
        <>
          <span className="aid-record-wave pointer-events-none absolute left-0 top-0 size-[72px] rounded-full" aria-hidden />
          <span className="aid-record-wave aid-record-wave-late pointer-events-none absolute left-0 top-0 size-[72px] rounded-full" aria-hidden />
        </>
      )}
      <button
        type="button"
        onClick={() => void c.startAnywhere()}
        disabled={c.isStarting}
        aria-label={`${t('startRecording')}, ${c.hotkey} ${c.hotkeyScope}`}
        aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
        className="aid-record-button relative flex h-[72px] items-center rounded-full px-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-80"
      >
        {/* 28 px: единственная иконка крупнее 20 px (CLAUDE.md) */}
        <span className="flex size-7 shrink-0 items-center justify-center">
          {c.isStarting ? <Spinner tone="inherit" /> : <Microphone className="size-7" aria-hidden />}
        </span>
        <span className="aid-record-label flex items-center gap-2 overflow-hidden whitespace-nowrap text-[15px] font-semibold" aria-hidden>
          {t('recordShort')}
          <kbd className="rounded-full bg-white/20 px-2 py-0.5 font-sans text-xs font-medium">{c.hotkey}</kbd>
        </span>
      </button>
    </span>
  );
}
