// Сайдбар Aid: название, навигация, тема и индикатор приватности.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessagesSquare, Settings } from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PrivacyChip } from './PrivacyChip';
import { usePrivacy } from '@/aid/lib/privacy';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const NAV = [
  { label: t('navMeetings'), href: '/', icon: MessagesSquare, match: (p: string) => p === '/' || p.startsWith('/meeting-details') },
  { label: t('navSettings'), href: '/settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

export function AidSidebar() {
  const pathname = usePathname() ?? '/';
  const { privacy } = usePrivacy();

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
          A
        </span>
        <span className="text-[15px] font-semibold">{t('appName')}</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Основная навигация">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className={cn('size-[18px]', active && 'text-primary')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <div className="px-3 py-1">
          <PrivacyChip privacy={privacy} />
        </div>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
