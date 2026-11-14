// Переключатель темы: вертикальная таблетка из двух сегментов (солнце и луна)
// для узкого сайдбара. Выбранная тема на плитке, вторая приглушена.
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { getStoredTheme, onThemeChange, setTheme, type ThemeMode } from '@/shade/lib/theme';
import { cn } from '@/shade/lib/utils';
import { t } from '@/shade/strings';

const OPTIONS = [
  { mode: 'light' as const, icon: Sun, label: t('themeLight') },
  { mode: 'dark' as const, icon: Moon, label: t('themeDark') },
];

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setMode(getStoredTheme());
    return onThemeChange(setMode);
  }, []);

  return (
    <div role="radiogroup" aria-label={t('theme')} className="flex flex-col gap-1 rounded-full bg-muted p-1">
      {OPTIONS.map(({ mode: m, icon: Icon, label }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(m)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
