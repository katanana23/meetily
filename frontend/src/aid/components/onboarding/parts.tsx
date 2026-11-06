// Общие детали первого запуска: лаймовая плитка-кнопка, полоски речи, полоса прогресса,
// плитка-задача, которая «загорается» по готовности, и тихая ссылка.
'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Check, type Icon } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

/** Появление по очереди: подъём из размытия с задержкой (.aid-ob-rise, --d). */
export const riseDelay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Большая лаймовая плитка-кнопка: главное действие экрана (80 px, радиус плитки). */
export function TileButton({
  children,
  onClick,
  disabled,
  busy,
  className,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      style={style}
      className={cn(
        'group flex h-20 w-full items-center justify-between rounded-tile bg-primary px-6 text-left text-on-role transition-[opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:opacity-40',
        busy && 'disabled:opacity-100',
        className,
      )}
    >
      <span className="text-[22px] font-bold leading-7">{busy ? t('obOpening') : children}</span>
      {busy ? (
        <Spinner tone="inherit" />
      ) : (
        <ArrowRight className="size-6 transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0" aria-hidden />
      )}
    </button>
  );
}

export function QuietLink({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mx-auto block h-12 rounded-full px-5 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Полоски речи: бегущая волна (scaleY). Украшение витрины, а не уровень звука: его ядро не отдаёт. */
export function SpeechBars({ count = 9, className }: { count?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-8 items-center gap-1', className)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="aid-ob-bar-wave h-full w-1.5 rounded-full bg-current" style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/** Полоса прогресса: scaleX, без анимации ширины. */
export function ProgressBar({ percent, failed, label }: { percent: number; failed?: boolean; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/10"
    >
      <div
        className={cn('aid-ob-bar h-full w-full rounded-full', failed ? 'bg-giants' : 'bg-[hsl(var(--primary-edge))]')}
        style={{ transform: `scaleX(${value / 100})` }}
      />
    </div>
  );
}

/**
 * Плитка-задача. Готово: под содержимым проявляется лаймовый тон (opacity), иконка сжимается
 * и гаснет, на её месте появляется галочка. Тон лёгкий, а не заливка: три залитые плитки
 * нарушили бы правило двух цветных плиток.
 */
export function TaskTile({
  icon: IconComponent,
  iconClassName,
  title,
  caption,
  tone,
  done,
  action,
  delay,
  children,
}: {
  icon: Icon;
  iconClassName?: string;
  title: string;
  caption: string;
  tone: 'muted' | 'warn';
  done: boolean;
  action: ReactNode;
  delay: number;
  children?: ReactNode;
}) {
  return (
    <section className="aid-ob-rise relative overflow-hidden rounded-tile bg-card p-5" style={riseDelay(delay)}>
      <span aria-hidden className={cn('aid-ob-lit absolute inset-0 bg-primary', done ? 'opacity-25 dark:opacity-[0.16]' : 'opacity-0')} />
      <div className="relative flex min-h-12 items-center gap-4">
        <span className="relative size-6 shrink-0">
          <IconComponent
            className={cn('aid-ob-swap absolute inset-0 size-6', done ? 'scale-50 opacity-0' : iconClassName ?? 'text-foreground')}
            aria-hidden
          />
          {done && <Check weight="bold" className="aid-ob-pop absolute inset-0 size-6 text-primary-ink" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-6">{title}</p>
          <p
            role="status"
            className={cn('text-[13px] leading-5', done ? 'text-primary-ink' : tone === 'warn' ? 'text-giants-ink' : 'text-muted-foreground')}
          >
            {caption}
          </p>
        </div>
        {action}
      </div>
      {children && <div className="relative">{children}</div>}
    </section>
  );
}
