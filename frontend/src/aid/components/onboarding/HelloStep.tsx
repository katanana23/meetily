// Шаг 1 «Привет»: логотип проявляется из размытия, заголовок, три коротких обещания, «Начать».
'use client';

import { LockSimple, Sparkle, WifiSlash } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { t } from '@/aid/strings';

const LOGO_SRC = '/brand/shadenotes.svg';

export function HelloStep({ isMac, ready, onStart }: { isMac: boolean; ready: boolean; onStart: () => void }) {
  const points = [
    { icon: LockSimple, text: t('obHelloPrivate'), className: 'text-muted-foreground' },
    { icon: WifiSlash, text: t('obHelloOffline'), className: 'text-muted-foreground' },
    // Итоги делает ИИ: знак роли Indigo на нейтральной плитке
    { icon: Sparkle, text: t('obHelloAi'), className: 'text-indigo-ink' },
  ];
  return (
    <div className="flex flex-col">
      {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
      <img src={LOGO_SRC} width={72} height={72} alt={t('appName')} draggable={false} className="aid-ob-logo size-[72px]" />
      <h1 className="aid-ob-rise mt-6 text-[36px] font-bold leading-[40px] tracking-tight [--d:80ms]">
        {isMac ? t('obHelloTitleMac') : t('obHelloTitle')}
      </h1>
      <ul className="mt-6 flex flex-col gap-3">
        {points.map(({ icon: Icon, text, className }, i) => (
          <li
            key={text}
            className="aid-ob-rise flex items-center gap-3 text-[15px] leading-6"
            style={{ ['--d' as string]: `${160 + i * 60}ms` }}
          >
            <Icon className={`size-6 shrink-0 ${className}`} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      <Button size="main" className="aid-ob-rise mt-8 w-full [--d:360ms]" disabled={!ready} onClick={onStart}>
        {!ready && <Spinner size={20} tone="inherit" />}
        {t('obStart')}
      </Button>
    </div>
  );
}
