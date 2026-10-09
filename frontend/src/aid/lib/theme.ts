// Тема и переключатель: system, light, dark.
// Выбор запоминается в localStorage без мигания при загрузке.

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'aid-meetings.theme';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {}
  return 'system';
}

export function setStoredTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// Блокирующий скрипт для вставки в <head> перед всем остальным.
// Предотвращает мигание темы при загрузке страницы.
export const themeScript = `
(function() {
  try {
    const stored = localStorage.getItem('aid-meetings.theme');
    const mode = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch {}
})();
`;
