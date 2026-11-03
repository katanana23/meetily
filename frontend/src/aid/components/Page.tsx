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
  /** Ширина колонки контента (и шапки), Tailwind-класс max-w-*; колонка прижата к сайдбару. */
  width?: string;
  className?: string;
}

export function Page({ header, children, width = 'max-w-[1120px]', className }: PageProps) {
  const { ref, scrolled } = useScrollActivity<HTMLDivElement>();
  return (
    <main className={cn('flex h-full min-w-0 flex-1 flex-col', className)}>
      {header && (
        // Бенто: шапка на фоне окна без линии; под прокрученным контентом лёгкая тень вместо рамки
        // data-tauri-drag-region: поля шапки перетаскивают окно (кнопки и текст внутри нет),
        // двойной клик по ним разворачивает окно
        <header
          data-tauri-drag-region
          className={cn('aid-gutter relative z-10 shrink-0 transition-shadow', scrolled && 'shadow-[0_8px_16px_-12px_hsl(var(--foreground)/0.25)]')}
        >
          <div data-tauri-drag-region className={cn('w-full px-4 pb-5 pt-5', width)}>
            {header}
          </div>
        </header>
      )}
      <div ref={ref} className="aid-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Страница внутри плитки контента: 16 px от её края, как у шапки.
            Полоса записи стоит отдельной плиткой ниже и контент не закрывает. */}
        <div className={cn('w-full px-4 pb-6', header ? 'pt-1' : 'pt-4', width)}>{children}</div>
      </div>
    </main>
  );
}
