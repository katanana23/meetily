// Шаг 1: обложка с живым показом работы, под ней логотип, одна строка и «Начать».
// Показ (цикл 6 с, .aid-ob-demo-* в globals.css): кнопка «Записать» появляется и нажимается,
// превращается в капсулу с таймером, над ней по очереди появляются три реплики, затем их
// сменяют итоги Indigo; итоговый кадр стоит 1,7 с и плавно гаснет перед повтором.
// Реплики, капсула и итоги собраны в одну группу по оптическому центру обложки (около 65 %
// её высоты), без пустой середины. Загрузка моделей стартует уже на этом шаге (AidOnboarding).
// Полоски в капсуле украшение, а не уровень звука: его ядро во время записи не отдаёт.
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Microphone, Sparkle, Stop } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { t } from '@/aid/strings';
import { TITLE_CLASS, mainButtonClass } from './ui';

const LOGO_SRC = '/brand/shadenotes.svg';
/** Длина цикла показа, мс; как у анимаций .aid-ob-demo-* в globals.css. */
const CYCLE_MS = 6000;
/** Капсула появляется на 0,9–1,2 с: с этого момента идёт таймер. */
const TIMER_START_MS = 1000;
/** Капсула гаснет на 5 с: таймер дальше не идёт. */
const TIMER_STOP_MS = 5000;

// Вымышленный разговор для показа
const LINES: [string, string][] = [
  ['Анна', 'Бету выпускаем в пятницу'],
  ['Олег', 'Тексты подготовлю к четвергу'],
  ['Анна', 'Тогда созвон в понедельник'],
];

export function HelloStep({ ready, busy, onStart }: { ready: boolean; busy: boolean; onStart: () => void }) {
  return (
    <div className="flex flex-col">
      <DemoRecording />
      <div className="mt-8 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
        <img src={LOGO_SRC} width={48} height={48} alt={t('appName')} draggable={false} className="aid-ob-logo size-12 shrink-0" />
        <h1 className={`aid-ob-rise ${TITLE_CLASS} [--d:120ms]`}>{t('obHelloLine')}</h1>
      </div>
      <Button size="main" className={mainButtonClass(busy, 'aid-ob-rise mt-8 [--d:200ms]')} aria-busy={busy} disabled={!ready || busy} onClick={onStart}>
        {(busy || !ready) && <Spinner size={20} tone="inherit" />}
        {busy ? t('obOpening') : t('obStart')}
      </Button>
    </div>
  );
}

function SpeechBars({ count, className }: { count: number; className?: string }) {
  return (
    <span aria-hidden className={`flex items-center gap-1 ${className ?? ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="aid-ob-bar-wave h-full w-1 rounded-full bg-current" style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/** Секунды на таймере капсулы; без движения стоит итоговый кадр. */
function useDemoSeconds() {
  const [sec, setSec] = useState(4);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const phase = (performance.now() - t0) % CYCLE_MS;
      setSec(phase < TIMER_START_MS ? 0 : Math.min(Math.floor((Math.min(phase, TIMER_STOP_MS) - TIMER_START_MS) / 1000) + 1, 4));
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return sec;
}

/** Обложка с показом. Отступ внутри как у плитки (24 px), группа по оптическому центру. */
function DemoRecording() {
  const sec = useDemoSeconds();
  return (
    <div aria-hidden className="flex h-[256px] items-center justify-center rounded-nested bg-muted p-6">
      <div className="-mt-2 flex w-[72%] flex-col items-center gap-4">
        {/* Реплики, затем на их месте итоги */}
        <div className="relative h-[96px] w-full">
          <div className="flex flex-col gap-2">
            {LINES.map(([who, text], i) => (
              <p key={text} className={`aid-ob-demo-l${i + 1} truncate text-[15px] leading-6`}>
                <span className="font-semibold">{who}.</span> <span className="text-muted-foreground">{text}</span>
              </p>
            ))}
          </div>
          <div className="aid-ob-demo-sum aid-role aid-role-indigo absolute inset-0 flex flex-col justify-center rounded-[12px] px-4">
            <p className="flex items-center gap-2 text-[15px] font-bold leading-6">
              <Sparkle className="size-5" />
              {t('obDemoSummary')}
            </p>
            <p className="mt-1 text-balance text-[13px] leading-5">{t('obDemoSummaryText')}</p>
          </div>
        </div>
        {/* Кнопка «Записать» и капсула на одном месте */}
        <div className="relative flex h-14 w-full items-center justify-center">
          <div className="aid-ob-demo-cap flex h-14 items-center gap-3 rounded-full bg-card pl-4 pr-2.5 shadow-sm">
            <span className="size-2.5 rounded-full bg-record" />
            <span className="w-12 text-[17px] font-bold tabular-nums">00:0{sec}</span>
            <SpeechBars count={6} className="h-5 text-foreground/45" />
            <span className="ml-1 flex size-9 items-center justify-center rounded-full bg-record text-white">
              <Stop className="size-4" />
            </span>
          </div>
          <span className="aid-ob-demo-rec absolute flex size-14 items-center justify-center rounded-full bg-primary text-on-role">
            <Microphone className="size-6" />
          </span>
        </div>
      </div>
    </div>
  );
}
