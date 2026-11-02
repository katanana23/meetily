// Список реплик: время от начала записи, спикер, текст.
// Имя спикера повторяется только когда говорящий меняется.

import { memo } from 'react';
import type { Segment } from '@/aid/lib/meeting';
import { segmentTime } from '@/aid/lib/meeting';
import { cn } from '@/aid/lib/utils';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export const TranscriptList = memo(function TranscriptList({ segments, live = false }: { segments: Segment[]; live?: boolean }) {
  return (
    <ol className="space-y-0.5" aria-live={live ? 'polite' : undefined}>
      {segments.map((s, i) => {
        const prev = segments[i - 1];
        const showSpeaker = Boolean(s.speaker) && s.speaker !== prev?.speaker;
        return (
          <li
            key={s.id}
            className={cn('grid grid-cols-[56px_36px_1fr] gap-x-3 rounded-2xl px-4 py-2.5 hover:bg-muted/50', showSpeaker && i > 0 && 'mt-3')}
          >
            <time className="tabular pt-0.5 text-right text-xs leading-6 text-muted-foreground">{segmentTime(s)}</time>
            <div aria-hidden>
              {showSpeaker && (
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {initials(s.speaker!)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              {showSpeaker && <p className="text-sm font-semibold leading-6">{s.speaker}</p>}
              <p className="text-[15px] leading-7 text-foreground/90">
                {s.speaker && !showSpeaker && <span className="sr-only">{s.speaker}: </span>}
                {s.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
});
