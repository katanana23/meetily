// Кнопки окна на macOS в своей подложке: маленькая плитка-таблетка 72 × 35 px над
// сайдбаром (та же ширина, отступ 8 px от краёв окна и до сайдбара), цвет между фоном
// окна и плитками (.aid-window-strip). Кнопки окна (titleBarStyle Overlay) стоят в ней
// по центру: trafficLightPosition в tauri.conf.json (x 18, y 27) ставит их центр на
// середину таблетки, группа около 50 px: отступы со всех сторон примерно по 11 px. Колонка страницы справа идёт
// во всю высоту окна, полосы во всю ширину нет.
//
// Перетаскивание и двойной клик (развернуть или вернуть окно) делает сам Tauri по
// атрибуту data-tauri-drag-region (права core:window:allow-start-dragging и
// allow-internal-toggle-maximize в tauri.conf.json).
//
// Подложка видна только с классом .aid-titlebar-overlay (Tauri на macOS, window-theme.ts)
// и в браузере на заглушках; на Windows и Linux заголовок окна системный.
'use client';

export function WindowBar() {
  return <div data-tauri-drag-region aria-hidden className="aid-window-bar aid-window-strip hidden h-[35px] w-[72px] shrink-0 rounded-full [.aid-titlebar-overlay_&]:block" />;
}
