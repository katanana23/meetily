// Сигналы речи во время записи и решение после стопа.
//
// Ядро не сообщает уровень звука во время записи (start_audio_level_monitoring
// шлёт синтетические значения), поэтому опираемся на то, что есть:
// - transcription-progress: на каждый речевой сегмент после silero VAD;
// - transcript-update: распознанный текст с временем и уверенностью;
// - transcription-queue-complete: сколько речевых сегментов было за запись (при стопе);
// - transcription-error, transcript-error, transcription-warning: сбои распознавания.
//
// Провайдер один на приложение (переходник app/layout.tsx), поэтому сигналы
// переживают переходы между страницами, а остановка из трея идёт тем же путём,
// что и кнопка: он заменяет оригинальный RecordingPostProcessingProvider в Aid.

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { toSegment } from './meeting';
import { isHallucination, judgeRecording, type RecordingVerdict } from './speech';

/** Сколько ждать «Вернуть» у несохранённой записи. */
export const RESTORE_WINDOW_MS = 10_000;
/** Ключ sessionStorage: итог последней записи для страницы встречи (только Aid). */
export const OUTCOME_KEY = 'aid.recordingOutcome';

export interface LiveSpeech {
  /** Провайдер видел начало этой записи (после перезагрузки окна посреди записи нет). */
  tracking: boolean;
  /** Речевых сегментов по VAD. */
  vadSegments: number;
  /** Реплик с буквами, без галлюцинаций. */
  textSegments: number;
  /** Секунда записи (без пауз), когда последний раз была речь. */
  lastSpeechAt: number | null;
  recognitionFailed: boolean;
}

export interface StoredOutcome {
  folder: string | null;
  verdict: RecordingVerdict;
  vadSegments: number;
  recognitionFailed: boolean;
}

type StopHandler = (save: boolean) => Promise<void>;

interface Ctx {
  live: LiveSpeech;
  /** Идёт оценка или запись не сохраняется: экран записи показывает «Завершаем запись». */
  finishing: 'judging' | 'discarding' | null;
  finish: (handleRecordingStop: StopHandler) => Promise<RecordingVerdict>;
}

const EMPTY: LiveSpeech = { tracking: false, vadSegments: 0, textSegments: 0, lastSpeechAt: null, recognitionFailed: false };
const RecordingOutcomeContext = createContext<Ctx | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function readStoredOutcome(folder: string | null | undefined): StoredOutcome | null {
  try {
    const raw = sessionStorage.getItem(OUTCOME_KEY);
    const value = raw ? (JSON.parse(raw) as StoredOutcome) : null;
    return value && folder && value.folder === folder ? value : null;
  } catch {
    return null;
  }
}

export function AidRecordingProvider({ children }: { children: ReactNode }) {
  const recording = useRecordingState();
  const { transcriptsRef } = useTranscripts();
  const noop = useCallback(() => undefined, []);
  // Свой экземпляр оригинального хука: сохраняет встречу при остановке из трея и по «Вернуть»
  const { handleRecordingStop } = useRecordingStop(noop, noop);

  const [live, setLive] = useState<LiveSpeech>(EMPTY);
  const [finishing, setFinishing] = useState<Ctx['finishing']>(null);
  const liveRef = useRef<LiveSpeech>(EMPTY);
  const texts = useRef<string[]>([]);
  const queueTotal = useRef<number | null>(null);
  const seconds = useRef(0);
  const busy = useRef(false);
  const restoreToast = useRef<string | number | null>(null);
  const generation = useRef(0);

  seconds.current = recording.activeDuration ?? seconds.current;

  const update = useCallback((patch: Partial<LiveSpeech>) => {
    liveRef.current = { ...liveRef.current, ...patch };
    setLive(liveRef.current);
  }, []);

  const finish = useCallback(
    async (handle: StopHandler): Promise<RecordingVerdict> => {
      if (busy.current) return 'speech';
      busy.current = true;
      setFinishing('judging');
      try {
        // В ядре очередь закрывается до recording-stopped; при остановке из трея событие уже пришло
        for (let i = 0; i < 30 && queueTotal.current === null && liveRef.current.tracking; i++) await sleep(100);
        const own = texts.current;
        const fromContext = transcriptsRef.current.map((t) => toSegment(t).text);
        const evidence = {
          texts: own.length >= fromContext.length ? own : fromContext,
          vadSegments: Math.max(liveRef.current.vadSegments, queueTotal.current ?? 0),
          recognitionFailed: liveRef.current.recognitionFailed,
        };
        let verdict = judgeRecording(evidence);
        // Начало записи не видели (окно перезагрузили посреди записи): не выбрасываем
        if (verdict === 'no-speech' && !liveRef.current.tracking) verdict = 'unrecognized';

        const folder = sessionStorage.getItem('last_recording_folder_path');
        try {
          sessionStorage.setItem(
            OUTCOME_KEY,
            JSON.stringify({ folder, verdict, vadSegments: evidence.vadSegments, recognitionFailed: evidence.recognitionFailed } satisfies StoredOutcome),
          );
        } catch {
          /* страница встречи покажет общую причину */
        }

        if (verdict !== 'no-speech') {
          setFinishing(null);
          await handle(true);
          return verdict;
        }

        // Речи не было: в базу не пишем (оригинальный путь handleRecordingStop(false)),
        // но 10 секунд можно вернуть встречу тем же хуком, как при обычном сохранении.
        setFinishing('discarding');
        await handle(false);
        const gen = generation.current;
        restoreToast.current = toast.info('Речи не было, запись не сохранена', {
          duration: RESTORE_WINDOW_MS,
          action: {
            label: 'Вернуть',
            onClick: () => {
              if (gen !== generation.current) return; // уже началась новая запись
              void handleRecordingStop(true);
            },
          },
        });
        return verdict;
      } finally {
        busy.current = false;
        setFinishing(null);
      }
    },
    [transcriptsRef, handleRecordingStop],
  );

  useEffect(() => {
    const offs = [
      listen('recording-started', () => {
        generation.current++;
        if (restoreToast.current != null) toast.dismiss(restoreToast.current);
        restoreToast.current = null;
        texts.current = [];
        queueTotal.current = null;
        seconds.current = 0;
        liveRef.current = { ...EMPTY, tracking: true };
        setLive(liveRef.current);
      }),
      listen<{ chunks_queued?: number }>('transcription-progress', (e) => {
        const queued = Number(e.payload?.chunks_queued ?? 0);
        update({ vadSegments: Math.max(liveRef.current.vadSegments, queued), lastSpeechAt: seconds.current });
      }),
      listen<{ text?: string }>('transcript-update', (e) => {
        const text = toSegment({ text: e.payload?.text ?? '' } as never).text;
        texts.current = [...texts.current, text];
        if (/\p{L}/u.test(text) && !isHallucination(text)) {
          update({ textSegments: liveRef.current.textSegments + 1, lastSpeechAt: seconds.current });
        }
      }),
      listen<{ total_chunks?: number }>('transcription-queue-complete', (e) => {
        queueTotal.current = Number(e.payload?.total_chunks ?? 0);
      }),
      listen<{ phase?: string }>('transcription-error', (e) => {
        if (e.payload?.phase !== 'startup') update({ recognitionFailed: true });
      }),
      listen('transcript-error', () => update({ recognitionFailed: true })),
      listen('transcription-warning', () => update({ recognitionFailed: true })),
      // Остановка из трея: tray.rs шлёт recording-stop-complete после stop_recording
      listen<boolean>('recording-stop-complete', (e) => {
        if (e.payload === false) void handleRecordingStop(false);
        else void finish(handleRecordingStop);
      }),
    ];
    return () => offs.forEach((p) => void p.then((off) => off()));
  }, [finish, handleRecordingStop, update]);

  const value = useMemo(() => ({ live, finishing, finish }), [live, finishing, finish]);
  return <RecordingOutcomeContext.Provider value={value}>{children}</RecordingOutcomeContext.Provider>;
}

export function useRecordingOutcome(): Ctx {
  const ctx = useContext(RecordingOutcomeContext);
  if (!ctx) throw new Error('useRecordingOutcome вне AidRecordingProvider');
  return ctx;
}
