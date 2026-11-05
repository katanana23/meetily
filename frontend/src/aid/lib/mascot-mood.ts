// Настроение маскота по состоянию приложения (сайдбар, экран «Завершаем запись»,
// карточка «Тишина»). Приоритет сверху вниз:
// - идёт запись: слушает (listening), глаза и искра отзываются на сигналы речи;
//   пауза: покой; «Не слышу речи»: любопытство с наклоном;
// - запись остановлена: думает (дописывает реплики, проверяет звук, сохраняет);
//   встреча сохранена: рад с прыжком; решено не сохранять: сонный;
// - карточка после записи: «Тишина» и «Пара фраз» сонный, «Не распознано» ошибка с тряской;
// - итоги встречи: генерация думает, готовый текст ненадолго «говорит»;
// - иначе покой, взгляд за курсором.
// Уровня звука ядро во время записи не отдаёт, поэтому «уровень» здесь сигналы
// детектора речи и реплики (как у полос речи в RecordDock).
'use client';

import { useSyncExternalStore } from 'react';
import type { MascotMood } from '@/aid/components/Mascot';
import type { LiveSpeech } from './recording-outcome';
import type { FinishPhase } from './recording';
import { useRecordingControls } from './recording-controls';
import { useRecordingOutcome } from './recording-outcome';

/** Через сколько секунд без единой осмысленной реплики показать «Не слышу речи». */
export const NO_SPEECH_HINT_SEC = 20;

/** «Не слышу речи»: ложные срабатывания детектора на шум без осмысленного текста речью не считаются. */
export function noSpeechYet(recording: { isRecording: boolean; duration: number }, live: LiveSpeech): boolean {
  return recording.isRecording && live.tracking && live.textSegments === 0 && !live.recognitionFailed && recording.duration >= NO_SPEECH_HINT_SEC;
}

// ─── Итоги: страница встречи сообщает, что ИИ делает с итогами ───

export type SummaryActivity = 'thinking' | 'speaking' | null;
let summaryActivity: SummaryActivity = null;
const listeners = new Set<() => void>();

export function setSummaryActivity(value: SummaryActivity) {
  if (summaryActivity === value) return;
  summaryActivity = value;
  listeners.forEach((fn) => fn());
}

function useSummaryActivity(): SummaryActivity {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => summaryActivity,
    () => null,
  );
}

/** Настроение на экране завершения записи. */
export function finishMood(phase: FinishPhase): MascotMood {
  return phase === 'opening' ? 'happy' : phase === 'discarding' ? 'sleepy' : 'thinking';
}

export function useAppMascotMood(): { mood: MascotMood; pulse: number } {
  const c = useRecordingControls();
  const { live, notice } = useRecordingOutcome();
  const summary = useSummaryActivity();
  const pulse = live.vadSegments + live.textSegments;

  let mood: MascotMood = 'idle';
  if (c.isRecording) mood = c.isPaused ? 'idle' : noSpeechYet(c, live) ? 'curious' : 'listening';
  else if (c.phase) mood = finishMood(c.phase);
  else if (notice) mood = notice.verdict === 'unrecognized' ? 'error' : 'sleepy';
  else if (summary) mood = summary;
  return { mood, pulse };
}
