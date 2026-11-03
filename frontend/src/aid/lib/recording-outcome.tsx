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
import { toast } from 'sonner';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { toSegment } from './meeting';
import { subscribe } from './tauri-events';
import { isDiscarded, isHallucination, judgeRecording, type NoTextReason, type RecordingVerdict, type SpeechSegment } from './speech';
import { hasTranscriptionModel } from './model-check';

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
  const segs = useRef<SpeechSegment[]>([]);
  /** Длины речевых сегментов без текста, если ядро когда-нибудь начнёт их присылать. */
  const vadDurations = useRef<number[]>([]);
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
        const own = segs.current;
        const fromContext: SpeechSegment[] = transcriptsRef.current.map((t) => ({
          text: (t.text ?? '').trim(),
          duration: typeof t.duration === 'number' ? t.duration : null,
        }));
        const segments = own.length >= fromContext.length ? own : fromContext;
        const vadSegments = Math.max(liveRef.current.vadSegments, queueTotal.current ?? 0);
        // Секунды речи по детектору: длины речевых сегментов, о которых ядро сообщило
        // (duration у transcript-update; у сегментов без текста ядро длину не присылает)
        const known = [...segments.map((x) => x.duration), ...vadDurations.current].filter(
          (d): d is number => typeof d === 'number' && Number.isFinite(d),
        );
        const detectorSeconds = known.length ? known.reduce((a, b) => a + b, 0) : null;
        const model = await hasTranscriptionModel();
        const noTextReason: NoTextReason | null =
          model === false ? 'no-model' : liveRef.current.recognitionFailed ? 'recognition-error' : null;

        const judgement = judgeRecording({ segments, vadSegments, detectorSeconds, noTextReason });
        let verdict = judgement.verdict;
        let reason = judgement.reason;
        // Начало записи не видели (окно перезагрузили посреди записи): не выбрасываем
        if (isDiscarded(verdict) && !liveRef.current.tracking) {
          verdict = verdict === 'too-little' ? 'speech' : 'unrecognized';
          reason = 'начало записи не отслежено, сохраняем как есть';
        }

        // Журнал решения: одна строка на каждую остановку (консоль окна; логгер
        // приложения tauri-plugin-log в ядре не подключён, из интерфейса недоступен)
        const fmt = (n: number | null) => (n === null ? 'нет данных' : `${n.toFixed(1)} с`);
        console.info(
          `[aid] Итог записи: длительность ${fmt(seconds.current)}, речь по детектору ${fmt(detectorSeconds)} ` +
            `(${vadSegments} сегм.), реплик ${judgement.segmentsBefore} → ${judgement.segmentsAfter} после чистки, ` +
            `слов ${judgement.words}, речь в репликах ${fmt(judgement.speechSeconds)}, ` +
            `модель ${model === null ? 'не проверена' : model ? 'есть' : 'нет'}, ` +
            `ошибка распознавания ${liveRef.current.recognitionFailed ? 'да' : 'нет'} → ${verdict}: ${reason}`,
        );

        const folder = sessionStorage.getItem('last_recording_folder_path');
        try {
          sessionStorage.setItem(
            OUTCOME_KEY,
            JSON.stringify({ folder, verdict, vadSegments, recognitionFailed: liveRef.current.recognitionFailed } satisfies StoredOutcome),
          );
        } catch {
          /* страница встречи покажет общую причину */
        }

        if (!isDiscarded(verdict)) {
          setFinishing(null);
          await handle(true);
          return verdict;
        }

        // Речи не было или слишком мало: в базу не пишем (оригинальный путь
        // handleRecordingStop(false)), но 10 секунд можно вернуть встречу тем же
        // хуком, как при обычном сохранении.
        setFinishing('discarding');
        await handle(false);
        const gen = generation.current;
        const message = verdict === 'too-little' ? 'Слишком мало речи, запись не сохранена' : 'Речи не было, запись не сохранена';
        restoreToast.current = toast.info(message, {
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

  // Обработчики из ref: подписки живут всё время работы провайдера и не
  // переподписываются, когда меняются finish и handleRecordingStop.
  const stopRef = useRef({ finish, handleRecordingStop });
  stopRef.current = { finish, handleRecordingStop };

  useEffect(() => {
    const offs = [
      subscribe('recording-started', () => {
        generation.current++;
        if (restoreToast.current != null) toast.dismiss(restoreToast.current);
        restoreToast.current = null;
        segs.current = [];
        vadDurations.current = [];
        queueTotal.current = null;
        seconds.current = 0;
        liveRef.current = { ...EMPTY, tracking: true };
        setLive(liveRef.current);
      }),
      subscribe<{ chunks_queued?: number; duration?: number }>('transcription-progress', (e) => {
        const queued = Number(e.payload?.chunks_queued ?? 0);
        if (typeof e.payload?.duration === 'number') vadDurations.current = [...vadDurations.current, e.payload.duration];
        update({ vadSegments: Math.max(liveRef.current.vadSegments, queued), lastSpeechAt: seconds.current });
      }),
      subscribe<{ text?: string; duration?: number }>('transcript-update', (e) => {
        // Для подсчёта слов исходный текст: ядро не подписывает спикеров, а эвристика
        // toSegment приняла бы «Давайте договоримся: …» за имя спикера
        const raw = (e.payload?.text ?? '').trim();
        const text = toSegment({ text: raw } as never).text;
        const duration = typeof e.payload?.duration === 'number' ? e.payload.duration : null;
        segs.current = [...segs.current, { text: raw, duration }];
        if (/\p{L}/u.test(text) && !isHallucination(text)) {
          update({ textSegments: liveRef.current.textSegments + 1, lastSpeechAt: seconds.current });
        }
      }),
      subscribe<{ total_chunks?: number }>('transcription-queue-complete', (e) => {
        queueTotal.current = Number(e.payload?.total_chunks ?? 0);
      }),
      subscribe<{ phase?: string }>('transcription-error', (e) => {
        if (e.payload?.phase !== 'startup') update({ recognitionFailed: true });
      }),
      subscribe('transcript-error', () => update({ recognitionFailed: true })),
      subscribe('transcription-warning', () => update({ recognitionFailed: true })),
      // Остановка из трея: tray.rs шлёт recording-stop-complete после stop_recording
      subscribe<boolean>('recording-stop-complete', (e) => {
        const { finish: fin, handleRecordingStop: stop } = stopRef.current;
        if (e.payload === false) void stop(false);
        else void fin(stop);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [update]);

  const value = useMemo(() => ({ live, finishing, finish }), [live, finishing, finish]);
  return <RecordingOutcomeContext.Provider value={value}>{children}</RecordingOutcomeContext.Provider>;
}

export function useRecordingOutcome(): Ctx {
  const ctx = useContext(RecordingOutcomeContext);
  if (!ctx) throw new Error('useRecordingOutcome вне AidRecordingProvider');
  return ctx;
}
