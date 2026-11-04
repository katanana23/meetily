// Заставка запуска: маскот, название и три точки на фоне темы. Она уже есть в
// HTML страницы (статическая выгрузка и сервер разработки отдают её сразу),
// поэтому вместо белого окна и полусобранного интерфейса (тема подписана наоборот,
// приватность «Неизвестно», пока скрипты грузятся) человек видит знак приложения.
// Уходит плавно, когда интерфейс ожил (после гидратации), но не раньше чем через
// MIN_MS, чтобы не мигать. prefers-reduced-motion: без покачивания и точек.
'use client';

import { useEffect, useState } from 'react';
import { BRAND_MARK_SRC } from './BrandMark';
import { t } from '@/aid/strings';

const MIN_MS = 450;
const FADE_MS = 260;

export function LaunchScreen() {
  const [state, setState] = useState<'shown' | 'leaving' | 'gone'>('shown');
  useEffect(() => {
    const start = (window as unknown as { __aidLaunchAt?: number }).__aidLaunchAt ?? performance.now();
    const wait = Math.max(0, MIN_MS - (performance.now() - start));
    const t1 = setTimeout(() => setState('leaving'), wait);
    const t2 = setTimeout(() => setState('gone'), wait + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  if (state === 'gone') return null;
  return (
    <div
      aria-hidden={state === 'leaving'}
      role="status"
      aria-label={t('launching')}
      data-tauri-drag-region
      className={`aid-launch fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background ${state === 'leaving' ? 'aid-launch-leave' : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
      <img src={BRAND_MARK_SRC} width={72} height={72} alt="" draggable={false} className="aid-launch-mark size-[72px]" />
      <p className="mt-5 text-[15px] font-semibold tracking-tight text-foreground">{t('appName')}</p>
      <span className="mt-4 flex gap-1.5" aria-hidden>
        <span className="aid-launch-dot size-1.5 rounded-full bg-muted-foreground" />
        <span className="aid-launch-dot size-1.5 rounded-full bg-muted-foreground [animation-delay:0.16s]" />
        <span className="aid-launch-dot size-1.5 rounded-full bg-muted-foreground [animation-delay:0.32s]" />
      </span>
    </div>
  );
}
