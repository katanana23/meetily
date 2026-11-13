// Экран после «Остановить»: одна колонка по центру, как первый запуск. Главное на экране
// обложка 2:1 с маскотом ShadeNotes по центру сверху: она показывает настоящий процесс, сцены
// меняются по статусу записи, а не по таймеру.
// - stopped («Запись остановлена», статус STOPPING): волна речи этой встречи (по сигналам
//   детектора речи за последние минуты) плавно успокаивается и сходит в ровную линию;
// - transcribing (PROCESSING_TRANSCRIPTS): последние 2 настоящие реплики встречи без
//   галлюцинаций; в них по очереди подсвечиваются сроки, даты и имена тоном Indigo (роль ИИ,
//   намёк на итоги); без реплик нейтральная сцена без текста;
// - saving (SAVING): реплики гаснут, карточка сворачивается в «шапку встречи»: название и факты;
// - saved (COMPLETED): галочка; дальше карточка перетекает в шапку страницы встречи
//   (view-transition-name aid-meeting, переход в lib/in-place-router.tsx).
// Маскот статичный (логотип, без эмоций): только мягкое появление; «дышит» подложка обложки.
// Шаги идут строго за статусом записи, без искусственных задержек: каждая сцена видна не
// меньше MIN_SCENE_MS, чтобы успеть её прочитать, больше ничего не добавляем. Под обложкой
// заголовок шага, факты встречи (числа считаются вверх) и шаги в одну строку: текущий на
// тоне-подложке со спиннером, готовые с галочкой.
// Финал: «Сделать итоги» (Indigo, от 15 слов) и «Открыть встречу». Без нажатий встреча
// открывается сама через 3 с; любое нажатие отменяет автопереход. Enter открывает сразу.
// Пока экран на месте, переход оригинала к встрече пропускается (finish-hold.ts).
// Только transform, opacity и filter; «уменьшить движение»: статичный кадр текущей стадии
// (globals.css, .aid-fin-*).
'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Sparkle } from '@phosphor-icons/react';
import { BRAND_MARK_SRC } from '@/aid/components/BrandMark';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import type { Segment } from '@/aid/lib/meeting';
import { countWords, isHallucination, MIN_SUMMARY_WORDS } from '@/aid/lib/speech';
import { formatNumber, formatTimer } from '@/aid/lib/format';
import { holdFinish } from '@/aid/lib/finish-hold';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

export type FinishStage = 'stopped' | 'transcribing' | 'saving' | 'saved';

const ORDER: FinishStage[] = ['stopped', 'transcribing', 'saving', 'saved'];
const STEPS = ['finishStepStop', 'finishStepTranscribe', 'finishStepSave'] as const;
/** Сколько шагов готово на каждой стадии; текущий следующий за ними. */
const DONE: Record<FinishStage, number> = {
  stopped: 0,
  transcribing: 1,
  saving: 2,
  saved: 3,
};
const COPY: Record<FinishStage, { title: string; hint: string }> = {
  stopped: { title: t('finishStopped'), hint: t('finishStoppedHint') },
  transcribing: {
    title: t('finishTranscribing'),
    hint: t('finishTranscribingHint'),
  },
  saving: { title: t('saving'), hint: t('savingHint') },
  saved: { title: t('finishSaved'), hint: t('finishSavedHint') },
};
/** Минимум показа сцены: успеть увидеть её, а не вспышку. Волна успокаивается около секунды. */
const MIN_SCENE_MS: Partial<Record<FinishStage, number>> = {
  stopped: 1000,
  transcribing: 600,
  saving: 600,
};
/** Без нажатий встреча открывается сама через столько. */
export const AUTO_OPEN_MS = 3000;
/** Полос в волне: вся запись делится на столько отрезков. */
const WAVE_BARS = 48;
/** Сколько последних реплик показывает обложка. */
const COVER_LINES = 2;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  stage: FinishStage;
  title: string | null;
  durationSec: number;
  segments: Segment[];
  /** Секунды записи, когда слышали речь (LiveSpeech.speechTimes): волна этой встречи. */
  speechTimes: number[];
  /** Встреча сохранена: открыть её (кнопка, Enter, автопереход). */
  onOpen?: () => void;
  /** Встреча сохранена: открыть и сразу собрать итоги. */
  onSummarize?: () => void;
}

/**
 * Сцена идёт строго за статусом записи, по порядку и без пропусков: если ядро проскочило
 * стадию быстрее, чем её видно (на быстрой машине «Запись остановлена» длится доли секунды),
 * сцена держится MIN_SCENE_MS. Если шаг идёт долго, ждать нечего: сцена сменяется сразу,
 * как только статус ушёл дальше. Начинаем с текущей стадии: экран, открытый посреди
 * сохранения, прошлые сцены не проигрывает.
 */
function useSceneStage(stage: FinishStage): FinishStage {
  const [shown, setShown] = useState<FinishStage>(stage);
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [shown]);
  useEffect(() => {
    const at = ORDER.indexOf(shown);
    if (ORDER.indexOf(stage) <= at) return;
    const wait = reducedMotion() ? 0 : Math.max(0, since.current + (MIN_SCENE_MS[shown] ?? 0) - performance.now());
    const id = window.setTimeout(() => setShown(ORDER[at + 1]), wait);
    return () => window.clearTimeout(id);
  }, [stage, shown]);
  return shown;
}

export function FinishingScreen({ stage: actual, title, durationSec: rawDuration, segments, speechTimes, onOpen, onSummarize }: Props) {
  const stage = useSceneStage(actual);
  const done = stage === 'saved' && Boolean(onOpen);
  // Целые секунды: те же, что покажет страница встречи
  const durationSec = Math.floor(rawDuration);
  const lines = useMemo(() => segments.filter((s) => s.text.trim() && !isHallucination(s.text)), [segments]);
  const words = useMemo(() => countWords(lines.map((s) => s.text).join(' ')), [lines]);
  const canSummarize = done && Boolean(onSummarize) && words >= MIN_SUMMARY_WORDS;

  // Пока экран на месте, встречу открывает он, а не переход оригинала
  useEffect(() => {
    holdFinish(true);
    return () => holdFinish(false);
  }, []);

  // Автопереход: только если за 3 с ничего не нажали
  const [auto, setAuto] = useState(true);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    if (!done || !auto) return;
    const cancel = () => setAuto(false);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    const id = window.setTimeout(() => openRef.current?.(), AUTO_OPEN_MS);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
    };
  }, [done, auto]);

  // Enter открывает встречу, если фокус не в поле и не на другой кнопке
  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) return;
      e.preventDefault();
      openRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done]);

  const copy = COPY[stage];
  // Под заголовком на «Записано» вместо подсказки отсчёт автоперехода, пока его не отменили
  const hint = stage === 'saved' && done && auto ? t('finishAutoOpen') : copy.hint;

  return (
    <section className="m-auto w-full max-w-[600px] py-5" data-finish-column>
      <Cover
        stage={stage}
        title={title}
        lines={lines.slice(-COVER_LINES)}
        speechTimes={speechTimes}
        durationSec={durationSec}
        words={words}
        replies={lines.length}
      />
      <div role="status" aria-live="polite">
        <h1 key={stage} className="aid-fin-step mt-5 text-balance text-[22px] font-bold leading-7">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-[52ch] text-pretty text-[15px] leading-6 text-muted-foreground">{hint}</p>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Fact label={t('metaDuration')} value={durationSec} format={(n) => formatTimer(n)} />
        <Fact label={t('pulseWords')} value={words} format={formatNumber} delay={80} />
        <Fact label={t('pulseReplies')} value={lines.length} format={formatNumber} delay={160} />
      </dl>
      <ol className="mt-5 flex gap-1" aria-label={t('finishSteps')}>
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
              <span className="sr-only">
                {state === 'done' ? `, ${t('stepDone')}` : state === 'current' ? `, ${t('stepCurrent')}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {/* Место под действия занято всегда: на «Записано» ничего не сдвигается */}
      <div className="mt-5 flex min-h-14 flex-wrap items-center gap-2">
        {done && (
          <div className="aid-fin-step flex flex-wrap items-center gap-2">
            {canSummarize && (
              <Button variant="indigo" size="main" onClick={onSummarize}>
                <Sparkle />
                {t('generateSummary')}
              </Button>
            )}
            <Button variant={canSummarize ? 'secondary' : 'default'} size="main" onClick={onOpen}>
              {t('openMeeting')}
            </Button>
          </div>
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
    const tick = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / 500));
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(target * eased));
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
  // Сохраняю и сохранено: карточка сворачивается до шапки встречи (название и факты)
  const folded = stage === 'saving' || stage === 'saved';
  return (
    <div aria-hidden className="aid-fin-cover relative flex aspect-[2/1] flex-col items-center gap-2 overflow-hidden rounded-nested p-4">
      {/* Подложка обложки дышит (opacity); маскот и сцены стоят на ней неподвижно */}
      <span className="aid-fin-surface absolute inset-0 bg-muted" />
      {/* Маскот: логотип ShadeNotes, тот же рисунок, что в сайдбаре и в иконке приложения */}
      <img
        src={BRAND_MARK_SRC}
        width={56}
        height={56}
        alt=""
        draggable={false}
        className="aid-fin-mascot relative size-14 shrink-0 select-none"
      />
      {/* Маскот стоит на одном месте на всех сценах; карточка по центру остатка обложки: полная
          на волне и репликах, свёрнутая на сохранении. Около 88 % ширины. При переходе к встрече
          перетекает в шапку страницы встречи (globals.css, data-morph) */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          data-scene={stage}
          className={cn('aid-fin-card flex w-[88%] flex-col rounded-[16px] bg-card p-4 shadow-sm', folded ? 'h-auto' : 'h-full')}
        >
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6">{title || t('recording')}</p>
            {stage === 'saved' ? (
              <Check weight="bold" className="aid-ob-pop size-5 shrink-0 text-primary-ink" />
            ) : (
              <span className="tabular shrink-0 text-[13px] font-medium leading-5 text-muted-foreground">{formatTimer(durationSec)}</span>
            )}
          </div>
          <div className={cn('relative min-h-0', folded ? 'mt-3' : 'mt-3 flex-1')}>
            {stage === 'stopped' && <Wave speechTimes={speechTimes} durationSec={durationSec} />}
            {stage === 'transcribing' && (lines.length ? <Replies lines={lines} /> : <Wave speechTimes={[]} durationSec={durationSec} />)}
            {folded && <Folded durationSec={durationSec} words={words} replies={replies} />}
          </div>
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
          {i === lines.length - 1 && (
            <span className="aid-fin-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-foreground/60" />
          )}
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
