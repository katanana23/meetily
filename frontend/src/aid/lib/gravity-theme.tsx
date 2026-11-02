// Gravity UI ThemeProvider integration для Aid Meetings.
// Синхронизирует существующий механизм темы с Gravity UI.

'use client';

import { ThemeProvider as GravityThemeProvider } from '@gravity-ui/uikit';
import { useEffect, useState, ReactNode } from 'react';
import { getStoredTheme, applyTheme, type ThemeMode } from './theme';

export function AidGravityThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = getStoredTheme();

    // Применяем через существующий механизм
    applyTheme(stored);

    // Определяем реальную тему для Gravity UI
    const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
      if (mode === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return mode === 'dark' ? 'dark' : 'light';
    };

    setTheme(resolveTheme(stored));

    // Слушаем изменения системной темы
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = getStoredTheme();
      if (current === 'system') {
        setTheme(resolveTheme('system'));
      }
    };

    mediaQuery.addEventListener('change', handler);

    // Слушаем изменения темы через custom event
    const themeChangeHandler = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeMode>;
      setTheme(resolveTheme(customEvent.detail));
    };

    window.addEventListener('aid-theme-change', themeChangeHandler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
      window.removeEventListener('aid-theme-change', themeChangeHandler);
    };
  }, []);

  return (
    <GravityThemeProvider theme={theme}>
      {children}
    </GravityThemeProvider>
  );
}
