// Тема: светлая или тёмная, выбор хранится в localStorage (ключ прежний).
// Старое значение «system» при первом чтении превращается в тему системы.

export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'shade.theme';
const THEME_EVENT = 'shade-theme-change';

function systemTheme(): ThemeMode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* хранилище недоступно: берём тему системы */
  }
  return systemTheme();
}

export function setTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* тема просто не запомнится */
  }
  document.documentElement.classList.toggle('dark', mode === 'dark');
  // Окно Tauri в цвет темы: без белой полосы при растягивании (window-theme.ts)
  void import('./window-theme').then((m) => m.syncWindowTheme(mode));
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: mode }));
}

export function onThemeChange(cb: (mode: ThemeMode) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<ThemeMode>).detail);
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}

// Блокирующий скрипт для <head>: ставит класс до первой отрисовки, без мигания.
export const themeScript = `
(function() {
  try { window.__shadeLaunchAt = performance.now(); } catch (e) {}
  try {
    var s = localStorage.getItem('${THEME_KEY}');
    var dark = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
  // Окно Tauri на macOS (кнопки окна в верхней полосе WindowBar): класс ставится до первой
  // отрисовки, иначе плитки первые мгновения стоят под кнопками окна
  try {
    var w = window;
    if (w.__TAURI_INTERNALS__ && !/[?&]mock=/.test(location.search) && /Mac/i.test(navigator.platform || navigator.userAgent)) {
      document.documentElement.classList.add('shade-titlebar-overlay');
    } else if (/[?&]mock=/.test(location.search)) {
      // Браузер на заглушках: та же полоса окна с нарисованными кнопками, как на Mac
      document.documentElement.classList.add('shade-titlebar-overlay', 'shade-titlebar-mock');
    }
  } catch (e) {}
})();
`;
