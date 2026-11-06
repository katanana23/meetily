// Шаг 1: живой показ работы и «Начать». Одна плитка: показ (цикл 6 с: кнопка «Записать»
// нажимается и превращается в капсулу с таймером, по ходу разговора появляются строки
// текста, затем раскрываются итоги Indigo), под ним логотип, одна строка и «Начать».
// Загрузка моделей стартует уже на этом шаге (AidOnboarding). Полоски в капсуле украшение,
// а не уровень звука: его ядро во время записи не отдаёт.
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Microphone, Sparkle, Stop } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const LOGO_SRC = '/brand/shadenotes.svg';
/** Длина цикла показа, мс; как у анимаций .aid-ob-demo-* в globals.css. */
const CYCLE_MS = 6000;
/** Капсула появляется на 15 % цикла: с этого момента идёт таймер. */
const TIMER_START_MS = 900;

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
      <div className="mt-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
        <img src={LOGO_SRC} width={48} height={48} alt={t('appName')} draggable={false} className="aid-ob-logo size-12 shrink-0" />
        <h1 className="aid-ob-rise text-[22px] font-bold leading-7 [--d:120ms]">{t('obHelloLine')}</h1>
      </div>
      <Button
        size="main"
        className={cn('aid-ob-rise mt-6 w-full [--d:200ms]', busy && 'disabled:opacity-100')}
        aria-busy={busy}
        disabled={!ready || busy}
        onClick={onStart}
      >
        {(busy || !ready) && <Spinner size={20} tone="inherit" />}
        {busy ? t('obOpening') : t('obStart')}
      </Button>
    </div>
  );
}

/** Полоски речи: бегущая волна (scaleY). Украшение витрины, а не уровень звука: его ядро не отдаёт. */
function SpeechBars({ count = 9, className }: { count?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-8 items-center gap-1', className)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="aid-ob-bar-wave h-full w-1.5 rounded-full bg-current" style={{ '--i': i } as CSSProperties} />
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
      setSec(phase < TIMER_START_MS ? 0 : Math.min(4, Math.floor((phase - TIMER_START_MS) / 1000) + 1));
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return sec;
}

/** Видеоряд: запись → текст → итоги. Только transform, opacity и filter. */
function DemoRecording() {
  const sec = useDemoSeconds();
  return (
    <div aria-hidden className="relative h-[280px] overflow-hidden rounded-nested bg-muted">
      <div className="absolute inset-x-5 top-5 flex flex-col gap-2.5">
        {LINES.map(([who, text], i) => (
          <p key={text} className={`aid-ob-demo-l${i + 1} text-[15px] leading-6`}>
            <span className="font-semibold">{who}.</span> <span className="text-muted-foreground">{text}</span>
          </p>
        ))}
      </div>
      <div className="aid-ob-demo-sum aid-role aid-role-indigo absolute inset-x-5 bottom-[84px] rounded-nested p-4">
        <p className="flex items-center gap-2 text-[15px] font-bold leading-6">
          <Sparkle className="size-5" />
          {t('obDemoSummary')}
        </p>
        <p className="mt-1 text-[13px] leading-5">{t('obDemoSummaryText')}</p>
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <div className="aid-ob-demo-cap flex h-14 items-center gap-3 rounded-full bg-card px-4 shadow-sm">
          <span className="size-2.5 rounded-full bg-record" />
          <span className="w-12 text-[17px] font-bold tabular-nums">00:0{sec}</span>
          <SpeechBars count={6} className="h-5 text-foreground/50" />
          <span className="flex size-9 items-center justify-center rounded-full bg-record text-white">
            <Stop className="size-4" />
          </span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <span className="aid-ob-demo-rec flex size-14 items-center justify-center rounded-full bg-primary text-on-role">
          <Microphone className="size-6" />
        </span>
      </div>
    </div>
  );
}
