// Список реплик для чтения: время в узкой приглушённой колонке по левому краю,
// ширина колонки по самой длинной метке (0:00 или 1:02:03), поэтому слева от
// времени ровно отступ плитки, как сверху; спикер (если есть) строкой над текстом и только когда
// говорящий меняется; между сменами спикера отступ больше, чем внутри.
// Ширина текста ограничена колонкой страницы (около 700 px).
//
// Во время записи (live) новые реплики печатаются, как на печатной машинке:
// буквы появляются по очереди, в конце последней реплики мигает курсор.
// Ядро присылает реплику целиком после фрагмента речи, поэтому печать только
// показывает её появление; длинная реплика печатается быстрее (не дольше 1,6 с),
// чтобы текст не отставал от разговора. Реплики, которые уже были на экране при
// открытии, не перепечатываются. prefers-reduced-motion показывает текст сразу.
// Диктор получает реплику целиком один раз (скрытый текст), а не по буквам.

import { memo, useEffect, useRef, useState } from 'react';
import type { Segment } from '@/aid/lib/meeting';
import { segmentTime } from '@/aid/lib/meeting';
import { cn } from '@/aid/lib/utils';

/** Скорость печати: букв в секунду для коротких реплик; длинные укладываются в MAX_TYPE_MS. */
const CHARS_PER_SECOND = 55;
const MAX_TYPE_MS = 1600;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function TypedText({ text, animate, onDone }: { text: string; animate: boolean; onDone?: () => void }) {
  const [shown, setShown] = useState(() => (animate && !prefersReducedMotion() ? 0 : text.length));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (shown >= text.length) return;
    const cps = Math.max(CHARS_PER_SECOND, (text.length * 1000) / MAX_TYPE_MS);
    const t0 = performance.now() - (shown / cps) * 1000;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps));
      setShown(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
      else done.current?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Печать начинается один раз для реплики; текст реплики не меняется
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!animate) return <>{text}</>;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{text.slice(0, shown)}</span>
    </>
  );
}

interface TranscriptListProps {
  segments: Segment[];
  /** Идёт запись: новые реплики печатаются, в конце мигает курсор. */
  live?: boolean;
  /** Реплика допечатана: экран записи докручивает к концу. */
  onTyped?: () => void;
  /**
   * Реплики, которые не перепечатывать (уже были на экране). По умолчанию те, что
   * были при первом показе списка; экран записи передаёт свои, чтобы первая
   * реплика, с которой список появляется, тоже печаталась.
   */
  settledIds?: ReadonlySet<string>;
}

interface RowProps {
  text: string;
  time: string;
  /** Ширина колонки времени в ch: по самой длинной метке. */
  timeCh: number;
  speaker: string | null;
  /** Спикер сменился: имя строкой над текстом и отступ больше. */
  newSpeaker: boolean;
  first: boolean;
  live: boolean;
  /** Печатать по буквам (новая реплика во время записи). */
  animate: boolean;
  /** Последняя реплика: в конце мигает курсор. */
  last: boolean;
  onTyped?: () => void;
}

/**
 * Строка транскрипта. Пропсы простые (строки, числа, флаги), поэтому новая реплика
 * перерисовывает только себя и прежнюю последнюю (у неё уходит курсор), а не весь список:
 * экран записи пересобирает массив реплик на каждое событие ядра.
 */
const Row = memo(function Row({ text, time, timeCh, speaker, newSpeaker, first, live, animate, last, onTyped }: RowProps) {
  return (
    <li style={{ gridTemplateColumns: `${timeCh}ch 1fr` }} className={cn('grid items-baseline gap-x-4', first ? '' : newSpeaker ? 'pt-6' : 'pt-2.5')}>
      <time className="tabular select-none text-[13px] leading-7 text-muted-foreground">{time}</time>
      <div className="min-w-0">
        {newSpeaker && <p className="text-[13px] font-semibold leading-7 text-foreground">{speaker}</p>}
        <p className="text-pretty leading-7 text-foreground/90">
          {speaker && !newSpeaker && <span className="sr-only">{speaker}: </span>}
          {live ? <TypedText text={text} animate={animate} onDone={onTyped} /> : text}
          {live && last && <span className="aid-caret" aria-hidden />}
        </p>
      </div>
    </li>
  );
});

export const TranscriptList = memo(function TranscriptList({ segments, live = false, onTyped, settledIds }: TranscriptListProps) {
  // Реплики, которые были при первом показе, не перепечатываются
  const initial = useRef<ReadonlySet<string> | null>(null);
  if (initial.current === null) initial.current = settledIds ?? new Set(segments.map((s) => s.id));
  const timeCh = segments.reduce((w, s) => Math.max(w, segmentTime(s).length), 4);
  return (
    <ol className="text-[15px]" aria-live={live ? 'polite' : undefined}>
      {segments.map((s, i) => {
        const prev = segments[i - 1];
        return (
          // key по id реплики: он не меняется, поэтому строки не пересоздаются
          <Row
            key={s.id}
            text={s.text}
            time={segmentTime(s)}
            timeCh={timeCh}
            speaker={s.speaker}
            newSpeaker={Boolean(s.speaker) && s.speaker !== prev?.speaker}
            first={i === 0}
            live={live}
            animate={!initial.current!.has(s.id)}
            last={i === segments.length - 1}
            onTyped={onTyped}
          />
        );
      })}
    </ol>
  );
});
