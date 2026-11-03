// Заголовок секции 22 px жирный. Если секция ведёт куда-то (раскрывается или
// открывает папку), заголовок сам становится ссылкой: «Не распознано ›» с шевроном
// CaretRight bold (исключение из правила fill: залитый треугольник читается как
// «воспроизвести»). Счётчик и подпись серым рядом.
'use client';

import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { H2 } from '@/aid/lib/type';
import { cn } from '@/aid/lib/utils';

interface SectionHeadingProps {
  children: ReactNode;
  /** Счётчик или подпись серым после заголовка. */
  meta?: ReactNode;
  /** Заголовок-ссылка: нажатие раскрывает секцию или открывает папку. */
  onClick?: () => void;
  expanded?: boolean;
  /** Действие справа (например, «Сделать заново»). */
  action?: ReactNode;
  id?: string;
  className?: string;
}

export function SectionHeading({ children, meta, onClick, expanded, action, id, className }: SectionHeadingProps) {
  const text = (
    <>
      <span className={H2}>{children}</span>
      {meta !== undefined && meta !== null && <span className="text-[15px] font-medium text-muted-foreground">{meta}</span>}
    </>
  );
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-expanded={expanded}
          id={id}
          className="group -mx-2 flex h-11 min-w-0 items-center gap-2 rounded-row px-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
          <CaretRight
            weight="bold"
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', expanded && 'rotate-90')}
            aria-hidden
          />
        </button>
      ) : (
        <h2 id={id} className="flex min-w-0 items-center gap-2">
          {text}
        </h2>
      )}
      {action}
    </div>
  );
}
