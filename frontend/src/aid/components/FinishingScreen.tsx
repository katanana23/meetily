// Экран после «Остановить»: главное статус, иллюстрации нет.
// - Сверху крупно (22/28) текущий шаг со спиннером: «Распознаю последние фразы» →
//   «Сохраняю встречу» → «Записано» с лаймовой галочкой. Шаги идут по статусу записи
//   оригинала, без искусственных задержек; только минимум 0,6 с, чтобы не мелькало.
// - Под ним факты одной строкой подписью: «00:16 · 23 слова · 2 реплики».
// - Ниже сама встреча: название и реплики по мере дописывания, как на странице встречи
//   («встреча собирается на месте»). Галлюцинации на тишине не показываются.
// - Финал: «Сделать итоги» (Indigo, от 15 слов) и «Открыть встречу». Без нажатий встреча
//   открывается сама через 3 с; любое нажатие отменяет автопереход. Enter открывает сразу.
// Пока экран на месте, переход оригинала к встрече пропускается (finish-hold.ts).
// «Уменьшить движение»: без анимаций, текст сразу целиком.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Spinner } from '@/aid/components/ui/spinner';
import { TranscriptList } from '@/aid/components/TranscriptList';
import type { Segment } from '@/aid/lib/meeting';
import { countWords, isHallucination, MIN_SUMMARY_WORDS } from '@/aid/lib/speech';
import { formatNumber, formatTimer, plural } from '@/aid/lib/format';
import { holdFinish } from '@/aid/lib/finish-hold';
import { t } from '@/aid/strings';

export type FinishStage = 'transcribing' | 'saving' | 'saved';

const ORDER: FinishStage[] = ['transcribing', 'saving', 'saved'];
/** Минимум показа шага: успеть прочитать, а не увидеть вспышку. Больше задержек нет. */
const MIN_STEP_MS = 600;
/** Без нажатий встреча открывается сама через столько. */
export const AUTO_OPEN_MS = 3000;
/** Сколько последних реплик показывать: длинная встреча не разворачивается целиком. */
const TAIL = 6;

const TITLE: Record<FinishStage, string> = {
  transcribing: t('finishTranscribing'),
  saving: t('saving'),
  saved: t('finishSaved'),
};

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  stage: FinishStage;
  title: string | null;
  durationSec: number;
  segments: Segment[];
  /** Встреча сохранена: открыть её (кнопка, Enter, автопереход). */
  onOpen?: () => void;
  /** Встреча сохранена: открыть и сразу собрать итоги. */
  onSummarize?: () => void;
}

/**
 * Шаг идёт строго за статусом, по порядку: если ядро проскочило стадию, она всё равно
 * видна MIN_STEP_MS. Начинаем с текущей: экран, открытый посреди сохранения, прошлое не показывает.
 */
function useStep(stage: FinishStage): FinishStage {
  const [shown, setShown] = useState<FinishStage>(stage);
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [shown]);
  useEffect(() => {
    const at = ORDER.indexOf(shown);
    if (ORDER.indexOf(stage) <= at) return;
    const wait = reducedMotion() ? 0 : Math.max(0, since.current + MIN_STEP_MS - performance.now());
    const id = window.setTimeout(() => setShown(ORDER[at + 1]), wait);
    return () => window.clearTimeout(id);
  }, [stage, shown]);
  return shown;
}

export function FinishingScreen({ stage: actual, title, durationSec: rawDuration, segments, onOpen, onSummarize }: Props) {
  const stage = useStep(actual);
  const done = stage === 'saved' && Boolean(onOpen);
  // Целые секунды: те же, что покажет страница встречи
  const durationSec = Math.floor(rawDuration);
  const lines = useMemo(() => segments.filter((s) => s.text.trim() && !isHallucination(s.text)), [segments]);
  const words = useMemo(() => countWords(lines.map((s) => s.text).join(' ')), [lines]);
  const tail = lines.slice(-TAIL);
  const hidden = lines.length - tail.length;
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

  const facts = [
    formatTimer(durationSec),
    `${formatNumber(words)} ${plural(words, 'слово', 'слова', 'слов')}`,
    `${formatNumber(lines.length)} ${plural(lines.length, 'реплика', 'реплики', 'реплик')}`,
  ].join(' · ');

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col py-5" data-finish-column>
      {/* Статус главный: шаг крупно, слева знак шага */}
      <div role="status" aria-live="polite" className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
          {stage === 'saved' ? <Check weight="bold" className="aid-ob-pop size-6 text-primary-ink" /> : <Spinner size={20} />}
        </span>
        <h1 key={stage} className="aid-fin-step text-balance text-[22px] font-bold leading-7">
          {TITLE[stage]}
        </h1>
      </div>
      <p className="tabular mt-2 pl-9 text-[15px] leading-6 text-muted-foreground">{facts}</p>

      {done && (
        <div className="aid-fin-step mt-6 flex flex-wrap items-center gap-2 pl-9">
          {canSummarize && (
            <Button variant="indigo" size="main" onClick={onSummarize}>
              <Sparkle />
              {t('generateSummary')}
            </Button>
          )}
          <Button variant={canSummarize ? 'secondary' : 'default'} size="main" onClick={onOpen}>
            {t('openMeeting')}
          </Button>
          {auto && <p className="ml-2 text-sm text-muted-foreground">{t('finishAutoOpen')}</p>}
        </div>
      )}

      {/* Встреча собирается на месте: название и реплики, как на странице встречи. Ширина
          карточки одна на всех шагах (вся колонка, не по содержимому): без скачка к «Записано» */}
      <article className="mt-8 w-full rounded-nested bg-muted p-5" aria-label={t('transcript')}>
        <h2 className="aid-fin-card truncate text-[17px] font-semibold leading-6">{title || t('recording')}</h2>
        <div className="mt-4">
          {hidden > 0 && (
            <p className="mb-3 text-[13px] leading-5 text-muted-foreground">
              {t('finishEarlier')} {formatNumber(hidden)} {plural(hidden, 'реплика', 'реплики', 'реплик')}
            </p>
          )}
          {tail.length ? (
            <TranscriptList segments={tail} live={stage === 'transcribing'} />
          ) : (
            <p className="text-[15px] leading-7 text-muted-foreground">{t('finishNoLines')}</p>
          )}
        </div>
      </article>
    </section>
  );
}
