// Переключатель темы: system / light / dark.

'use client';

import { useEffect, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeMode, getStoredTheme, setStoredTheme, applyTheme } from '../lib/theme';

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = getStoredTheme();
    setMode(stored);
    applyTheme(stored);

    // Слушаем изменения system prefers-color-scheme
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (mode === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode]);

  const cycle = () => {
    const next: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    setMode(next);
    setStoredTheme(next);
    applyTheme(next);
  };

  const icons = {
    system: Monitor,
    light: Sun,
    dark: Moon,
  };

  const labels = {
    system: 'Системная',
    light: 'Светлая',
    dark: 'Тёмная',
  };

  const Icon = icons[mode];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={cycle}>
            <Icon className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Тема: {labels[mode]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
