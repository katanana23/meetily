// Окно Tauri в цвет темы Aid. При растягивании окна WebView не успевает
// перерисоваться, и по краю видна подложка окна: была белой при тёмной теме.
// Здесь окну ставятся тема заголовка и цвет фона, равный --background:
// светлая #FFFFFF, тёмная #000000 (бенто: белый и чёрный фон окна).
// Нужны права core:window:allow-set-theme, core:window:allow-set-background-color
// и core:webview:allow-set-webview-background-color в tauri.conf.json; без них
// вызовы отклоняются, ошибка пишется в консоль, интерфейс работает как раньше.
'use client';

import { getStoredTheme, type ThemeMode } from './theme';

// Фон окна бенто (globals.css, --background): светлая #ECEEEB, тёмная #1C1C1C
export const WINDOW_BACKGROUND: Record<ThemeMode, string> = { light: '#ECEEEB', dark: '#1C1C1C' };

function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __MEETILY_MOCK__?: unknown };
  // В браузере на заглушках окна нет: команды окна заглушка не эмулирует
  return Boolean(w.__TAURI_INTERNALS__) && !w.__MEETILY_MOCK__;
}

/**
 * macOS в Tauri: заголовок окна в режиме Overlay (tauri.conf.json), кнопки окна
 * поверх нашего фона. Класс на <html> включает место под них в сайдбаре
 * (.aid-titlebar-overlay). В браузере и на других системах места не нужно.
 */
export function markTitlebarOverlay() {
  if (!inTauri()) return;
  if (/Mac/i.test(navigator.platform || navigator.userAgent)) document.documentElement.classList.add('aid-titlebar-overlay');
}

export async function syncWindowTheme(mode: ThemeMode = getStoredTheme()) {
  if (!inTauri()) return;
  const color = WINDOW_BACKGROUND[mode];
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await Promise.allSettled([win.setTheme(mode), win.setBackgroundColor(color)]).then((results) =>
      results.forEach((r) => r.status === 'rejected' && console.warn('[aid] Окно не приняло тему:', r.reason)),
    );
    // Фон самого WebView (на macOS не поддерживается ядром, ошибка не мешает)
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    await getCurrentWebview()
      .setBackgroundColor(color)
      .catch(() => undefined);
  } catch (error) {
    console.warn('[aid] Не удалось применить тему к окну:', error);
  }
}
