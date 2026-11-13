// Каркас страницы Aid в бенто: шапка стоит на месте, прокручивается контент.
//
// Две раскладки:
// - tile (главная, настройки): вся страница одной нейтральной плиткой; шапка вверху
//   плитки, под ней прокручиваемый контент;
// - bento (встреча, запись): шапка над колонкой плиток, на фоне окна.
//
// Шапка одна на все экраны (PageHeader): липкая, в покое без подложки (лежит на той
// поверхности, где стоит: плитка в tile, фон окна в bento), при прокрутке стекло без
// рамки, блика и тени, а под ней полоса 28 px (.aid-edge-fade), где размытие и тон
// поверхности плавно сходят на нет: контент уходит под шапку мягко, без линии (scroll edge
// effect из Liquid Glass macOS 26). Тон стекла и полосы берётся из --head-surface, своих
// вариантов у шапки нет. Полоса прокрутки начинается под шапкой (--head-h). Область
// прокрутки обрезана по радиусу плитки (в tile overflow hidden у самой плитки, в bento
// маска .aid-round-clip), поэтому плитки у краёв окна уходят под скругление.
// Снизу запас --dock-space: над контентом плавает капсула записи (RecordDock), и контент
// под ней растворяется к низу (.aid-edge-fade-bottom), когда он длиннее экрана.
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
    const head = el?.querySelector<HTMLElement>(':scope > .aid-head-wrap');
    if (!el || !head) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--head-h', `${head.offsetHeight}px`));
    ro.observe(head);
    return () => ro.disconnect();
  }, [ref, header]);

  // Запас снизу под капсулу записи только когда контент до неё доходит. Если всё
  // помещается, запаса нет: прокручивать нечего, полоса не появляется. Конец контента
  // меряем по последнему элементу внутри последней плитки: его место не зависит от того,
  // растянута плитка до низа или нет, поэтому замер не зацикливается.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // bento: последний элемент внутри последней плитки; tile: последний элемент контента
      const column = el.querySelector<HTMLElement>(':scope > .aid-page-column, :scope > .aid-page-content');
      const last = column?.lastElementChild;
      const end = layout === 'bento' ? (last?.lastElementChild ?? last) : last;
      if (!end) return;
      const dock = parseFloat(getComputedStyle(el).getPropertyValue('--dock-space')) || 112;
      const bottom = end.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop;
      el.toggleAttribute('data-fits', bottom + dock <= el.clientHeight);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, layout]);
  const head = header && <PageHeader scrolled={scrolled}>{header}</PageHeader>;

  if (layout === 'bento') {
    return (
      <main data-layout="bento" className={cn('aid-page-in relative h-full min-w-0 flex-1', className)}>
        {/* -mr-2: прокрутка заходит в правое поле окна, полоса 8 px живёт там.
            .aid-round-clip обрезает контент по радиусу плитки у краёв плиток, не задевая полосу */}
        <div ref={ref} className="aid-scroll aid-scroll-edge aid-scroll-under-head aid-round-clip -mr-2 flex h-full flex-col gap-2 overflow-y-auto">
          {head}
          {/* Последняя нейтральная плитка тянется до низа окна, под капсулу записи, с запасом снизу.
              Цветную плитку (.aid-role) не тянем: большое цветное пятно хуже пустоты */}
          <div className="aid-page-column flex flex-1 flex-col gap-2 has-[>.aid-role:last-child]:pb-[var(--dock-pad)] [&>*:last-child:not(.aid-role)]:grow [&>*:last-child:not(.aid-role)]:pb-[var(--dock-pad)]">
            {children}
          </div>
        </div>
        {/* Низ под капсулой записи: контент растворяется к низу (только если он длиннее экрана) */}
        <div className="aid-edge-fade-bottom" aria-hidden />
      </main>
    );
  }

  return (
    <main data-layout="tile" className={cn('aid-page-in relative h-full min-w-0 flex-1 overflow-hidden rounded-tile bg-card', className)}>
      <div ref={ref} className="aid-scroll aid-scroll-under-head h-full overflow-y-auto">
        {head}
        <div className={cn('aid-page-content w-full px-5 pb-[var(--dock-pad)]', header ? 'pt-1' : 'pt-5')}>{children}</div>
      </div>
      {/* Низ под кнопкой записи: строки растворяются, как под шапкой (только если список длиннее экрана) */}
      <div className="aid-edge-fade-bottom" aria-hidden />
    </main>
  );
}

/**
 * Шапка страницы, одна на все экраны: липкая, в покое без подложки, при прокрутке стекло
 * без рамки и полоса растворения 28 px под ним. Полоса лежит рядом со стеклом, а не внутри:
 * у потомка элемента с backdrop-filter размытие видело бы только саму шапку.
 */
export function PageHeader({ scrolled, children }: { scrolled: boolean; children: ReactNode }) {
  return (
    <div className="aid-head-wrap sticky top-0 z-20 shrink-0">
      {/* data-tauri-drag-region: поля шапки перетаскивают окно, двойной клик разворачивает */}
      <header data-tauri-drag-region className={cn('aid-sticky-head aid-gutter px-5 pb-4 pt-5', scrolled && 'is-scrolled')}>
        {children}
      </header>
      <div className="aid-edge-fade" data-on={scrolled ? '' : undefined} aria-hidden />
    </div>
  );
}
