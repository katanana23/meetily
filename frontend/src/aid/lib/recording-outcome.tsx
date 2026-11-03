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
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { toSegment } from './meeting';
import { subscribe } from './tauri-events';
import { isDiscarded, isHallucination, judgeRecording, type NoTextReason, type RecordingVerdict, type SpeechSegment } from './speech';
import { hasTranscriptionModel } from './model-check';
import { invoke } from '@tauri-apps/api/core';
import { expireDiscard, keepRecording, markDiscarded, markUnrecognized, purgeDiscarded, setDiscardLive } from './recording-marks';
import { t } from '@/aid/strings';

/** Сколько ждать «Вернуть» у несохранённой записи (чистое время, без пауз отсчёта). */
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

/**
 * Запись не сохранена: живое состояние у кнопки записи на 10 с вместо тоста.
 * Отсчёт стоит, пока пользователь на карточке (наведение, фокус, открытая
 * «Проверить звук») и пока окно приложения не в фокусе: 10 секунд считаются
 * только тогда, когда карточку видно и её никто не трогает.
 */
export interface DiscardNotice {
  verdict: 'no-speech' | 'too-little';
  /** Когда (Date.now()) истечёт отсчёт; null, пока отсчёт на паузе. */
  deadline: number | null;
  /** Сколько миллисекунд осталось на момент последней паузы или запуска. */
  remaining: number;
  /** Причина паузы отсчёта: 'hover', 'focus', 'dialog'. */
  hold: (reason: string, on: boolean) => void;
  restore: () => void;
  dismiss: () => void;
}

interface Ctx {
  live: LiveSpeech;
  /** Идёт оценка или запись не сохраняется: экран записи показывает «Завершаем запись». */
  finishing: 'judging' | 'discarding' | null;
  finish: (handleRecordingStop: StopHandler) => Promise<RecordingVerdict>;
  notice: DiscardNotice | null;
}

const EMPTY: LiveSpeech = { tracking: false, vadSegments: 0, textSegments: 0, lastSpeechAt: null, recognitionFailed: false };
const RecordingOutcomeContext = createContext<Ctx | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notifyNotSaved(silent: boolean) {
  try {
    await invoke('show_notification', {
      notification: {
        id: null,
        title: silent ? t('noSpeechNoticeTitle') : t('tooLittleNoticeTitle'),
        body: t('notSavedNotificationBody'),
        notification_type: 'RecordingStopped',
        priority: 'Normal',
        timeout: 'Default',
        icon: null,
        sound: false,
        actions: [],
      },
    });
  } catch (error) {
    console.info('[aid] Уведомление «Запись не сохранена» не показано:', error);
  }
}

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
  const [notice, setNotice] = useState<DiscardNotice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  /** Отсчёт карточки: остаток и момент запуска (null на паузе). */
  const countdown = useRef<{ remaining: number; startedAt: number | null; dismissed: boolean } | null>(null);
  const holds = useRef(new Set<string>());
  const expire = useRef<() => void>(() => undefined);

  /** Запустить или остановить отсчёт по текущим причинам паузы. */
  const sync = useCallback(() => {
    const c = countdown.current;
    if (!c) return;
    const now = Date.now();
    // Закрытую вручную карточку больше никто не видит: отсчёт идёт без пауз
    const held = !c.dismissed && holds.current.size > 0;
    if (held && c.startedAt !== null) {
      c.remaining = Math.max(0, c.remaining - (now - c.startedAt));
      c.startedAt = null;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    } else if (!held && c.startedAt === null) {
      c.startedAt = now;
      noticeTimer.current = setTimeout(() => expire.current(), c.remaining);
    } else return;
    const deadline = c.startedAt === null ? null : c.startedAt + c.remaining;
    setNotice((prev) => prev && { ...prev, deadline, remaining: c.remaining });
  }, []);

  const hold = useCallback(
    (reason: string, on: boolean) => {
      const had = holds.current.has(reason);
      if (on === had) return;
      if (on) holds.current.add(reason);
      else holds.current.delete(reason);
      sync();
    },
    [sync],
  );

  // Окно за другим приложением (остановили из трея, пока на экране Zoom): отсчёт ждёт
  useEffect(() => {
    const check = () => hold('window', document.visibilityState === 'hidden' || !document.hasFocus());
    check();
    window.addEventListener('focus', check);
    window.addEventListener('blur', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      window.removeEventListener('blur', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [hold]);

  // При запуске: удалить пустые записи, у которых окно «Вернуть» истекло, пока приложение было закрыто
  useEffect(() => {
    void purgeDiscarded();
  }, []);

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
        const name = sessionStorage.getItem('last_recording_meeting_name');
        try {
          sessionStorage.setItem(
            OUTCOME_KEY,
            JSON.stringify({ folder, verdict, vadSegments, recognitionFailed: liveRef.current.recognitionFailed } satisfies StoredOutcome),
          );
        } catch {
          /* страница встречи покажет общую причину */
        }

        if (!isDiscarded(verdict)) {
          // «Не распознано»: встреча сохраняется, но в общий список не попадает (раздел внизу)
          if (verdict === 'unrecognized') markUnrecognized(folder);
          setFinishing(null);
          await handle(true);
          return verdict;
        }

        // Речи не было или слишком мало: пометка «не сохранять» ставится сразу,
        // до любой записи в базу, поэтому такая встреча не появится в списке и не
        // откроется по адресу, даже если попадёт в базу другим путём. В базу не пишем
        // (оригинальный путь handleRecordingStop(false)); 10 секунд можно вернуть
        // запись тем же хуком, как при обычном сохранении. Через 10 секунд всё, что
        // успело попасть в базу с этой папкой, удаляется.
        markDiscarded(folder, name, RESTORE_WINDOW_MS);
        // Пока карточка открыта, срок ведёт её отсчёт: перечитывание списка запись не удалит
        setDiscardLive(folder, name, true);
        setFinishing('discarding');
        await handle(false);
        const gen = generation.current;
        expire.current(); // прошлая карточка, если была: её запись удаляется сейчас
        const close = () => {
          if (noticeTimer.current) clearTimeout(noticeTimer.current);
          noticeTimer.current = null;
          countdown.current = null;
          expire.current = () => undefined;
          setDiscardLive(folder, name, false);
          setNotice(null);
        };
        expire.current = () => {
          close();
          expireDiscard(folder, name);
          void purgeDiscarded();
        };
        countdown.current = { remaining: RESTORE_WINDOW_MS, startedAt: null, dismissed: false };
        setNotice({
          verdict: verdict as DiscardNotice['verdict'],
          deadline: null,
          remaining: RESTORE_WINDOW_MS,
          hold,
          // Закрыли вручную: отсчёт удаления идёт дальше, уже без пауз
          dismiss: () => {
            if (countdown.current) countdown.current.dismissed = true;
            setNotice(null);
            sync();
          },
          restore: () => {
            if (gen !== generation.current) return; // уже началась новая запись
            close();
            keepRecording(folder);
            void handleRecordingStop(true);
          },
        });
        sync();
        // Окно не на экране: системное уведомление, иначе карточку никто не увидит.
        // Через менеджер уведомлений ядра: он учитывает согласие, «Не беспокоить» и
        // настройку «Уведомлять об остановке записи»
        if (holds.current.has('window')) void notifyNotSaved(verdict === 'no-speech');
        return verdict;
      } finally {
        busy.current = false;
        setFinishing(null);
      }
    },
    [transcriptsRef, handleRecordingStop, hold, sync],
  );

  // Обработчики из ref: подписки живут всё время работы провайдера и не
  // переподписываются, когда меняются finish и handleRecordingStop.
  const stopRef = useRef({ finish, handleRecordingStop });
  stopRef.current = { finish, handleRecordingStop };

  useEffect(() => {
    const offs = [
      subscribe('recording-started', () => {
        generation.current++;
        // Новая запись: прошлую не вернуть, карточка закрывается, пустая запись удаляется
        expire.current();
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

  const value = useMemo(() => ({ live, finishing, finish, notice }), [live, finishing, finish, notice]);
  return <RecordingOutcomeContext.Provider value={value}>{children}</RecordingOutcomeContext.Provider>;
}

export function useRecordingOutcome(): Ctx {
  const ctx = useContext(RecordingOutcomeContext);
  if (!ctx) throw new Error('useRecordingOutcome вне AidRecordingProvider');
  return ctx;
}
