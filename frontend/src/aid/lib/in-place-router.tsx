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

/** /meeting-details?id=… → /?id=…; null, если адрес не к встрече. */
export function inPlaceHref(href: string): string | null {
  if (!MEETING_PATH.test(href)) return null;
  const rest = href.replace(MEETING_PATH, '');
  return `/${rest}`;
}

function onHome(): boolean {
  const path = window.location.pathname;
  return path === '/' || path === '/index.html';
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
      if (method === 'push') window.history.pushState(null, '', target);
      else window.history.replaceState(null, '', target);
      if (options?.scroll !== false) window.scrollTo({ top: 0 });
    };
    return {
      ...router,
      push: (href, options) => route(href, 'push', options),
      replace: (href, options) => route(href, 'replace', options),
      // Страницу встречи заранее не грузим: она открывается на главной
      prefetch: (href, options) => (inPlaceHref(href) === null ? router.prefetch(href, options) : undefined),
    };
  }, [router, enabled]);

  if (!patched) return <>{children}</>;
  return <AppRouterContext.Provider value={patched}>{children}</AppRouterContext.Provider>;
}
