// Переключатель темы: светлая и тёмная, одна кнопка.
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { getStoredTheme, onThemeChange, setTheme, type ThemeMode } from '@/aid/lib/theme';
import { t } from '@/aid/strings';

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setMode(getStoredTheme());
    return onThemeChange(setMode);
  }, []);

  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="ghost"
      className="w-full justify-start px-3 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(next)}
      aria-label={next === 'dark' ? t('themeToDark') : t('themeToLight')}
    >
      {mode === 'dark' ? <Sun /> : <Moon />}
      {next === 'dark' ? t('themeDark') : t('themeLight')}
    </Button>
  );
}
