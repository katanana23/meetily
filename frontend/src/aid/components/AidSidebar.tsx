// Сайдбар Aid: минимальный, только переключатель темы, список встреч и кнопка настроек.
// Стекло, без развёрнутого/свёрнутого режима.

'use client';

import { useRouter } from 'next/navigation';
import { Settings, Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { t } from '@/aid/strings';
import { formatDate } from '@/aid/lib/format';
import { useState, useEffect } from 'react';
import { getStoredTheme, setStoredTheme, applyTheme, type ThemeMode } from '@/aid/lib/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AidSidebar() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const [theme, setTheme] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);

    // Слушать системную тему
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

  const themeIcon = theme === 'light' ? <Sun className="h-4 w-4" /> : theme === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;

  return (
    <aside className="w-64 glass flex flex-col h-screen shrink-0">
      {/* Шапка */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{t('appName')}</h2>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {themeIcon}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleThemeChange('light')}>
                  <Sun className="h-4 w-4 mr-2" />
                  Светлая
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
                  <Moon className="h-4 w-4 mr-2" />
                  Тёмная
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('system')}>
                  <Monitor className="h-4 w-4 mr-2" />
                  Системная
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push('/settings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Список встреч */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <div className="space-y-1">
          {meetings.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('noMeetings')}
            </div>
          ) : (
            meetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors space-y-1"
              >
                <p className="font-medium text-sm line-clamp-2 leading-snug">{meeting.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate((meeting as any).created_at || '')}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
