// Экран после «Остановить»: одна плитка по центру, как первый запуск. Главное на экране
// обложка: она показывает настоящий процесс, сцены меняются по статусу записи, а не по таймеру.
// - stopped («Запись остановлена», статус STOPPING): волна речи этой встречи (по сигналам
//   детектора речи за последние минуты) плавно успокаивается и сходит в ровную линию;
// - transcribing (PROCESSING_TRANSCRIPTS): последние 2–3 настоящие реплики встречи без
//   галлюцинаций; в них по очереди подсвечиваются сроки, даты и имена тоном Indigo (роль ИИ,
//   намёк на итоги); без реплик нейтральная сцена без текста;
// - saving (SAVING): реплики гаснут, карточка сворачивается в «шапку встречи»: название и факты;
// - saved (COMPLETED): галочка; дальше карточка перетекает в шапку страницы встречи
//   (view-transition-name aid-meeting, переход в lib/in-place-router.tsx).
// Если шаг длится долго, сцена дышит: медленная пульсация линии, мягкий курсор. Ролика по
// кругу и выдуманных процентов нет. Под обложкой заголовок шага, факты встречи (числа
// считаются вверх) и шаги в одну строку: текущий на тон-подложке со спиннером, готовые
// с галочкой. Только transform, opacity и filter; «уменьшить движение»: статичный кадр
// текущей стадии (globals.css, .aid-fin-*).
'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import type { Segment } from '@/aid/lib/meeting';
import { countWords, isHallucination } from '@/aid/lib/speech';
import { formatNumber, formatTimer } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

export type FinishStage = 'stopped' | 'transcribing' | 'saving' | 'saved' | 'discarded';

const STEPS = ['finishStepStop', 'finishStepTranscribe', 'finishStepSave'] as const;
/** Сколько шагов готово на каждой стадии; текущий следующий за ними. */
const DONE: Record<FinishStage, number> = { stopped: 0, transcribing: 1, saving: 2, saved: 3, discarded: 1 };
const COPY: Record<Exclude<FinishStage, 'discarded'>, { title: string; hint: string }> = {
  stopped: { title: t('finishTranscribing'), hint: t('finishStoppedHint') },
  transcribing: { title: t('finishStepTranscribe'), hint: t('finishTranscribingHint') },
  saving: { title: t('saving'), hint: t('savingHint') },
  saved: { title: t('saved'), hint: t('savedHint') },
};
/** Полос в волне: вся запись делится на столько отрезков. */
const WAVE_BARS = 48;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  stage: FinishStage;
  /** Для «Тишина» и «Пара фраз»: заголовок и подсказка решения. */
  discardCopy?: { title: string; hint: string };
  title: string | null;
  durationSec: number;
  segments: Segment[];
  /** Секунды записи, когда слышали речь (LiveSpeech.speechTimes): волна этой встречи. */
  speechTimes: number[];
}

const ORDER: FinishStage[] = ['stopped', 'transcribing', 'saving', 'saved'];
/** Сколько держать сцену, прежде чем показать следующую: успеть увидеть её движение. */
const MIN_SCENE_MS: Partial<Record<FinishStage, number>> = { stopped: 1400, transcribing: 1600, saving: 1000 };

/**
 * Сцена идёт строго за статусом записи, по порядку и без пропусков: если ядро проскочило
 * стадию быстрее, чем её видно (на быстрой машине «Запись остановлена» длится доли секунды),
 * сцена держится не меньше MIN_SCENE_MS. Ничего не выдумываем: показываем только стадии,
 * которые уже были, с небольшой задержкой. «Не сохраняем» показывается сразу.
 */
function useSceneStage(stage: FinishStage): FinishStage {
  // Начинаем с текущей стадии: экран, открытый посреди сохранения, не проигрывает прошлые сцены
  const [shown, setShown] = useState<FinishStage>(stage);
  // С какого момента видна текущая сцена: смена статуса не перезапускает отсчёт
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [shown]);
  useEffect(() => {
    if (stage === 'discarded') {
      setShown('discarded');
      return;
    }
    const at = ORDER.indexOf(shown);
    const target = ORDER.indexOf(stage);
    if (at < 0 || target <= at) return;
    const wait = reducedMotion() ? 0 : Math.max(0, (MIN_SCENE_MS[shown] ?? 0) - (performance.now() - since.current));
    const id = window.setTimeout(() => setShown(ORDER[at + 1]), wait);
    return () => window.clearTimeout(id);
  }, [stage, shown]);
  return shown;
}

export function FinishingScreen({ stage: actual, discardCopy, title, durationSec: rawDuration, segments, speechTimes }: Props) {
  const stage = useSceneStage(actual);
  // Целые секунды: карточка и факты показывают одно и то же число
  const durationSec = Math.floor(rawDuration);
  const copy = stage === 'discarded' ? discardCopy ?? { title: t('discardedNoSpeech'), hint: t('discardedNoSpeechHint') } : COPY[stage];
  const lines = useMemo(() => segments.filter((s) => s.text.trim() && !isHallucination(s.text)), [segments]);
  const words = useMemo(() => countWords(lines.map((s) => s.text).join(' ')), [lines]);

  return (
    <section role="status" aria-live="polite" className="m-auto w-full max-w-[640px] py-5">
      <div className="w-full">
        <Cover stage={stage} title={title} lines={lines.slice(-3)} speechTimes={speechTimes} durationSec={durationSec} words={words} replies={lines.length} />
        <h1 className="mt-6 text-balance text-[22px] font-bold leading-7">{copy.title}</h1>
        <p className="mt-2 max-w-[52ch] text-pretty text-[15px] leading-6 text-muted-foreground">{copy.hint}</p>
        <dl className="mt-6 grid grid-cols-3 gap-2">
          <Fact label={t('metaDuration')} value={durationSec} format={(n) => formatTimer(n)} />
          <Fact label={t('pulseWords')} value={words} format={formatNumber} delay={80} />
          <Fact label={t('pulseReplies')} value={lines.length} format={formatNumber} delay={160} />
        </dl>
        {stage !== 'discarded' && (
          <ol className="mt-6 flex gap-1" aria-label={t('finishSteps')}>
            {STEPS.map((key, i) => {
              const state = i < DONE[stage] ? 'done' : i === DONE[stage] ? 'current' : 'pending';
              return (
                <li
                  key={key}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[15px] leading-6 transition-colors',
                    // Текущий шаг тоном-подложкой и спиннером; лайм только у галочки
                    state === 'current' ? 'bg-muted font-medium' : state === 'done' ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  <span className="flex size-5 items-center justify-center" aria-hidden>
                    {state === 'done' ? (
                      <Check weight="bold" className="aid-ob-pop size-5 text-primary-ink" />
                    ) : state === 'current' ? (
                      <Spinner size={16} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-foreground/30" />
                    )}
                  </span>
                  {t(key)}
                  <span className="sr-only">{state === 'done' ? `, ${t('stepDone')}` : state === 'current' ? `, ${t('stepCurrent')}` : ''}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/** Число считается вверх при появлении: 500 мс ease-out; без движения сразу итог. */
function useCountUp(target: number, delay = 0) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start = 0;
    const from = 0;
    const tick = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / 500));
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delay]);
  return value;
}

function Fact({ label, value, format, delay = 0 }: { label: string; value: number; format: (n: number) => string; delay?: number }) {
  const shown = useCountUp(value, delay);
  return (
    <div className="aid-ob-rise rounded-nested bg-muted px-4 py-3" style={{ '--d': `${delay}ms` } as CSSProperties}>
      {/* Без иконок: залитые часы и облачко реплики в 16 px читаются плашками */}
      <dt className="text-[13px] font-medium leading-5 text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 text-[22px] font-bold leading-7">{format(shown)}</dd>
    </div>
  );
}

// ─── Обложка ───

function Cover({
  stage,
  title,
  lines,
  speechTimes,
  durationSec,
  words,
  replies,
}: {
  stage: FinishStage;
  title: string | null;
  lines: Segment[];
  speechTimes: number[];
  durationSec: number;
  words: number;
  replies: number;
}) {
  const scene = stage === 'discarded' ? 'stopped' : stage;
  // Сохраняю и сохранено: карточка сворачивается до шапки встречи (название и факты)
  const folded = scene === 'saving' || scene === 'saved';
  return (
    <div aria-hidden className="flex aspect-[2/1] items-center justify-center rounded-nested bg-muted p-5">
      {/* Карточка около 70 % площади обложки, чуть выше центра. При переходе к встрече перетекает в её шапку (globals.css, data-morph) */}
      <div
        data-scene={scene}
        className={cn('aid-fin-card -mt-1 flex w-[88%] flex-col rounded-[16px] bg-card p-4 shadow-sm', folded ? 'h-auto' : 'h-[86%]')}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6">{title || t('recording')}</p>
          {stage === 'saved' ? (
            <Check weight="bold" className="aid-ob-pop size-5 shrink-0 text-primary-ink" />
          ) : (
            <span className="tabular shrink-0 text-[13px] font-medium leading-5 text-muted-foreground">{formatTimer(durationSec)}</span>
          )}
        </div>
        <div className={cn('relative min-h-0', folded ? 'mt-4' : 'mt-3 flex-1')}>
          {scene === 'stopped' && <Wave speechTimes={speechTimes} durationSec={durationSec} />}
          {scene === 'transcribing' && (lines.length ? <Replies lines={lines} /> : <Wave speechTimes={[]} durationSec={durationSec} />)}
          {(scene === 'saving' || scene === 'saved') && <Folded durationSec={durationSec} words={words} replies={replies} />}
        </div>
      </div>
    </div>
  );
}

/** Волна речи этой встречи сходит в ровную линию, потом спокойно дышит. */
function Wave({ speechTimes, durationSec }: { speechTimes: number[]; durationSec: number }) {
  const bars = useMemo(() => {
    // Полосы делят всю запись (короткую тоже) на WAVE_BARS отрезков; высота: была ли речь
    // рядом с отрезком (сигналы детектора приходят с точностью до секунды)
    const span = Math.max(durationSec, 1) / WAVE_BARS;
    return Array.from({ length: WAVE_BARS }, (_, i) => {
      const from = i * span - 1;
      const to = (i + 1) * span + 1;
      const n = speechTimes.filter((x) => x >= from && x < to).length / Math.max(1, span + 2);
      // Тишина тоже видна: низкая полоса; речь выше
      return 0.18 + Math.min(1, n * 1.5) * 0.82;
    });
  }, [speechTimes, durationSec]);
  return (
    <div className="aid-fin-wave relative flex h-full items-center justify-between gap-[3px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="aid-fin-bar h-full max-w-[6px] flex-1 rounded-full bg-foreground/70"
          style={{ '--h': h, '--i': i } as CSSProperties}
        />
      ))}
      {/* Полосы сходят на нет и сливаются в сплошную ровную линию, она и дышит */}
      <span className="aid-fin-flat absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/70" />
    </div>
  );
}

/** Последние реплики: появляются по очереди, затем подсвечиваются сроки, даты и имена. */
function Replies({ lines }: { lines: Segment[] }) {
  let mark = 0;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {lines.map((s, i) => (
        <p key={s.id} className="aid-fin-line line-clamp-2 text-[15px] leading-6" style={{ '--d': `${i * 150}ms` } as CSSProperties}>
          {s.speaker && <span className="font-semibold">{s.speaker}. </span>}
          {highlight(s.text).map((part, j) =>
            part.mark ? (
              <mark key={j} className="aid-fin-mark" style={{ '--d': `${600 + mark++ * 350}ms` } as CSSProperties}>
                {part.text}
              </mark>
            ) : (
              <span key={j}>{part.text}</span>
            ),
          )}
          {i === lines.length - 1 && <span className="aid-fin-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-foreground/60" />}
        </p>
      ))}
    </div>
  );
}

/** Карточка свёрнута: вместо реплик факты, как в шапке страницы встречи. */
function Folded({ durationSec, words, replies }: { durationSec: number; words: number; replies: number }) {
  const facts: [string, string][] = [
    [t('metaDuration'), formatTimer(durationSec)],
    [t('pulseWords'), formatNumber(words)],
    [t('pulseReplies'), formatNumber(replies)],
  ];
  return (
    <div className="aid-fin-folded">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[13px] font-medium leading-5 text-muted-foreground">{k}</dt>
            <dd className="tabular text-[15px] font-semibold leading-6">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Подсветка сроков, дат и имён ───

const WHEN = new RegExp(
  [
    '(?:понедельник|вторник|сред[аеуы]|четверг|пятниц[аеуы]|суббот[аеуы]|воскресень[еяю])[а-яё]*',
    'сегодня|завтра|послезавтра|до обеда|к вечеру|на этой неделе|на следующей неделе',
    'через (?:неделю|месяц|день|час|пару дней|\\d+ [а-яё]+)',
    '(?:к|до) конц[ауе] (?:недели|месяца|дня|квартала)',
    '\\d{1,2}(?::\\d{2})',
    '\\d{1,2}\\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)',
    'в (?:девять|десять|одиннадцать|двенадцать|час|два|три|четыре|пять|шесть)',
  ].join('|'),
  'giu',
);

/** Делит текст на части; mark: срок, дата или имя (слово с заглавной не в начале фразы). */
export function highlight(text: string): { text: string; mark: boolean }[] {
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(WHEN)) if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
  // Имена: слово с заглавной не в начале предложения (перед ним не точка, «!», «?» или «…»)
  for (const m of text.matchAll(/[А-ЯЁ][а-яё]{2,}/gu)) {
    const i = m.index ?? 0;
    if (i === 0 || /\p{L}/u.test(text[i - 1])) continue;
    const before = text.slice(0, i).trimEnd();
    if (!before || /[.!?…]$/.test(before)) continue;
    ranges.push([i, i + m[0].length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s < at) continue;
    if (s > at) out.push({ text: text.slice(at, s), mark: false });
    out.push({ text: text.slice(s, e), mark: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}
