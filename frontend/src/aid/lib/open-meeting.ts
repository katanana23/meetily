// Открыть встречу. Обычно это переход внутри приложения (Next router). Если он
// за 1,5 с не случился (в Tauri переход грузит данные страницы через тот же канал,
// что и запросы к ядру, и мог застрять за ними), встреча открывается обычной
// загрузкой страницы: Tauri отдаёт meeting-details.html по тому же адресу.
// В консоль пишется предупреждение, чтобы такой случай было видно.
'use client';

const FALLBACK_MS = 1500;

export function meetingHref(id: string): string {
  return `/meeting-details?id=${encodeURIComponent(id)}`;
}

/** Страховка после клика по ссылке Next: вызвать из onClick ссылки. */
export function guardNavigation(href: string) {
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
