// Карточка после «Остановить» на месте кнопки записи (RecordDock): одна и та же карточка
// меняет состояние на месте, без мигания и без смены размера: «Дописываю реплики» →
// «Сохраняю» → «Встреча сохранена» с «Открыть» и крестиком (уходит сама через 5 с, под
// курсором и в фокусе ждёт). Запись отбракована: та же карточка с «Слишком коротко -
// запись не сохранена» (или почему ещё не сохранили), строки в списке нет.
// Общее уведомление Aid (ui/notice.tsx): плотное стекло, знак в круге 44 px слева.
// В круге маленький показ процесса, а не логотип и не цифры: полосы волны записи
// складываются в строки текста, строки становятся галочкой (FinishGlyph, .aid-fg-* в
// globals.css). Только transform и opacity; при «уменьшить движение» статичный знак шага.
'use client';

import { useEffect, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { Notice } from '@/aid/components/ui/notice';
import { Button } from '@/aid/components/ui/button';
import { SoundCheckDialog } from '@/aid/components/SoundCheck';
import { displayTitle } from '@/aid/lib/format';
import { t } from '@/aid/strings';

export type FinishCardStage = 'transcribing' | 'saving' | 'saved' | 'discarded';
/** Почему запись не сохранена (recording-outcome.tsx): коротко, без речи, речь не распознана. */
export type DiscardReason = 'cancelled' | 'no-speech' | 'unrecognized';

/** Через сколько «Встреча сохранена» уходит сама, если её не трогать. */
export const SAVED_CARD_MS = 5000;

const BARS = [0, 1, 2];

/** Знак шага: три полосы и галочка, положение задаёт data-stage (globals.css). */
export function FinishGlyph({ stage }: { stage: FinishCardStage }) {
  return (
    <span className="aid-fg" data-stage={stage} aria-hidden>
      {BARS.map((i) => (
        <span key={i} className="aid-fg-bar" style={{ ['--i' as string]: i }}>
          <span className="aid-fg-in" />
        </span>
      ))}
      <Check weight="bold" className="aid-fg-check" />
    </span>
  );
}

const DISCARD_TITLE: Record<DiscardReason, string> = {
  cancelled: t('discardedShort'),
  'no-speech': t('discardedSilent'),
  unrecognized: t('discardedUnrecognized'),
};

interface FinishCardProps {
  stage: FinishCardStage;
  /** Название встречи (как в ядре); подписью под шагом. */
  title?: string | null;
  reason?: DiscardReason;
  onOpen?: () => void;
  onClose?: () => void;
  /** Задержать уход карточки ('hover', 'focus', 'dialog'): у отбракованной время ведёт провайдер. */
  onHold?: (reason: string, on: boolean) => void;
  /** Предпросмотр и уходящая копия: без таймеров и клавиш. */
  still?: boolean;
}

export function FinishCard({ stage, title, reason = 'cancelled', onOpen, onClose, onHold, still }: FinishCardProps) {
  const [soundCheck, setSoundCheck] = useState(false);
  const [held, setHeld] = useState(false);
  const hold = (why: string, on: boolean) => {
    if (why !== 'dialog') setHeld(on);
    onHold?.(why, on);
  };
  const closable = stage === 'saved' || stage === 'discarded';
  const suspectSound = stage === 'discarded' && reason === 'no-speech';

  // «Встреча сохранена» уходит сама через 5 с; под курсором и в фокусе ждёт
  useEffect(() => {
    if (still || stage !== 'saved' || held || !onClose) return;
    const id = window.setTimeout(onClose, SAVED_CARD_MS);
    return () => window.clearTimeout(id);
  }, [still, stage, held, onClose]);

  // Esc закрывает итог (если не открыта «Проверить звук»)
  useEffect(() => {
    if (still || !closable || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !soundCheck && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [still, closable, onClose, soundCheck]);

  // Пока открыта «Проверить звук», карточка не уходит: иначе диалог закрылся бы вместе с ней
  useEffect(() => onHold?.('dialog', soundCheck), [onHold, soundCheck]);

  const name = title ? displayTitle(title) : null;
  const heading =
    stage === 'transcribing' ? t('finishTranscribing') : stage === 'saving' ? t('finishSaving') : stage === 'saved' ? t('finishSaved') : DISCARD_TITLE[reason];

  return (
    <>
      <Notice
        role="status"
        aria-live="polite"
        data-aid-finish={stage}
        // pointerenter не приходит, если карточка появилась под неподвижным курсором (там была «Остановить»)
        onPointerMove={() => !held && hold('hover', true)}
        onPointerLeave={() => hold('hover', false)}
        onFocus={() => hold('focus', true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && hold('focus', false)}
        // Ширина одна на всех шагах: карточка не прыгает, меняются только знак и текст
        className="w-[min(480px,calc(100vw-8rem))]"
        icon={<FinishGlyph stage={stage} />}
        tone={stage === 'saved' ? 'success' : 'neutral'}
        title={
          <span key={heading} className="aid-fg-text block truncate">
            {heading}
          </span>
        }
        // Короткая отбракованная запись говорит всё одной строкой; длинная без речи: почему и
        // подписью «Запись не сохранена» (рядом действие, одна строка не помещается)
        hint={stage === 'discarded' ? (reason === 'cancelled' ? undefined : t('discardedNotSaved')) : (name ?? undefined)}
        actions={
          stage === 'saved' && onOpen ? (
            <Button variant="secondary" className="h-10 shrink-0 px-4 text-sm font-medium" onClick={onOpen}>
              {t('finishOpen')}
            </Button>
          ) : suspectSound ? (
            <Button variant="ghost" className="h-10 shrink-0 px-3 text-sm font-medium" onClick={() => setSoundCheck(true)}>
              {t('soundCheck')}
            </Button>
          ) : undefined
        }
        onClose={closable ? onClose : undefined}
        closeLabel={t('close')}
      />
      {suspectSound && !still && <SoundCheckDialog open={soundCheck} onOpenChange={setSoundCheck} />}
    </>
  );
}
