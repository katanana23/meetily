// Экран после «Остановить»: пока ядро дописывает реплики и решается, что сохранить.
// В центре маскот, заголовок по его настроению (mascot-mood.ts, finishMood):
// думает, пока слушает последние секунды и сохраняет; рад с прыжком, когда встреча
// сохранена; сонный, когда решено не сохранять. Итог пишется только после решения.
// Под заголовком три шага с отметками. Движение маскота выключает prefers-reduced-motion.
'use client';

import { Check } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Mascot } from '@/aid/components/Mascot';
import { finishMood } from '@/aid/lib/mascot-mood';
import type { FinishPhase } from '@/aid/lib/recording';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const STEPS = ['finishStepStop', 'finishStepTranscribe', 'finishStepSave'] as const;
/** Сколько шагов уже сделано в каждой фазе. */
const DONE: Record<FinishPhase, number> = { transcribing: 1, saving: 2, opening: 3, discarding: 1 };

export function FinishingScreen({ phase, title, hint }: { phase: FinishPhase; title: string; hint: string }) {
  const done = DONE[phase];
  return (
    <section role="status" aria-live="polite" className="flex flex-col items-center px-6 pb-10 pt-[8vh] text-center">
      <Mascot mood={finishMood(phase)} size={184} details className="text-muted-foreground" />

      <h1 className="mt-6 text-[22px] font-bold leading-7 tracking-tight">{title}</h1>
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
