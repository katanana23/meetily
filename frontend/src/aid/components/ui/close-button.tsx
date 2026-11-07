// Крестик «Закрыть» один на весь Aid: круглая кнопка 44 px на лёгкой подложке, значок X
// 14 px светло-серым (цвет подписи на 70 %, при наведении темнеет;
// bold с чуть более толстым контуром, .aid-close-glyph в globals.css;
// залитый X в Phosphor нарисован квадратом, CLAUDE.md). Правило отступов: кнопка стоит
// в углу карточки на том же отступе, что и всё содержимое (сверху, справа, снизу одинаково),
// карточки с ней — с ровным отступом со всех сторон (p-3, 12 px).
'use client';

import * as React from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/aid/lib/utils';

/** Значок крестика: 14 px, bold с утолщённым контуром. */
export function CloseGlyph({ className }: { className?: string }) {
  return <X weight="bold" aria-hidden className={cn('aid-close-glyph size-3.5', className)} />;
}

/** Классы круглой кнопки: для своих кнопок и для Radix Close. */
export const CLOSE_BUTTON =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[hsl(var(--muted-foreground)/0.7)] transition-colors hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

export const CloseButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ className, label, ...props }, ref) => (
    <button ref={ref} type="button" aria-label={label} className={cn(CLOSE_BUTTON, className)} {...props}>
      <CloseGlyph />
    </button>
  ),
);
CloseButton.displayName = 'CloseButton';
