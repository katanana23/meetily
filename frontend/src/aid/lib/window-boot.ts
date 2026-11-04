// Показ окна Tauri при запуске. Окно создаётся скрытым ("visible": false в
// tauri.conf.json): иначе первые мгновения, пока WebView ждёт страницу, видно
// пустое светлое окно ядра, и в тёмной теме оно слепит. Скрипт в <head> ставит
// окну фон темы (тёмная #000, светлая #FFF), а показывает его скрипт в начале
// <body>, сразу после разметки заставки (LaunchScreen): окно появляется уже с
// маскотом в цвет темы. Страховки: повтор через SHOW_FALLBACK_MS и вызов из
// эффекта layout (showWindow), если встроенный скрипт не сработал.
// Права: core:window:allow-show и core:window:allow-set-background-color.
// Аргументы команд как в @tauri-apps/api 2.11 (show с label, фон с color).
// В браузере (и на заглушках ?mock=) окна нет, скрипты ничего не делают.
'use client';

const SHOW_FALLBACK_MS = 3000;

/** Для <head>, после themeScript: фон окна по теме и функция показа. */
export const windowBootScript = `
(function() {
  var w = window, T = w.__TAURI_INTERNALS__;
  if (!T || !T.invoke || /[?&]mock=/.test(location.search)) return;
  var shown = false;
  w.__aidShowWindow = function() {
    if (shown) return;
    shown = true;
    T.invoke('plugin:window|show', { label: 'main' }).catch(function(e) { console.warn('[aid] Окно не показалось:', e); });
  };
  try {
    var dark = document.documentElement.classList.contains('dark');
    T.invoke('plugin:window|set_background_color', { color: dark ? '#000000' : '#FFFFFF' }).catch(function() {});
  } catch (e) {}
  setTimeout(function() { w.__aidShowWindow(); }, ${SHOW_FALLBACK_MS});
})();
`;

/** Для начала <body>, после заставки: показать окно. */
export const windowShowScript = `window.__aidShowWindow && window.__aidShowWindow();`;

/** Страховка из эффекта layout: показать окно через API Tauri. */
export async function showWindow() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __MEETILY_MOCK__?: unknown; __aidShowWindow?: () => void };
  if (!w.__TAURI_INTERNALS__ || w.__MEETILY_MOCK__) return;
  if (w.__aidShowWindow) {
    w.__aidShowWindow();
    return;
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().show();
  } catch (error) {
    console.warn('[aid] Не удалось показать окно:', error);
  }
}
