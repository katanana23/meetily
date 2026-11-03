// Список реплик для чтения: время в узкой приглушённой колонке, выровненной
// по правому краю; спикер (если есть) строкой над текстом и только когда
// говорящий меняется; между сменами спикера отступ больше, чем внутри.
// Ширина текста ограничена колонкой страницы (около 700 px).

import { memo } from 'react';
import type { Segment } from '@/aid/lib/meeting';
import { segmentTime } from '@/aid/lib/meeting';
import { cn } from '@/aid/lib/utils';

export const TranscriptList = memo(function TranscriptList({ segments, live = false }: { segments: Segment[]; live?: boolean }) {
  return (
    <ol className="text-[15px]" aria-live={live ? 'polite' : undefined}>
      {segments.map((s, i) => {
        const prev = segments[i - 1];
        const newSpeaker = Boolean(s.speaker) && s.speaker !== prev?.speaker;
        return (
          <li
            key={s.id}
            className={cn('grid grid-cols-[3.5rem_1fr] gap-x-4', i === 0 ? '' : newSpeaker ? 'pt-6' : 'pt-2.5')}
          >
            <time className="tabular select-none text-right text-[13px] leading-7 text-muted-foreground">{segmentTime(s)}</time>
            <div className="min-w-0">
              {newSpeaker && <p className="text-[13px] font-semibold leading-7 text-foreground">{s.speaker}</p>}
              <p className="leading-7 text-foreground/90">
                {s.speaker && !newSpeaker && <span className="sr-only">{s.speaker}: </span>}
                {s.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
});
