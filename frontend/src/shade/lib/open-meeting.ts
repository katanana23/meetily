// Открыть встречу.
//
// Встреча открывается прямо на главной: адрес меняется на /?id=… через
// history.pushState, а главная показывает экран встречи вместо списка. Перехода
// между страницами нет: ни запроса данных маршрута Next, ни загрузки
// meeting-details.html. В окне Tauri на macOS такой переход зависал, и встреча
// не открывалась вовсе. Next 14.2 сам подхватывает pushState: useSearchParams
// обновляется, «Назад» в истории работает без перезагрузки.
// Переходы на /meeting-details и обратно к списку переводит на место
// in-place-router.tsx. Старый адрес /meeting-details?id=… тоже открывает встречу.
'use client';

const DEV = process.env.NODE_ENV === 'development';

/** Адрес встречи: та же главная с параметром id. */
export function meetingHref(id: string): string {
  return `/?id=${encodeURIComponent(id)}`;
}

/** Открыть встречу без перехода между страницами (на главной). */
export function openMeeting(id: string) {
  window.history.pushState(null, '', meetingHref(id));
  window.scrollTo({ top: 0 });
}

let warmed = false;

/**
 * Только в разработке: заранее скомпилировать страницу настроек, чтобы первый
 * переход в неё был сразу. В сборке ничего не делает.
 */
export function warmUpRoutes() {
  if (!DEV || warmed || typeof window === 'undefined') return;
  warmed = true;
  const run = () => void fetch('/settings', { cache: 'no-store' }).catch(() => undefined);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}
