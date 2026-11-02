// Сайдбар Aid: компактный, системный, 220px

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Settings, Moon, Sun, Monitor, FileText } from 'lucide-react';
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
    { label: 'Встречи', path: '/', icon: FileText },
    { label: 'Настройки', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-[220px] bg-card border-r border-border flex flex-col h-screen shrink-0">
      {/* Шапка */}
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">Aid Meetings</h2>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  pathname === item.path
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Переключатель темы + статус */}
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => handleThemeChange('light')}
            className={`flex-1 p-1.5 rounded transition-colors ${
              theme === 'light' ? 'bg-card shadow-sm' : ''
            }`}
            title="Светлая"
          >
            <Sun className="h-4 w-4 mx-auto" />
          </button>
          <button
            onClick={() => handleThemeChange('system')}
            className={`flex-1 p-1.5 rounded transition-colors ${
              theme === 'system' ? 'bg-card shadow-sm' : ''
            }`}
            title="Системная"
          >
            <Monitor className="h-4 w-4 mx-auto" />
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex-1 p-1.5 rounded transition-colors ${
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
