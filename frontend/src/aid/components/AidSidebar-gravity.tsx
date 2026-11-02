// Sidebar Aid Meetings — Gravity UI version.
// Использует компоненты Gravity UI вместо custom Tailwind.

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Button, Text, Icon } from '@gravity-ui/uikit';
import { FileText, Gear, Sun, Moon, Display } from '@gravity-ui/icons';
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
    { label: 'Настройки', path: '/settings', icon: Gear },
  ];

  return (
    <aside
      className="flex flex-col h-screen shrink-0"
      style={{
        width: '220px',
        backgroundColor: 'var(--g-color-base-background)',
        borderRight: '1px solid var(--g-color-line-generic)',
      }}
    >
      {/* Шапка */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: '1px solid var(--g-color-line-generic)' }}
      >
        <Text variant="subheader-3">Aid Meetings</Text>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Button
                key={item.path}
                view={isActive ? 'flat-secondary' : 'flat'}
                size="l"
                width="max"
                onClick={() => router.push(item.path)}
                selected={isActive}
                style={{ justifyContent: 'flex-start' }}
              >
                <Icon data={ItemIcon} size={16} />
                <Text variant="body-2">{item.label}</Text>
              </Button>
            );
          })}
        </div>
      </nav>

      {/* Переключатель темы + статус */}
      <div
        className="p-3 space-y-2"
        style={{ borderTop: '1px solid var(--g-color-line-generic)' }}
      >
        {/* Theme switcher */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--g-color-base-simple-hover)' }}
        >
          <Button
            view={theme === 'light' ? 'flat-secondary' : 'flat'}
            size="s"
            onClick={() => handleThemeChange('light')}
            title="Светлая"
            style={{ flex: 1 }}
          >
            <Icon data={Sun} size={16} />
          </Button>
          <Button
            view={theme === 'system' ? 'flat-secondary' : 'flat'}
            size="s"
            onClick={() => handleThemeChange('system')}
            title="Системная"
            style={{ flex: 1 }}
          >
            <Icon data={Display} size={16} />
          </Button>
          <Button
            view={theme === 'dark' ? 'flat-secondary' : 'flat'}
            size="s"
            onClick={() => handleThemeChange('dark')}
            title="Тёмная"
            style={{ flex: 1 }}
          >
            <Icon data={Moon} size={16} />
          </Button>
        </div>

        <PrivacyChip level={privacyLevel} />
      </div>
    </aside>
  );
}
