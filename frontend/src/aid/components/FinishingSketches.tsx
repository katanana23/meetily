// ВРЕМЕННО: эскизы экрана обработки после «Остановить» (только в разработке,
// ?mock=full&finish=a|b|c&phase=transcribing|saving|opening). Факты встречи вымышленные.
// После выбора одно направление переедет в FinishingScreen, файл удаляется.
'use client';

import { Check, Clock, FileText, Stop, TextAlignLeft, UsersThree, Waveform } from '@phosphor-icons/react';
import { Page } from '@/aid/components/Page';
import { Spinner } from '@/aid/components/ui/spinner';
import type { FinishPhase } from '@/aid/lib/recording';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const MEETING = {
  title: 'Дейли команды «Северный ветер»',
  date: '7 ноября, 10:30',
  duration: '12:34',
  durationLong: '12 мин 34 с',
  words: '1 240',
  replies: '86',
  speakers: '3',
};
const LAST = [
  ['Анна', 'Бету выпускаем в пятницу, тексты к четвергу.'],
  ['Олег', 'Тогда я подготовлю релизные заметки до обеда.'],
  ['Анна', 'Отлично, созвон в понедельник в десять.'],
];
const STEPS = [
  { key: 'finishStepStop', icon: Stop },
  { key: 'finishStepTranscribe', icon: TextAlignLeft },
  { key: 'finishStepSave', icon: FileText },
] as const;
const DONE: Record<FinishPhase, number> = { transcribing: 1, saving: 2, opening: 3, discarding: 1 };
const TITLE: Record<FinishPhase, string> = {
  transcribing: t('finishTranscribing'),
  saving: t('saving'),
  opening: t('saved'),
  discarding: t('discardedNoSpeech'),
};
const HINT: Record<FinishPhase, string> = {
  transcribing: t('finishTranscribingHint'),
  saving: t('savingHint'),
  opening: t('savedHint'),
  discarding: t('discardedNoSpeechHint'),
};

type StepState = 'done' | 'current' | 'pending';
const stepState = (phase: FinishPhase, i: number): StepState => (i < DONE[phase] ? 'done' : i === DONE[phase] ? 'current' : 'pending');

export function FinishingSketch({ variant, phase }: { variant: 'a' | 'b' | 'c'; phase: FinishPhase }) {
  if (variant === 'b') return <SketchB phase={phase} />;
  if (variant === 'c') return <SketchC phase={phase} />;
  return <SketchA phase={phase} />;
}

/** Знак шага: галочка (готово), спиннер (идёт), точка (впереди). */
function StepMark({ state }: { state: StepState }) {
  if (state === 'done') return <Check weight="bold" className="aid-ob-pop size-5 text-primary-ink" aria-hidden />;
  if (state === 'current') return <Spinner size={20} />;
  return <span className="size-2 rounded-full bg-foreground/25" aria-hidden />;
}

/** Иллюстрация «собираю встречу»: реплики по очереди собираются в карточку встречи; готово: галочка. */
function Assembling({ phase, compact }: { phase: FinishPhase; compact?: boolean }) {
  const done = phase === 'opening';
  return (
    <div aria-hidden className={cn('relative flex items-center justify-center overflow-hidden rounded-nested bg-muted p-5', compact ? 'aspect-[8/3]' : 'h-full min-h-[200px]')}>
      <div className={cn('aid-fs-card relative w-[78%] rounded-[16px] bg-card p-4 shadow-sm', phase === 'saving' && 'aid-fs-gather', done && 'aid-fs-done')}>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold leading-5">{MEETING.title}</span>
          {done && <Check weight="bold" className="aid-ob-pop ml-auto size-5 shrink-0 text-primary-ink" />}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {LAST.map(([who, text], i) => (
            <p key={text} className={cn('aid-fs-line truncate text-[13px] font-medium leading-5', `aid-fs-line-${i}`)}>
              <span className="font-semibold">{who}.</span> <span className="text-muted-foreground">{text}</span>
              {i === LAST.length - 1 && phase === 'transcribing' && <span className="aid-fs-caret ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-foreground" />}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </p>
      <p className="tabular mt-1 text-[32px] font-bold leading-9 tracking-tight">{value}</p>
    </div>
  );
}

// ═══════════ A. Бенто-панель: главная плитка с анимацией, факты, шаги плитками ═══════════
function SketchA({ phase }: { phase: FinishPhase }) {
  return (
    <Page layout="bento">
      <div className="grid grid-cols-3 gap-2">
        <section className="aid-ob-rise col-span-3 grid gap-5 rounded-tile bg-card p-5 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col">
            <p className="text-[13px] leading-5 text-muted-foreground">{MEETING.title}</p>
            <h1 className="mt-auto text-balance pt-6 text-[36px] font-bold leading-10 tracking-tight">{TITLE[phase]}</h1>
            <p className="mt-2 text-pretty text-[15px] leading-6 text-muted-foreground">{HINT[phase]}</p>
          </div>
          <Assembling phase={phase} />
        </section>
        <section className="aid-ob-rise col-span-3 flex flex-col justify-between gap-5 rounded-tile bg-card p-5 sm:col-span-1" style={{ ['--d' as string]: '80ms' }}>
          <Fact icon={Clock} label="Длительность" value={MEETING.duration} />
          <Fact icon={TextAlignLeft} label="Слова" value={MEETING.words} />
          <Fact icon={UsersThree} label="Реплики" value={MEETING.replies} />
        </section>
        {STEPS.map(({ key, icon: Icon }, i) => {
          const st = stepState(phase, i);
          return (
            <section
              key={key}
              className={cn('aid-ob-rise flex min-h-[112px] flex-col rounded-tile border-2 p-[18px]', st === 'current' ? 'aid-chip-on bg-card' : 'border-transparent bg-card')}
              style={{ ['--d' as string]: `${140 + i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <Icon className={cn('size-6', st === 'pending' ? 'text-muted-foreground' : 'text-foreground')} aria-hidden />
                <StepMark state={st} />
              </div>
              <p className={cn('mt-auto text-[15px] leading-6', st === 'current' ? 'font-semibold' : st === 'done' ? 'font-medium' : 'text-muted-foreground')}>{t(key)}</p>
            </section>
          );
        })}
      </div>
    </Page>
  );
}

// ═══════════ B. Встреча собирается на месте: шапка как у встречи, переход без скачка ═══════════
function SketchB({ phase }: { phase: FinishPhase }) {
  const header = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-[15px] font-medium" role="status">
          {phase === 'opening' ? <Check weight="bold" className="aid-ob-pop size-5 text-primary-ink" /> : <Spinner size={20} />}
          {TITLE[phase]}
        </span>
        <ol className="flex items-center gap-1" aria-label={t('finishSteps')}>
          {STEPS.map(({ key }, i) => {
            const st = stepState(phase, i);
            return (
              <li key={key} className={cn('flex h-10 items-center gap-2 rounded-full border-2 px-3 text-[13px]', st === 'current' ? 'aid-chip-on font-semibold' : 'border-transparent', st === 'pending' && 'text-muted-foreground', st === 'done' && 'font-medium')}>
                <StepMark state={st} />
                {t(key)}
              </li>
            );
          })}
        </ol>
      </div>
      <h1 className="mt-6 text-[36px] font-bold leading-10 tracking-tight">{MEETING.title}</h1>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {[
          ['Дата', MEETING.date],
          ['Длительность', MEETING.durationLong],
          ['Реплики', MEETING.replies],
          ['Слова', MEETING.words],
        ].map(([k, v], i) => (
          <div key={k} className="aid-ob-rise" style={{ ['--d' as string]: `${i * 80}ms` }}>
            <dt className="text-[13px] leading-5 text-muted-foreground">{k}</dt>
            <dd className="tabular text-[15px] font-semibold leading-6">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return (
    <Page layout="bento" header={header}>
      {/* Итоги ещё не сделаны: место плитки итогов нейтральное, без цвета */}
      <section className="aid-ob-rise flex items-center gap-3 rounded-tile bg-card p-5" style={{ ['--d' as string]: '120ms' }}>
        <Waveform className="size-6 text-indigo-ink" aria-hidden />
        <p className="text-[15px] font-medium">Итоги можно сделать, как только встреча сохранится</p>
      </section>
      <section className="aid-ob-rise rounded-tile bg-card p-5" style={{ ['--d' as string]: '180ms' }}>
        <h2 className="text-[22px] font-bold leading-7 tracking-tight">{t('transcript')}</h2>
        <div className="mt-4 flex max-w-[760px] flex-col gap-4">
          {LAST.map(([who, text], i) => (
            <div key={text} className={cn('aid-fs-line', `aid-fs-line-${i}`)}>
              <p className="text-[13px] font-semibold leading-5">{who}</p>
              <p className="text-[15px] leading-6">
                {text}
                {i === LAST.length - 1 && phase === 'transcribing' && <span className="aid-fs-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-foreground" />}
              </p>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}

// ═══════════ C. Как онбординг: одна плитка по центру, обложка, факты, шаги ═══════════
function SketchC({ phase }: { phase: FinishPhase }) {
  return (
    <Page>
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center">
        <section className="w-full max-w-[600px] rounded-tile bg-card p-5">
          <Assembling phase={phase} compact />
          <h1 className="mt-6 text-balance text-[22px] font-bold leading-7">{TITLE[phase]}</h1>
          <p className="mt-2 text-pretty text-[15px] leading-6 text-muted-foreground">{HINT[phase]}</p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              [Clock, 'Длительность', MEETING.duration],
              [TextAlignLeft, 'Слова', MEETING.words],
              [UsersThree, 'Реплики', MEETING.replies],
            ].map(([Icon, label, value], i) => {
              const I = Icon as typeof Clock;
              return (
                <div key={label as string} className="aid-ob-rise rounded-nested bg-muted px-4 py-3" style={{ ['--d' as string]: `${i * 80}ms` }}>
                  <p className="flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
                    <I className="size-4" aria-hidden />
                    {label as string}
                  </p>
                  <p className="tabular mt-0.5 text-[22px] font-bold leading-7">{value as string}</p>
                </div>
              );
            })}
          </div>
          <ol className="mt-6 flex flex-col gap-1" aria-label={t('finishSteps')}>
            {STEPS.map(({ key }, i) => {
              const st = stepState(phase, i);
              return (
                <li key={key} className={cn('flex h-11 items-center gap-3 rounded-full border-2 px-4 text-[15px]', st === 'current' ? 'aid-chip-on font-semibold' : 'border-transparent', st === 'pending' && 'text-muted-foreground', st === 'done' && 'font-medium')}>
                  <span className="flex size-5 items-center justify-center">
                    <StepMark state={st} />
                  </span>
                  {t(key)}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Page>
  );
}
