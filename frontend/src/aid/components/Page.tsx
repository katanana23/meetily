// Каркас страницы Aid: шапка стоит на месте, прокручивается только контент.
// У прокручиваемой области scrollbar-gutter: stable (ширина не прыгает, когда
// появляется полоса) и тонкая полоса в духе macOS: видна при прокрутке и наведении.
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/aid/lib/utils';

/** Класс is-scrolling на время прокрутки: по нему полоса проявляется (см. .aid-scroll). */
export function useScrollActivity<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), 900);
      setScrolled(el.scrollTop > 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, []);

  return { ref, scrolled };
}

interface PageProps {
  /** Неподвижная шапка: заголовок, действия, вкладки. */
  header?: ReactNode;
  children: ReactNode;
  /** Ширина колонки контента (и шапки), Tailwind-класс max-w-*. */
  width?: string;
  className?: string;
}

export function Page({ header, children, width = 'max-w-[880px]', className }: PageProps) {
  const { ref, scrolled } = useScrollActivity<HTMLDivElement>();
  return (
    <main className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
      {header && (
        <header
          className={cn(
            'aid-gutter shrink-0 border-b transition-colors',
            scrolled ? 'border-border' : 'border-transparent',
          )}
        >
          <div className={cn('mx-auto w-full px-8 pb-4 pt-6', width)}>{header}</div>
        </header>
      )}
      <div ref={ref} className="aid-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn('mx-auto w-full px-8 pb-16', header ? 'pt-6' : 'pt-10', width)}>{children}</div>
      </div>
    </main>
  );
}
