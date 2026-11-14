// Уведомление Aid одно на всех: итог записи у капсулы (NoticeCard в RecordDock),
// карточки про микрофон (MicNotices) и тосты (AidToaster, lib/toasts.tsx).
// Плотное стекло, радиус плитки, внутри 20 px. Слева знак в круге 44 px на вложенной
// поверхности (иконка 20 px), через 12 px текст; круг по центру блока текста. Круглый
// крестик в правом верхнем углу, 4 px сверху и справа (ui/close-button.tsx), справа у
// содержимого запас под него. Действие либо в строке справа от текста (широкая карточка
// у капсулы), либо под текстом по его левому краю (тост).
// Все уведомления стоят одной стопкой внизу по центру (RecordDock и AidToaster), не друг на друге.
'use client';

import * as React from 'react';
import { CLOSE_RESERVE, CloseButton } from '@/aid/components/ui/close-button';
import { cn } from '@/aid/lib/utils';

export type NoticeTone = 'neutral' | 'giants' | 'success' | 'error';

const MARK_TONE: Record<NoticeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  // «Не распознано» и предупреждения: мягкий тон Giants, знак тёмным Giants
  giants: 'bg-[hsl(var(--giants)/0.16)] text-giants-ink',
  success: 'bg-muted text-primary-ink',
  error: 'bg-muted text-destructive-ink',
};

/** Знак уведомления: круг 44 px на вложенной поверхности, иконка 20 px. */
export function NoticeMark({ tone = 'neutral', children, className }: { tone?: NoticeTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn('flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5', MARK_TONE[tone], className)}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Подложка уведомления: плотное стекло, радиус плитки, 20 px внутри. */
export const NoticeSurface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('aid-glass aid-glass-dense relative rounded-tile p-5', className)} {...props} />
));
NoticeSurface.displayName = 'NoticeSurface';

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Иконка знака; без неё знака нет (тихие итоги вроде «Запись отменена»). */
  icon?: React.ReactNode;
  tone?: NoticeTone;
  title: React.ReactNode;
  hint?: React.ReactNode;
  /** Действия: кнопки. */
  actions?: React.ReactNode;
  /** inline: в строке перед крестиком; below: под текстом по его левому краю. */
  actionsPlacement?: 'inline' | 'below';
  /** Подсказка длиннее строки: до трёх строк вместо обрезки. */
  wrapHint?: boolean;
  onClose?: () => void;
  closeLabel?: string;
}

export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  ({ icon, tone = 'neutral', title, hint, actions, actionsPlacement = 'inline', wrapHint, onClose, closeLabel, className, ...props }, ref) => {
    const below = actions && actionsPlacement === 'below';
    return (
      <NoticeSurface ref={ref} className={cn(onClose && CLOSE_RESERVE, className)} {...props}>
        <div className="flex min-w-0 items-center gap-3">
          {icon && <NoticeMark tone={tone}>{icon}</NoticeMark>}
          <div className={cn('min-w-0 flex-1', !icon && 'pl-1')}>
            <p className="truncate text-[15px] font-semibold leading-5">{title}</p>
            {hint && (
              <p className={cn('mt-1 text-sm leading-5 text-muted-foreground', wrapHint ? 'line-clamp-3 whitespace-normal [text-wrap:balance]' : 'truncate')}>{hint}</p>
            )}
          </div>
          {actions && !below && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        {below && <div className={cn('mt-3 flex flex-wrap items-center gap-2', icon && 'pl-14')}>{actions}</div>}
        {onClose && <CloseButton label={closeLabel ?? ''} onClick={onClose} />}
      </NoticeSurface>
    );
  },
);
Notice.displayName = 'Notice';
