// Переключатель темы: светлая и тёмная, одна тихая строка сайдбара.
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { getStoredTheme, onThemeChange, setTheme, type ThemeMode } from '@/aid/lib/theme';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const ROW =
  'flex h-11 w-full items-center gap-3 rounded-row px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setMode(getStoredTheme());
    return onThemeChange(setMode);
  }, []);

  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <button type="button" className={cn(ROW)} onClick={() => setTheme(next)} aria-label={next === 'dark' ? t('themeToDark') : t('themeToLight')}>
      {mode === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
      {next === 'dark' ? t('themeDark') : t('themeLight')}
    </button>
  );
}
