// Каркас страницы Aid в бенто: шапка стоит на месте, прокручивается только контент.
//
// Две раскладки:
// - tile (главная): вся страница одной нейтральной плиткой; шапка вверху плитки,
//   под ней прокручиваемый список. Полоса прокрутки внутри плитки.
// - bento (встреча, запись, настройки): шапка отдельной плиткой, ниже колонка
//   плиток, которая прокручивается целиком. Полоса прокрутки живёт в правом поле
//   окна (8 px), поэтому края плиток совпадают с краем шапки и плитки записи.
//
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
  /** tile: вся страница одной плиткой; bento: шапка-плитка и колонка плиток. */
  layout?: 'tile' | 'bento';
  className?: string;
}

/** Плитка бенто: нейтральная, радиус 24, отступ 20 px. */
export const TILE = 'rounded-tile bg-card p-5';

export function Page({ header, children, layout = 'tile', className }: PageProps) {
  const { ref, scrolled } = useScrollActivity<HTMLDivElement>();

  if (layout === 'bento') {
    return (
      <main className={cn('flex h-full min-w-0 flex-1 flex-col gap-2', className)}>
        {header && (
          // data-tauri-drag-region: поля шапки перетаскивают окно, двойной клик разворачивает
          <header data-tauri-drag-region className={cn(TILE, 'shrink-0')}>
            {header}
          </header>
        )}
        {/* -mr-2: прокрутка заходит в правое поле окна, полоса 8 px живёт там */}
        <div ref={ref} className="aid-scroll aid-scroll-edge -mr-2 min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2">{children}</div>
        </div>
      </main>
    );
  }

  return (
    <main className={cn('flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-tile bg-card', className)}>
      {header && (
        // Над прокрученным списком тонкая линия вместо тени
        <header
          data-tauri-drag-region
          className={cn('aid-gutter relative z-10 shrink-0 border-b px-5 pb-4 pt-5 transition-colors', scrolled ? 'border-border' : 'border-transparent')}
        >
          {header}
        </header>
      )}
      <div ref={ref} className="aid-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn('w-full px-5 pb-5', header ? 'pt-1' : 'pt-5')}>{children}</div>
      </div>
    </main>
  );
}
