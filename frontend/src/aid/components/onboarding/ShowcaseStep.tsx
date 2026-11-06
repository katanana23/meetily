// Экран 1, витрина с живым показом. Главная плитка: видеоряд работы приложения (цикл 6 с):
// кнопка «Записать» нажимается и превращается в капсулу с таймером, по ходу разговора
// появляются строки текста, затем раскрываются итоги Indigo. Под показом три плитки-подписи
// «1 Записывает», «2 Пишет текст», «3 Итоги от ИИ»: в такт видеоряду подсвечивается та,
// что сейчас происходит на показе (тон её роли под текстом). Внизу лаймовая плитка-кнопка «Начать».
// Правило двух цветных плиток: цветная только «Начать»; Indigo внутри показа вложенный.
// Полоски в капсуле и на плитке «Записывает» украшение, а не уровень звука.
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Microphone, Sparkle, Stop, TextAlignLeft, type Icon } from '@phosphor-icons/react';
import { t } from '@/aid/strings';
import { SpeechBars, TileButton, riseDelay } from './parts';

const LOGO_SRC = '/brand/shadenotes.svg';
/** Длина цикла показа, мс; как у анимаций .aid-ob-demo-* и .aid-ob-legend-* в globals.css. */
const CYCLE_MS = 6000;
/** Капсула появляется на 15 % цикла: с этого момента идёт таймер. */
const TIMER_START_MS = 900;

// Вымышленный разговор для показа
const LINES: [string, string][] = [
  ['Анна', 'Бету выпускаем в пятницу'],
  ['Олег', 'Тексты подготовлю к четвергу'],
  ['Анна', 'Тогда созвон в понедельник'],
];

export function ShowcaseStep({ isMac, ready, busy, onStart }: { isMac: boolean; ready: boolean; busy: boolean; onStart: () => void }) {
  const legend: { icon: Icon; title: string; hint: string; iconClass: string; tint: string; extra?: ReactNode }[] = [
    {
      icon: Microphone,
      title: t('obValueRecord'),
      hint: t('obValueRecordHint'),
      iconClass: 'text-primary-ink',
      tint: 'bg-primary',
      extra: <SpeechBars count={7} className="ml-auto h-6 text-[hsl(var(--primary-edge))]" />,
    },
    { icon: TextAlignLeft, title: t('obValueText'), hint: t('obValueTextHint'), iconClass: 'text-foreground', tint: 'bg-foreground' },
    { icon: Sparkle, title: t('obValueAi'), hint: t('obValueAiHint'), iconClass: 'text-indigo-ink', tint: 'bg-indigo' },
  ];

  return (
    <div className="grid grid-cols-6 gap-2">
      <section
        className="aid-ob-rise col-span-6 grid gap-5 rounded-tile bg-card p-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        style={riseDelay(0)}
      >
        <div className="flex min-w-0 flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений */}
          <img src={LOGO_SRC} width={48} height={48} alt={t('appName')} draggable={false} className="aid-ob-logo size-12" />
          <h1 className="mt-auto pt-6 text-[36px] font-bold leading-[40px] tracking-tight">{isMac ? t('obHelloTitleMac') : t('obHelloTitle')}</h1>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{isMac ? t('obShowcaseHintMac') : t('obShowcaseHint')}</p>
        </div>
        <DemoRecording />
      </section>

      {legend.map(({ icon: IconComponent, title, hint, iconClass, tint, extra }, i) => (
        <section
          key={title}
          className="aid-ob-rise relative col-span-6 overflow-hidden rounded-tile bg-card p-5 sm:col-span-2"
          style={riseDelay(90 + i * 60)}
        >
          {/* Подсветка в такт показу: тон роли проявляется под текстом (opacity), текст не бледнеет */}
          <span aria-hidden className={`aid-ob-legend-${i + 1} absolute inset-0 ${tint}`} />
          <div className="relative">
            <div className="flex items-center gap-3">
              <IconComponent className={`size-6 shrink-0 ${iconClass}`} aria-hidden />
              {extra}
              <span className="ml-auto text-[13px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
            </div>
            <p className="mt-4 text-[15px] font-semibold leading-6">{title}</p>
            <p className="text-[13px] leading-5 text-muted-foreground">{hint}</p>
          </div>
        </section>
      ))}

      <TileButton className="aid-ob-rise col-span-6" style={riseDelay(280)} disabled={!ready} busy={busy} onClick={onStart}>
        {t('obStart')}
      </TileButton>
    </div>
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
    <div aria-hidden className="relative h-[264px] min-w-0 overflow-hidden rounded-nested bg-muted">
      <div className="absolute inset-x-4 top-4 flex flex-col gap-2">
        {LINES.map(([who, text], i) => (
          <p key={text} className={`aid-ob-demo-l${i + 1} text-[13px] leading-5`}>
            <span className="font-semibold">{who}.</span> <span className="text-muted-foreground">{text}</span>
          </p>
        ))}
      </div>
      <div className="aid-ob-demo-sum aid-role aid-role-indigo absolute inset-x-4 bottom-[80px] rounded-nested p-4">
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
