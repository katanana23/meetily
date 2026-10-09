// Сайдбар Aid: 240px, навигация, переключатель темы, PrivacyChip внизу

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Settings, Moon, Sun, Monitor, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { getStoredTheme, setStoredTheme, applyTheme, type ThemeMode } from '@/aid/lib/theme';
import { PrivacyChip } from './PrivacyChip';
import { useConfig } from '@/contexts/ConfigContext';
import { getCombinedPrivacy } from '@/aid/lib/privacy';

export function AidSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>('system');
  const { modelConfig: summaryModelConfig, transcriptModelConfig } = useConfig();

  const privacyLevel = getCombinedPrivacy(
    transcriptModelConfig?.provider,
    summaryModelConfig?.provider
  );

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    setStoredTheme(mode);
    applyTheme(mode);
  };

  const navItems = [
    { label: 'Встречи', path: '/' },
    { label: 'Поиск', path: '/search' },
    { label: 'Настройки', path: '/settings' },
  ];

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col h-screen shrink-0">
      {/* Шапка */}
      <div className="p-4 border-b border-border">
        <h2 className="text-[15px] font-semibold">Aid Meetings</h2>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-2">
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`w-full text-left px-3 py-2 rounded-2xl text-[15px] transition-colors ${
                pathname === item.path
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Переключатель темы + PrivacyChip */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-1 bg-muted rounded-2xl p-1">
          <button
            onClick={() => handleThemeChange('light')}
            className={`flex-1 p-2 rounded-xl transition-colors ${
              theme === 'light' ? 'bg-card shadow-sm' : ''
            }`}
            title="Светлая"
          >
            <Sun className="h-4 w-4 mx-auto" />
          </button>
          <button
            onClick={() => handleThemeChange('system')}
            className={`flex-1 p-2 rounded-xl transition-colors ${
              theme === 'system' ? 'bg-card shadow-sm' : ''
            }`}
            title="Системная"
          >
            <Monitor className="h-4 w-4 mx-auto" />
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex-1 p-2 rounded-xl transition-colors ${
              theme === 'dark' ? 'bg-card shadow-sm' : ''
            }`}
            title="Тёмная"
          >
            <Moon className="h-4 w-4 mx-auto" />
          </button>
        </div>

        <PrivacyChip level={privacyLevel} />
      </div>
    </aside>
  );
}
