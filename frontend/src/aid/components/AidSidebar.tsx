// Сайдбар Aid: навигация, идущая запись, тема и индикатор приватности.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearSix, Notebook, Record } from '@phosphor-icons/react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PrivacyChip } from './PrivacyChip';
import { usePrivacy } from '@/aid/lib/privacy';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useRecordingState } from '@/contexts/RecordingStateContext';

const NAV = [
  { label: t('navMeetings'), href: '/', icon: Notebook, match: (p: string) => p === '/' || p.startsWith('/meeting-details') },
  { label: t('navSettings'), href: '/settings', icon: GearSix, match: (p: string) => p.startsWith('/settings') },
];

const ITEM =
  'flex h-11 items-center gap-3 rounded-nested px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Запись идёт, а пользователь ушёл с главной: напоминание и путь обратно к кнопке «Остановить». */
function RecordingLink({ pathname }: { pathname: string }) {
  const rec = useRecordingState();
  if (!rec.isRecording || pathname === '/') return null;
  const seconds = rec.activeDuration ?? rec.recordingDuration ?? 0;
  return (
    <Link href="/" className={cn(ITEM, 'bg-destructive/10 text-foreground hover:bg-destructive/15')}>
      <Record className={cn('size-5 text-destructive', !rec.isPaused && 'motion-safe:animate-pulse')} aria-hidden />
      <span className="flex-1">{rec.isPaused ? t('paused') : t('recording')}</span>
      <span className="tabular text-muted-foreground">{formatTimer(seconds)}</span>
    </Link>
  );
}

export function AidSidebar() {
  const pathname = usePathname() ?? '/';
  const { privacy } = usePrivacy();

  return (
    // Плитка бенто: на тон светлее фона, радиус --tile-radius (rounded-tile), без рамки
    <aside className="flex h-full w-[232px] shrink-0 flex-col rounded-tile bg-card">
      {/* Знак, название и кнопки окна теперь в верхней полосе окна (TitleBar) */}
      <nav className="flex-1 space-y-1 p-2" aria-label="Основная навигация">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(ITEM, active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
            >
              {/* Иконка на своей подложке бенто: плитка 28 px со скруглением вложенного элемента */}
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-nested transition-colors',
                  active ? 'bg-primary/15 text-primary-ink' : 'bg-foreground/[0.06]',
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
        <RecordingLink pathname={pathname} />
      </nav>

      <div className="space-y-2 p-2">
        <div className="px-3 py-1">
          <PrivacyChip privacy={privacy} />
        </div>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
