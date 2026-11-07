// Встреча открывается на главной, без перехода между страницами (open-meeting.ts).
//
// Оригинальные хуки (useRecordingStop после записи) и ссылки Next ведут на
// /meeting-details?id=…, а их файлы менять нельзя. Этот провайдер подменяет
// маршрутизатор Next в контексте: push и replace на /meeting-details с главной
// становятся history.pushState и replaceState на /?id=… (тот же запрос), и главная
// показывает встречу. Возврат к списку (/) с главной тоже без перехода. С других
// страниц переход идёт на /?id=… обычным путём. Остальные переходы не меняются.
'use client';

import { useContext, useMemo, type ReactNode } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

type Router = NonNullable<React.ContextType<typeof AppRouterContext>>;

const MEETING_PATH = /^\/meeting-details(?:\.html)?\/?(?=\?|#|$)/;
const SETTINGS_PATH = /^\/settings(?:\.html)?\/?(?=\?|#|$)/;

/**
 * /meeting-details?id=… → /?id=…; /settings?tab=… → /?view=settings&tab=…;
 * null, если адрес не к встрече и не к настройкам. Настройки тоже открываются на
 * главной: переход на отдельную страницу в окне Tauri на macOS зависал, кнопка
 * «Настройки» казалась ненажимающейся.
 */
export function inPlaceHref(href: string): string | null {
  if (MEETING_PATH.test(href)) return `/${href.replace(MEETING_PATH, '')}`;
  if (SETTINGS_PATH.test(href)) {
    const rest = href.replace(SETTINGS_PATH, '');
    return rest.startsWith('?') ? `/?view=settings&${rest.slice(1)}` : `/?view=settings${rest}`;
  }
  return null;
}

function onHome(): boolean {
  const path = window.location.pathname;
  return path === '/' || path === '/index.html';
}

/**
 * Переход «Встреча сохранена» → страница встречи без скачка: карточка обложки экрана
 * обработки (FinishingScreen) перетекает в шапку встречи: обеим на время перехода дано
 * имя aid-meeting (:root[data-morph], globals.css). View Transitions есть в Chromium и в
 * WebKit macOS 15; где их нет или включено «уменьшить движение», обычный переход с мягким
 * проявлением страницы. Ждём шапку встречи не дольше 800 мс, потом снимок всё равно.
 */
function morphToMeeting(go: () => void): boolean {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };
  // Переход запускает оригинальный хук остановки, когда сохранение готово; сцена обложки
  // может ещё догонять статус (минимальное время показа), поэтому годится любая
  const card = document.querySelector('.aid-fin-card');
  if (!card || !doc.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const root = document.documentElement;
  root.setAttribute('data-morph', '');
  // Во время смены кадров браузер не рисует и не вызывает requestAnimationFrame: ждём таймером
  const ready = () =>
    new Promise<void>((resolve) => {
      const started = performance.now();
      const check = () => {
        const head = document.querySelector('main .aid-sticky-head');
        if ((head && !document.querySelector('.aid-fin-card')) || performance.now() - started > 800) resolve();
        else window.setTimeout(check, 16);
      };
      window.setTimeout(check, 16);
    });
  const vt = doc.startViewTransition(() => {
    go();
    return ready();
  });
  void vt.finished.finally(() => root.removeAttribute('data-morph'));
  return true;
}

export function InPlaceMeetingRouter({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const router = useContext(AppRouterContext);
  const patched = useMemo<Router | null>(() => {
    if (!router || !enabled) return null;
    const route = (href: string, method: 'push' | 'replace', options?: Parameters<Router['push']>[1]) => {
      const meeting = inPlaceHref(href);
      const target = meeting ?? href;
      // На месте: встреча и возврат к списку (/ и /?…), пока открыта главная
      const toHome = target === '/' || target.startsWith('/?') || target.startsWith('/#');
      if (!toHome || !onHome()) return router[method](target, options);
      const go = () => {
        // Та же встреча ещё раз (открыли с экрана обработки, потом переход оригинала; страница
        // встречи к тому времени убирает из адреса source): без новой записи в истории
        const next = new URL(target, window.location.href).searchParams.get('id');
        const same = next !== null && next === new URLSearchParams(window.location.search).get('id');
        if (method === 'push' && !same) window.history.pushState(null, '', target);
        else window.history.replaceState(null, '', target);
        if (options?.scroll !== false) window.scrollTo({ top: 0 });
      };
      // После записи: карточка экрана обработки перетекает в шапку страницы встречи
      if (meeting && morphToMeeting(go)) return;
      go();
    };
    return {
      ...router,
      push: (href, options) => route(href, 'push', options),
      replace: (href, options) => route(href, 'replace', options),
      // Страницы встречи и настроек заранее не грузим: они открываются на главной
      prefetch: (href, options) => (inPlaceHref(href) === null ? router.prefetch(href, options) : undefined),
    };
  }, [router, enabled]);

  if (!patched) return <>{children}</>;
  return <AppRouterContext.Provider value={patched}>{children}</AppRouterContext.Provider>;
}
