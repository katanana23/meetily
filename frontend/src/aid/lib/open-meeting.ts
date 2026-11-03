// Открыть встречу. Обычно это переход внутри приложения (Next router).
//
// Сборка (Tauri отдаёт статическую выгрузку): если переход за 1,5 с не случился,
// встреча открывается обычной загрузкой страницы, Tauri отдаёт meeting-details.html
// по тому же адресу. В консоль пишется предупреждение.
//
// Разработка (pnpm dev, pnpm tauri:dev): Next компилирует страницу встречи при
// первом переходе, это 5–7 с, и всё это время экран стоит, что выглядело как
// «клик не работает». Поэтому:
// - запасной переход в разработке не делается: перезагрузка посреди компиляции
//   только начинала всё заново;
// - страницы встречи и настроек компилируются заранее, в фоне после загрузки
//   главной (warmUpRoutes);
// - строка сразу показывает, что встреча открывается (MeetingRow).
'use client';

const FALLBACK_MS = 1500;
const DEV = process.env.NODE_ENV === 'development';

export function meetingHref(id: string): string {
  return `/meeting-details?id=${encodeURIComponent(id)}`;
}

/** Страховка после клика по ссылке Next: вызвать из onClick ссылки. */
export function guardNavigation(href: string) {
  if (DEV) return;
  const started = window.location.href;
  const t0 = Date.now();
  // Следим, менялся ли адрес хоть раз: за 1,5 с можно успеть перейти и вернуться назад
  const timer = setInterval(() => {
    if (window.location.href !== started) {
      clearInterval(timer); // переход случился
      return;
    }
    if (Date.now() - t0 < FALLBACK_MS) return;
    clearInterval(timer);
    console.warn(`[aid] Переход к встрече не случился за ${FALLBACK_MS} мс, открываем страницу напрямую: ${href}`);
    window.location.assign(href);
  }, 50);
}

/** Программное открытие встречи (клик по строке мимо ссылки). */
export function openMeeting(push: (href: string) => void, id: string) {
  const href = meetingHref(id);
  push(href);
  guardNavigation(href);
}

let warmed = false;

/**
 * Только в разработке: заранее скомпилировать страницы встречи и настроек, чтобы
 * первый клик по встрече открывал её сразу. В сборке ничего не делает.
 */
export function warmUpRoutes() {
  if (!DEV || warmed || typeof window === 'undefined') return;
  warmed = true;
  const run = () => {
    for (const path of ['/meeting-details', '/settings']) {
      void fetch(path, { cache: 'no-store' }).catch(() => undefined);
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}
