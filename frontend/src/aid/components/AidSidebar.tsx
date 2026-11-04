// Сайдбар ShadeNotes: узкая плитка 72 px. Только иконки Phosphor fill в круглых
// кнопках 48 px с подсказками; выбранный раздел Risd (роль «выделение»). Пока идёт
// запись, а человек ушёл с главной, ниже кнопка Mikado с точкой записи: путь к
// «Остановить». Внизу приватность, знак ShadeNotes и переключатель темы таблеткой.
//
// Кнопки окна macOS (titleBarStyle Overlay, trafficLightPosition x 18, y 22 в
// tauri.conf.json) стоят в верхней части этой плитки: плитка начинается с x 8,
// кнопки занимают x 18–70, ровно по её центру. В Tauri на macOS (класс
// aid-titlebar-overlay) сверху оставлено место 36 px; верх плитки перетаскивает окно.
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearSix, Notebook } from '@phosphor-icons/react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { BrandMark } from './BrandMark';
import { PrivacyChip } from './PrivacyChip';
import { Skeleton } from './ui/skeleton';
import { markTitlebarOverlay } from '@/aid/lib/window-theme';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { usePrivacy } from '@/aid/lib/privacy';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useRecordingState } from '@/contexts/RecordingStateContext';

const NAV = [
  { label: t('navMeetings'), href: '/', icon: Notebook, match: (p: string) => p === '/' || p.startsWith('/meeting-details') },
  { label: t('navSettings'), href: '/settings', icon: GearSix, match: (p: string) => p.startsWith('/settings') },
];

/** Круглая кнопка сайдбара 48 px. */
export const SIDEBAR_BUTTON =
  'flex size-12 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Запись идёт, а пользователь ушёл с главной: кнопка Mikado с точкой записи ведёт к «Остановить». */
function RecordingLink({ pathname }: { pathname: string }) {
  const rec = useRecordingState();
  if (!rec.isRecording || pathname === '/') return null;
  const seconds = rec.activeDuration ?? rec.recordingDuration ?? 0;
  const label = `${rec.isPaused ? t('paused') : t('recording')}, ${formatTimer(seconds)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href="/" aria-label={label} className={cn(SIDEBAR_BUTTON, 'aid-role aid-role-mikado')}>
          <span className={cn('size-3 rounded-full bg-record', !rec.isPaused && 'aid-dock-dot')} aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AidSidebar() {
  const pathname = usePathname() ?? '/';
  const { privacy, loading: privacyLoading } = usePrivacy();
  // Страховка к скрипту в <head> (theme.ts): класс места под кнопки окна macOS
  useEffect(() => markTitlebarOverlay(), []);

  return (
    <aside className="flex h-full w-[72px] shrink-0 flex-col items-center rounded-tile bg-card py-3">
      {/* Место под кнопки окна macOS: только в Tauri на macOS */}
      <div data-tauri-drag-region className="hidden h-9 w-full shrink-0 [.aid-titlebar-overlay_&]:block" />

      <nav className="flex flex-1 flex-col items-center gap-2" aria-label="Основная навигация">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    SIDEBAR_BUTTON,
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        <RecordingLink pathname={pathname} />
      </nav>

      <div className="flex flex-col items-center gap-3">
        {/* Пока провайдеры не прочитаны, не «Неизвестно», а скелетон знака */}
        {privacyLoading ? <Skeleton className="size-12 rounded-full" /> : <PrivacyChip privacy={privacy} compact />}
        <span className="flex size-12 items-center justify-center" title={t('appName')}>
          <BrandMark size={28} />
          <span className="sr-only">{t('appName')}</span>
        </span>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
