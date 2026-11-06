// Верхняя полоса окна на macOS: 38 px на всю ширину, цвета фона окна в обеих темах.
// Кнопки окна (titleBarStyle Overlay) стоят в ней по центру по вертикали:
// trafficLightPosition y 22 в tauri.conf.json, зона кнопок 16 + 22 = 38 px, кнопки
// по её центру; x 18 ставит их над колонкой сайдбара. Плитки начинаются ниже, через 8 px.
//
// Перетаскивание и двойной клик (развернуть или вернуть окно) делает сам Tauri по
// атрибуту data-tauri-drag-region (права core:window:allow-start-dragging и
// allow-internal-toggle-maximize в tauri.conf.json). Атрибут нужен самому элементу,
// по которому кликнули, поэтому внутри полосы ничего нет.
//
// Полоса видна только с классом .aid-titlebar-overlay (Tauri на macOS, window-theme.ts)
// и в браузере на заглушках; на Windows и Linux заголовок окна системный.
'use client';

export function WindowBar() {
  return <div data-tauri-drag-region aria-hidden className="aid-window-bar hidden h-[38px] shrink-0 bg-background [.aid-titlebar-overlay_&]:block" />;
}
