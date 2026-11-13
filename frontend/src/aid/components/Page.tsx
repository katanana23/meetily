// Каркас страницы Aid в бенто: шапка стоит на месте, прокручивается контент.
//
// Две раскладки:
// - tile (главная, настройки): вся страница одной нейтральной плиткой; шапка вверху
//   плитки, под ней прокручиваемый контент;
// - bento (встреча, запись): шапка над колонкой плиток, на фоне окна.
//
// Шапка одна на все экраны, как large title у Apple:
// - большой заголовок и всё под ним (мета, подпись, чипы, вкладки: `hero`) прокручиваются
//   вместе с контентом;
// - наверху остаётся компактная полоса (PageHeader): слева «Назад», название 17 px
//   полужирное в одну строку (появляется, когда большой заголовок ушёл под полосу), справа
//   действия. В покое без подложки;
// - контент под полосой размывается, а не затемняется: прогрессивное размытие из трёх слоёв
//   backdrop-filter с масками, сильное у верха и сходит на нет к нижнему краю полосы
//   (.aid-head-blur). Ни тона, ни градиентов поверх контента. Слои лежат рядом с полосой, а
//   не внутри элемента с фильтром: иначе размытие видело бы только саму полосу.
// Полоса прокрутки начинается под полосой (--head-h). Область прокрутки обрезана по радиусу
// плитки (overflow hidden: в tile у самой плитки, в bento у обёртки области прокрутки).
// Снизу запас --dock-space: над контентом плавает капсула записи (RecordDock), и контент
// под ней растворяется к низу (.aid-edge-fade-bottom), когда он длиннее экрана.
'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/aid/lib/utils';

/** Класс is-scrolling на время прокрутки: по нему полоса проявляется (см. .aid-scroll). */
export function useScrollActivity<T extends HTMLElement>(heroRef?: RefObject<HTMLElement>, root = false) {
  const ref = useRef<T>(null);
  const [scrolled, setScrolled] = useState(false);
  /** Большой заголовок ушёл под полосу: название в полосе. */
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), 900);
      setScrolled(el.scrollTop > 0);
      const hero = heroRef?.current;
      const bar = el.querySelector<HTMLElement>(':scope > .aid-head-wrap');
      // Название в полосе, когда заголовок страницы (первая строка hero) скрылся под ней
      const title = hero?.querySelector<HTMLElement>('h1') ?? hero;
      if (title && bar) {
        const bottom = title.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
        // Дочерний экран: заголовок под полосой, название в полосе, когда он ушёл под неё.
        // Корневой: заголовок в одной строке с действиями, название в полосе, когда он
        // поднялся над своим местом (его низ выше верхнего отступа полосы плюс полстроки)
        setCollapsed(bottom < (root ? ROOT_COLLAPSE_PX : bar.offsetHeight));
      } else setCollapsed(el.scrollTop > 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
    // heroRef стабилен (useRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, scrolled, collapsed };
}

interface PageProps {
  /** Полоса: слева («Назад»). */
  leading?: ReactNode;
  /** Название страницы в полосе: появляется, когда большой заголовок ушёл под неё. */
  title?: ReactNode;
  /** Полоса: действия справа. */
  actions?: ReactNode;
  /** Большой заголовок и всё под ним (мета, подпись, чипы, вкладки): прокручивается с контентом. */
  hero?: ReactNode;
  children: ReactNode;
  /** tile: вся страница одной плиткой; bento: шапка-плитка и колонка плиток. */
  layout?: 'tile' | 'bento';
  className?: string;
}

/** Корневой экран: название в полосе, когда низ большого заголовка поднялся выше этого. */
const ROOT_COLLAPSE_PX = 40;
/** Полоса: 20 сверху, кнопка 56, 12 снизу. Корневой заголовок встаёт в её строку: на 20 от верха. */
const BAR_H = 88;
const ROOT_HERO_SHIFT = BAR_H - 20;

/** Плитка бенто: нейтральная, радиус 24, отступ 20 px. */
export const TILE = 'rounded-tile bg-card p-5';

export function Page({ leading, title, actions, hero, children, layout = 'tile', className }: PageProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  // Корневой экран (без «Назад»): большой заголовок в одной строке с действиями, без пустого
  // этажа над ним. Дочерний: полоса с «Назад» и действиями, заголовок под ней
  const root = !leading && Boolean(hero);
  const { ref, scrolled, collapsed } = useScrollActivity<HTMLDivElement>(heroRef, root);
  const header = leading || title || actions;
  // Ширина действий в полосе: у корневого экрана большой заголовок не заходит под них
  useEffect(() => {
    const el = ref.current;
    const acts = el?.querySelector<HTMLElement>(':scope .aid-head-actions');
    if (!el || !acts) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--head-actions-w', `${acts.offsetWidth}px`));
    ro.observe(acts);
    return () => ro.disconnect();
  }, [ref, actions]);
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
  const head = header && <PageHeader scrolled={scrolled} collapsed={collapsed} leading={leading} title={title} actions={actions} />;
  const heroBlock = hero && (
    <div
      ref={heroRef}
      className={cn('aid-hero min-w-0 px-5', layout === 'bento' ? 'pb-2' : 'pb-4', !header && 'pt-5', root && header && 'aid-hero-root')}
      style={root && header ? { marginTop: -ROOT_HERO_SHIFT } : undefined}
    >
      {hero}
    </div>
  );

  if (layout === 'bento') {
    return (
      <main data-layout="bento" className={cn('aid-page-in relative h-full min-w-0 flex-1', className)}>
        {/* -mr-2: прокрутка заходит в правое поле окна, полоса 8 px живёт там. Скругление по
            радиусу плитки через overflow hidden у обёртки, а не маской: маска и clip-path у
            области прокрутки отрезают размытию полосы всё, что под ней (контент оставался резким) */}
        <div className="-mr-2 h-full overflow-hidden rounded-tile">
        <div ref={ref} className="aid-scroll aid-scroll-edge aid-scroll-under-head flex h-full flex-col gap-2 overflow-y-auto">
          {head}
          {heroBlock}
          {/* Последняя нейтральная плитка тянется до низа окна, под капсулу записи, с запасом снизу.
              Цветную плитку (.aid-role) не тянем: большое цветное пятно хуже пустоты */}
          <div className="aid-page-column flex flex-1 flex-col gap-2 has-[>.aid-role:last-child]:pb-[var(--dock-pad)] [&>*:last-child:not(.aid-role)]:grow [&>*:last-child:not(.aid-role)]:pb-[var(--dock-pad)]">
            {children}
          </div>
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
        {heroBlock}
        <div className={cn('aid-page-content w-full px-5 pb-[var(--dock-pad)]', header || hero ? 'pt-1' : 'pt-5')}>{children}</div>
      </div>
      {/* Низ под кнопкой записи: строки растворяются, как под шапкой (только если список длиннее экрана) */}
      <div className="aid-edge-fade-bottom" aria-hidden />
    </main>
  );
}

/**
 * Компактная полоса страницы, одна на все экраны: «Назад», название в одну строку (при
 * прокрутке), действия. В покое без подложки; при прокрутке под ней прогрессивное размытие.
 */
export function PageHeader({
  scrolled,
  collapsed,
  leading,
  title,
  actions,
}: {
  scrolled: boolean;
  collapsed: boolean;
  leading?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="aid-head-wrap sticky top-0 z-20 shrink-0" data-scrolled={scrolled ? '' : undefined}>
      {/* Прогрессивное размытие: три слоя, чем сильнее размытие, тем короче маска */}
      <div className="aid-head-blur" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      {/* data-tauri-drag-region: поля полосы перетаскивают окно, двойной клик разворачивает */}
      <header data-tauri-drag-region className="aid-sticky-head aid-gutter relative flex min-h-[88px] items-center gap-3 px-5 pb-3 pt-5">
        {leading && <div className="flex shrink-0 items-center">{leading}</div>}
        <p
          className={cn('aid-head-title min-w-0 flex-1 truncate text-[17px] font-semibold leading-6', collapsed && 'is-on')}
          aria-hidden={!collapsed}
          data-tauri-drag-region
        >
          {title}
        </p>
        {actions && <div className="aid-head-actions flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
    </div>
  );
}
