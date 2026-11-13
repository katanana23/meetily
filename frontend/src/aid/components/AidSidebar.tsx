// Сайдбар ShadeNotes: узкая плитка 72 px. Сверху знак ShadeNotes: логотип 48 px,
// по 12 px от краёв, ведёт к списку встреч (вкладка одна, отдельного пункта
// «Встречи» нет). Пока идёт запись, а человек ушёл со списка, ниже кнопка с красной
// точкой записи: путь к «Остановить». Внизу «Настройки» (выбранный раздел тёмно-серой
// таблеткой, --nav-active), «Локально» и переключатель темы таблеткой.
//
// Кнопки окна macOS стоят в отдельной полосе окна над плитками (WindowBar), поэтому
// своего места под них в сайдбаре нет.
'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { GearSix } from '@phosphor-icons/react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { BRAND_MARK_SRC } from './BrandMark';
import { PrivacyChip } from './PrivacyChip';
import { Skeleton } from './ui/skeleton';
import { markTitlebarOverlay } from '@/aid/lib/window-theme';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { usePrivacy } from '@/aid/lib/privacy';
import { formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useRecordingControls } from '@/aid/lib/recording-controls';

type NavItem = { label: string; href: string; icon: typeof GearSix; match: (p: string) => boolean };

const SETTINGS: NavItem = { label: t('navSettings'), href: '/settings', icon: GearSix, match: (p) => p.startsWith('/settings') };

/** Раздел сайдбара: выбранный тёмно-серой таблеткой, остальные серой иконкой. */
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            SIDEBAR_BUTTON,
            active ? 'bg-nav-active text-nav-active-foreground' : 'aid-icon-btn-ghost text-muted-foreground',
          )}
        >
          <Icon className="size-6" aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/** «Настройки»: открываются на главной по ?view=settings (in-place-router.tsx), выбранность по параметру. */
function SettingsNav({ pathname }: { pathname: string }) {
  const params = useSearchParams();
  return <NavLink item={SETTINGS} pathname={params.get('view') === 'settings' ? '/settings' : pathname} />;
}

/** Круглая кнопка сайдбара 48 px. */
export const SIDEBAR_BUTTON =
  'flex size-12 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Запись идёт, а пользователь ушёл с главной: кнопка с красной точкой записи ведёт к «Остановить». */
function RecordingLink({ pathname }: { pathname: string }) {
  const rec = useRecordingState();
  if (!rec.isRecording || pathname === '/') return null;
  const seconds = rec.activeDuration ?? rec.recordingDuration ?? 0;
  const label = `${rec.isPaused ? t('paused') : t('recording')}, ${formatTimer(seconds)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href="/" aria-label={label} className={cn(SIDEBAR_BUTTON, 'aid-icon-btn')}>
          <span className={cn('size-3 rounded-full', rec.isPaused ? 'bg-foreground/40' : 'aid-dock-dot aid-record-dot')} aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Знак ShadeNotes: логотип, ведёт к списку встреч (и с экрана записи, и со встречи). */
function BrandLink() {
  const c = useRecordingControls();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/"
          aria-label={`${t('appName')}: ${t('navMeetings')}`}
          onClick={() => c.setView('list')}
          // 48 px, как остальные кнопки сайдбара: по 12 px от краёв (72 px) и сверху; радиус 12 = 24 у сайдбара минус 12 (концентрично)
          className="block size-12 overflow-hidden rounded-[12px] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
          <img src={BRAND_MARK_SRC} width={48} height={48} alt="" draggable={false} className="size-12" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{t('navMeetings')}</TooltipContent>
    </Tooltip>
  );
}

export function AidSidebar() {
  const pathname = usePathname() ?? '/';
  const { privacy, loading: privacyLoading } = usePrivacy();
  // Страховка к скрипту в <head> (theme.ts): класс полосы окна macOS (WindowBar)
  useEffect(() => markTitlebarOverlay(), []);

  return (
    <aside className="flex h-full w-[72px] shrink-0 flex-col items-center rounded-tile bg-card py-3">
      <nav className="flex flex-1 flex-col items-center gap-2" aria-label="Основная навигация">
        <BrandLink />
        <RecordingLink pathname={pathname} />
        {/* Настройки внизу, над приватностью */}
        <div className="mt-auto">
          {/* useSearchParams в статической выгрузке требует границу Suspense */}
          <Suspense fallback={<NavLink item={SETTINGS} pathname={pathname} />}>
            <SettingsNav pathname={pathname} />
          </Suspense>
        </div>
      </nav>

      <div className="mt-3 flex flex-col items-center gap-3">
        {/* Пока провайдеры не прочитаны, не «Неизвестно», а скелетон знака */}
        {privacyLoading ? <Skeleton className="size-12 rounded-full" /> : <PrivacyChip privacy={privacy} compact />}
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
