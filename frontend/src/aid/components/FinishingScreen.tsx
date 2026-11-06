// Экран после «Остановить»: пока ядро дописывает реплики и сохраняет встречу.
// Живой, но спокойный: полосы звука медленно «успокаиваются» (затухающая волна),
// под ними три шага с отметками. Когда встреча сохранена, полосы сменяются
// галочкой. Анимируются только transform и opacity; prefers-reduced-motion
// оставляет полосы неподвижными (globals.css, .aid-finish-*).
'use client';

import { Check } from '@/aid/components/icons';
import { Spinner } from '@/aid/components/ui/spinner';
import type { FinishPhase } from '@/aid/lib/recording';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const STEPS = ['finishStepStop', 'finishStepTranscribe', 'finishStepSave'] as const;
/** Сколько шагов уже сделано в каждой фазе. */
const DONE: Record<FinishPhase, number> = { transcribing: 1, saving: 2, opening: 3, discarding: 1 };
const BARS = [0.45, 0.75, 1, 0.8, 0.55, 0.9, 0.6];

export function FinishingScreen({ phase, title, hint }: { phase: FinishPhase; title: string; hint: string }) {
  const done = DONE[phase];
  const finished = phase === 'opening';
  return (
    <section role="status" aria-live="polite" className="flex flex-col items-center px-6 pb-10 pt-[12vh] text-center">
      <div className="relative flex h-20 w-40 items-center justify-center" aria-hidden>
        {finished ? (
          <span className="aid-finish-pop flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check weight="bold" className="size-7" />
          </span>
        ) : (
          <span className="flex h-full items-center gap-2">
            {BARS.map((h, i) => (
              <span
                key={i}
                className="aid-finish-bar h-full w-2.5 origin-center rounded-full bg-primary-ink"
                style={{ animationDelay: `${i * 0.12}s`, ['--bar' as string]: h }}
              />
            ))}
          </span>
        )}
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-[15px] text-muted-foreground">{hint}</p>

      {phase !== 'discarding' && (
        <ol className="mt-8 flex flex-wrap justify-center gap-2" aria-label={t('finishSteps')}>
          {STEPS.map((key, i) => {
            const state = i < done ? 'done' : i === done ? 'current' : 'pending';
            return (
              <li
                key={key}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors',
                  state === 'current' ? 'bg-muted font-medium text-foreground' : state === 'done' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="flex size-5 items-center justify-center" aria-hidden>
                  {state === 'done' ? (
                    <Check weight="bold" className="size-4 text-primary-ink" />
                  ) : state === 'current' ? (
                    <Spinner size={16} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  )}
                </span>
                {t(key)}
                <span className="sr-only">{state === 'done' ? `, ${t('stepDone')}` : state === 'current' ? `, ${t('stepCurrent')}` : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
