// Сайдбар ShadeNotes: лежит прямо на фоне окна, без плитки и рамки. Знак и
// название в полосе окна (TitleBar). Пункты навигации без подложек: активный
// пункт цветом текста, остальные серым; иконка на тихой монохромной подложке 28 px.
// Внизу приватность и тема такими же тихими строками.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearSix, Notebook } from '@phosphor-icons/react';
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

/** Строка сайдбара: 44 px, без подложки; наведение и активный пункт только цветом текста. */
export const SIDEBAR_ROW =
  'flex h-11 items-center gap-3 rounded-row px-2 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Запись идёт, а пользователь ушёл с главной: индикатор записи и путь обратно к «Остановить». */
function RecordingLink({ pathname }: { pathname: string }) {
  const rec = useRecordingState();
  if (!rec.isRecording || pathname === '/') return null;
  const seconds = rec.activeDuration ?? rec.recordingDuration ?? 0;
  return (
    <Link href="/" className={cn(SIDEBAR_ROW, 'text-foreground')}>
      <span className="flex size-5 items-center justify-center" aria-hidden>
        <span className={cn('size-2.5 rounded-full bg-record', !rec.isPaused && 'aid-dock-dot')} />
      </span>
      <span className="flex-1">{rec.isPaused ? t('paused') : t('recording')}</span>
      <span className="tabular text-sm text-muted-foreground">{formatTimer(seconds)}</span>
    </Link>
  );
}

export function AidSidebar() {
  const pathname = usePathname() ?? '/';
  const { privacy } = usePrivacy();

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col">
      <nav className="flex-1 space-y-0.5 px-1 pt-1" aria-label="Основная навигация">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(SIDEBAR_ROW, active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {/* Иконка на своей подложке 28 px со скруглением вложенного элемента, монохром */}
              <span
                className={cn('flex size-7 shrink-0 items-center justify-center rounded-nested transition-colors', active ? 'bg-foreground/15' : 'bg-foreground/[0.06]')}
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

      <div className="space-y-0.5 px-1 pb-1">
        <PrivacyChip privacy={privacy} />
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
