// Единственный индикатор ожидания в Aid: дуга без подложки, 16 или 20 px,
// вращение и цвет из токенов (.aid-spinner, --loader). Это не иконка: залитые
// спиннеры Phosphor (SpinnerGap, CircleNotch в fill) рисуются диском с вырезом
// и читаются как значок, а не как ожидание. Внутри кнопки цвет наследуется
// от текста кнопки (tone="inherit"), вне кнопки берётся нейтральный --loader.
'use client';

import { cn } from '@/aid/lib/utils';

interface SpinnerProps {
  size?: 16 | 20;
  /** inherit: цвет текста вокруг (кнопки); иначе нейтральный --loader. */
  tone?: 'loader' | 'inherit';
  className?: string;
  label?: string;
}

export function Spinner({ size = 20, tone = 'loader', className, label }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={cn('aid-spinner', size === 16 ? 'size-4' : 'size-5', tone === 'loader' && 'text-[hsl(var(--loader))]', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Три четверти окружности, концы скруглены; толщина как у иконок Phosphor (~2 px на 20) */}
      <path d="M10 2.75a7.25 7.25 0 1 1-7.25 7.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
