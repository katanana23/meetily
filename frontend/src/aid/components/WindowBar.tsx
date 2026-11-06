// Верхняя полоса окна на macOS бенто-плиткой: таблетка 26 px с отступом 8 px по бокам и
// 6 px сверху, цвет между фоном окна и плитками (.aid-window-strip), менее контрастная,
// чем плитки. Кнопки окна (titleBarStyle Overlay) стоят в ней: trafficLightPosition
// в tauri.conf.json ставит их центр на 19 px от верха, x 18 над колонкой сайдбара. Плитки
// начинаются ниже, через 8 px (зона полосы 32 px).
//
// Перетаскивание и двойной клик (развернуть или вернуть окно) делает сам Tauri по
// атрибуту data-tauri-drag-region (права core:window:allow-start-dragging и
// allow-internal-toggle-maximize в tauri.conf.json). Атрибут нужен самому элементу,
// по которому кликнули, поэтому он стоит и на зоне, и на таблетке.
//
// Полоса видна только с классом .aid-titlebar-overlay (Tauri на macOS, window-theme.ts)
// и в браузере на заглушках; на Windows и Linux заголовок окна системный.
'use client';

export function WindowBar() {
  return (
    <div data-tauri-drag-region aria-hidden className="aid-window-bar hidden h-8 shrink-0 bg-background px-2 pt-1.5 [.aid-titlebar-overlay_&]:block">
      <div data-tauri-drag-region className="aid-window-strip h-[26px] rounded-full" />
    </div>
  );
}
