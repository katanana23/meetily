// Окно Tauri в цвет темы Aid. При растягивании окна WebView не успевает
// перерисоваться, и по краю видна подложка окна: была белой при тёмной теме.
// Здесь окну ставятся тема заголовка и цвет фона, равный --background:
// светлая #F7F7F8 (240 9% 97%), тёмная #101013 (240 8% 7%).
// Нужны права core:window:allow-set-theme, core:window:allow-set-background-color
// и core:webview:allow-set-webview-background-color в tauri.conf.json; без них
// вызовы отклоняются, ошибка пишется в консоль, интерфейс работает как раньше.
'use client';

import { getStoredTheme, type ThemeMode } from './theme';

export const WINDOW_BACKGROUND: Record<ThemeMode, string> = { light: '#F7F7F8', dark: '#101013' };

function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __MEETILY_MOCK__?: unknown };
  // В браузере на заглушках окна нет: команды окна заглушка не эмулирует
  return Boolean(w.__TAURI_INTERNALS__) && !w.__MEETILY_MOCK__;
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
