// Крестик «Закрыть» один на весь Shade: круглая кнопка 44 px на лёгкой подложке, значок X
// 14 px светло-серым (цвет подписи на 70 %). При наведении меняется только подложка, на тон
// ближе к тексту (.shade-icon-btn-glass, globals.css), значок прежний;
// bold с чуть более толстым контуром, .shade-close-glyph в globals.css;
// залитый X в Phosphor нарисован квадратом, docs/ui/foundations.md).
// Правило места: крестик всегда в правом верхнем углу карточки, 4 px сверху и справа
// (CLOSE_CORNER) — в уведомлениях, карточках про микрофон и диалогах. Карточка с крестиком
// оставляет справа запас (CLOSE_RESERVE), чтобы текст и кнопки не заходили под него.
'use client';

import * as React from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/shade/lib/utils';

/** Значок крестика: 14 px, bold с утолщённым контуром. */
export function CloseGlyph({ className }: { className?: string }) {
  return <X weight="bold" aria-hidden className={cn('shade-close-glyph size-3.5', className)} />;
}

/** Классы круглой кнопки: для своих кнопок и для Radix Close. */
export const CLOSE_BUTTON =
  'flex size-11 shrink-0 items-center justify-center shade-icon-btn-glass rounded-full text-[hsl(var(--muted-foreground)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

/** Место крестика: правый верхний угол, 4 px сверху и справа (у родителя position: relative). */
export const CLOSE_CORNER = 'absolute right-1 top-1 z-10';

/**
 * Запас справа у карточки с крестиком: 4 + 44 + 8 = 56 px от края, текст и действия
 * кончаются на 8 px левее кнопки.
 */
export const CLOSE_RESERVE = 'pr-14';

/** Круглый крестик в правом верхнем углу карточки (CLOSE_CORNER). */
export const CloseButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ className, label, ...props }, ref) => (
    <button ref={ref} type="button" aria-label={label} className={cn(CLOSE_BUTTON, CLOSE_CORNER, className)} {...props}>
      <CloseGlyph />
    </button>
  ),
);
CloseButton.displayName = 'CloseButton';
