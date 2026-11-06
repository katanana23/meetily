// Каркас страницы Aid в бенто: шапка стоит на месте, прокручивается контент.
//
// Две раскладки:
// - tile (главная): вся страница одной нейтральной плиткой; шапка вверху плитки,
//   под ней прокручиваемый список;
// - bento (встреча, запись, настройки): шапка отдельной плиткой, ниже колонка
//   плиток.
//
// В обеих шапка липкая и лежит поверх контента: в покое это обычная плитка, а при
// прокрутке стекло (.aid-glass), и контент проходит под ним размытым. На главной шапка
// часть самой плитки (.aid-head-flat): при прокрутке без своей рамки и скруглений,
// только тонкая линия снизу; полоса прокрутки начинается под ней (--head-h). Область
// прокрутки обрезана по радиусу плитки (на главной overflow hidden у самой плитки,
// в бенто маска .aid-round-clip), поэтому плитки у краёв окна не обрываются
// плоской линией, а уходят под скругление.
// Снизу запас --dock-space: над контентом плавает капсула записи (RecordDock).
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
  // Высота шапки в --head-h у области прокрутки: полоса прокрутки начинается под шапкой, а не за стеклом
  useEffect(() => {
    const el = ref.current;
    const head = el?.querySelector<HTMLElement>(':scope > .aid-sticky-head');
    if (!el || !head) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--head-h', `${head.offsetHeight}px`));
    ro.observe(head);
    return () => ro.disconnect();
  }, [ref, header]);
  // Шапка: в покое плитка, при прокрутке стекло
  const head = (extra: string, flat = false) =>
    header && (
      // data-tauri-drag-region: поля шапки перетаскивают окно, двойной клик разворачивает
      <header data-tauri-drag-region className={cn('aid-sticky-head sticky top-0 z-20 shrink-0', flat ? 'aid-head-flat' : 'rounded-tile', scrolled && 'aid-glass', extra)}>
        {header}
      </header>
    );

  if (layout === 'bento') {
    return (
      <main className={cn('relative h-full min-w-0 flex-1', className)}>
        {/* -mr-2: прокрутка заходит в правое поле окна, полоса 8 px живёт там.
            .aid-round-clip обрезает контент по радиусу плитки у краёв плиток, не задевая полосу */}
        <div ref={ref} className="aid-scroll aid-scroll-edge aid-round-clip -mr-2 flex h-full flex-col gap-2 overflow-y-auto">
          {head('p-5')}
          {/* Последняя нейтральная плитка тянется до низа окна, под капсулу записи, с запасом снизу.
              Цветную плитку (.aid-role) не тянем: большое цветное пятно хуже пустоты */}
          <div className="flex flex-1 flex-col gap-2 has-[>.aid-role:last-child]:pb-[var(--dock-space)] [&>*:last-child:not(.aid-role)]:grow [&>*:last-child:not(.aid-role)]:pb-[var(--dock-space)]">
            {children}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={cn('relative h-full min-w-0 flex-1 overflow-hidden rounded-tile bg-card', className)}>
      <div ref={ref} className="aid-scroll aid-scroll-under-head h-full overflow-y-auto">
        {head('aid-gutter px-5 pb-4 pt-5', true)}
        <div className={cn('w-full px-5 pb-[var(--dock-space)]', header ? 'pt-1' : 'pt-5')}>{children}</div>
      </div>
    </main>
  );
}
