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
import { markDiscarded, markUnrecognized, purgeDiscarded } from './recording-marks';
import { formatLevel, isSilent, measureRecordingLevel } from './audio-level';
import { moveRecordingToTrash, purgeTrash } from './recording-trash';
import { t } from '@/aid/strings';

/**
 * Сколько показывать карточку «Тишина»: короткий заголовок, подсказка и одно
 * действие читаются за 3–4 с, с запасом 8 с. Под курсором, в фокусе и с открытой
 * «Проверить звук» время не идёт, но не дольше NOTICE_MAX_MS, чтобы карточка
 * не зависала (курсор просто остался на месте после «Остановить»).
 */
export const NOTICE_MS = 8_000;
export const NOTICE_MAX_MS = 30_000;
/**
 * Ключ sessionStorage: запись сохранена в «Не распознано», открывать её не нужно.
 * Оригинальный useRecordingStop через 2 с после сохранения сам переходит на страницу
 * встречи (?source=recording); страница встречи Aid по этой пометке сразу
 * возвращает туда, где был пользователь, а не показывает «Речь не распознана».
 */
export const STAY_KEY = 'aid.stayAfterSave';

/** Пометка «не открывать встречу» свежая (поставлена в последние 15 с): куда вернуться или null. */
export function takeStayPath(): string | null {
  try {
    const raw = sessionStorage.getItem(STAY_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STAY_KEY);
    const value = JSON.parse(raw) as { at: number; path: string };
    return Date.now() - value.at < 15_000 ? value.path || '/' : null;
  } catch {
    return null;
  }
}

/** Запись короче этого с парой фраз (меньше 15 слов) считается случайной и уходит в корзину. */
export const SHORT_RECORDING_SECONDS = 30;
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
  /** Секунды записи, когда детектор или распознавание слышали речь (для «Пульса разговора»). */
  speechTimes: number[];
}

export interface StoredOutcome {
  folder: string | null;
  verdict: RecordingVerdict;
  vadSegments: number;
  recognitionFailed: boolean;
}

type StopHandler = (save: boolean) => Promise<void>;

/** Запись не сохранена: короткая карточка у кнопки записи вместо тоста, с крестиком. */
export interface DiscardNotice {
  /** no-speech и too-little: запись не сохранена; unrecognized: сохранена в «Не распознано». */
  verdict: 'no-speech' | 'too-little' | 'unrecognized';
  /** Причина задержать карточку: 'hover', 'focus', 'dialog'. */
  hold: (reason: string, on: boolean) => void;
  dismiss: () => void;
}

interface Ctx {
  live: LiveSpeech;
  /** Идёт оценка, проверка звука или запись не сохраняется: экран записи показывает «Завершаем запись». */
  finishing: 'judging' | 'checking-sound' | 'discarding' | null;
  /** Решение уже принято, запись не сохраняется: почему (для заголовка «Тишина» или «Пара фраз»). */
  discardVerdict: 'no-speech' | 'too-little' | null;
  finish: (handleRecordingStop: StopHandler) => Promise<RecordingVerdict>;
  notice: DiscardNotice | null;
  /** Запись тихо сохраняется в «Не распознано»: экран «Сохранено» не показывается. */
  quiet: boolean;
}

const EMPTY: LiveSpeech = { tracking: false, vadSegments: 0, textSegments: 0, lastSpeechAt: null, recognitionFailed: false, speechTimes: [] };
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
  const [discardVerdict, setDiscardVerdict] = useState<Ctx['discardVerdict']>(null);
  const liveRef = useRef<LiveSpeech>(EMPTY);
  const segs = useRef<SpeechSegment[]>([]);
  /** Длины речевых сегментов без текста, если ядро когда-нибудь начнёт их присылать. */
  const vadDurations = useRef<number[]>([]);
  const queueTotal = useRef<number | null>(null);
  const seconds = useRef(0);
  const busy = useRef(false);
  const [notice, setNotice] = useState<DiscardNotice | null>(null);
  const [quiet, setQuiet] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Время показа карточки: остаток, момент запуска (null на паузе) и жёсткий срок. */
  const countdown = useRef<{ remaining: number; startedAt: number | null; hardStop: number } | null>(null);
  const holds = useRef(new Set<string>());
  const hardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (hardTimer.current) clearTimeout(hardTimer.current);
    noticeTimer.current = null;
    hardTimer.current = null;
    countdown.current = null;
    holds.current.clear();
    setNotice(null);
  }, []);

  /** Запустить или остановить время показа по текущим причинам задержки. */
  const sync = useCallback(() => {
    const c = countdown.current;
    if (!c) return;
    const now = Date.now();
    const held = holds.current.size > 0;
    if (held && c.startedAt !== null) {
      c.remaining = Math.max(0, c.remaining - (now - c.startedAt));
      c.startedAt = null;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    } else if (!held && c.startedAt === null) {
      c.startedAt = now;
      noticeTimer.current = setTimeout(closeNotice, Math.min(c.remaining, Math.max(0, c.hardStop - now)));
    }
  }, [closeNotice]);

  const hold = useCallback(
    (reason: string, on: boolean) => {
      if (on === holds.current.has(reason)) return;
      if (on) holds.current.add(reason);
      else holds.current.delete(reason);
      sync();
    },
    [sync],
  );

  const showNotice = useCallback(
    (verdict: DiscardNotice['verdict']) => {
      closeNotice();
      countdown.current = { remaining: NOTICE_MS, startedAt: null, hardStop: Date.now() + NOTICE_MAX_MS };
      hardTimer.current = setTimeout(closeNotice, NOTICE_MAX_MS);
      setNotice({ verdict, hold, dismiss: closeNotice });
      sync();
    },
    [closeNotice, hold, sync],
  );

  // Только в разработке: показать карточку итога по ?notice=no-speech|too-little|unrecognized,
  // чтобы смотреть её без записи. В сборке не работает
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const v = new URLSearchParams(window.location.search).get('notice');
    if (v === 'no-speech' || v === 'too-little' || v === 'unrecognized') showNotice(v as DiscardNotice['verdict']);
  }, [showNotice]);

  // При запуске: удалить из базы пустые записи, которые не успели удалить в прошлый
  // раз, и очистить корзину от записей старше 7 дней
  useEffect(() => {
    void purgeDiscarded();
    void purgeTrash();
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
        const folder = sessionStorage.getItem('last_recording_folder_path');
        const name = sessionStorage.getItem('last_recording_meeting_name');

        // Начало записи не видели (окно перезагрузили посреди записи): не выбрасываем
        if (isDiscarded(verdict) && !liveRef.current.tracking) {
          verdict = 'unrecognized';
          reason = 'начало записи не отслежено, сохраняем как есть';
        }

        // Текста нет. Это тишина или сломалось распознавание? Решает сам звук:
        // удаляется только запись, где и звук на уровне тишины, и текста нет.
        // Громче порога или не удалось измерить: «Не распознано» (audio-level.ts)
        let levelNote = 'не измерялся (есть текст)';
        // Пара фраз (меньше 15 слов). Короткая запись (меньше SHORT_RECORDING_SECONDS)
        // это случайный старт и стоп: не сохраняется и в корзину не идёт, файл звука
        // остаётся в папке записей, как у оригинала при «не сохранять».
        // Длинная с парой фраз в общий список не идёт: «Не распознано»
        let trashShort = false;
        if (verdict === 'too-little') {
          if (liveRef.current.tracking && seconds.current > 0 && seconds.current < SHORT_RECORDING_SECONDS) {
            trashShort = true;
            reason = `${reason}; запись короче ${SHORT_RECORDING_SECONDS} с, не сохраняем (без корзины)`;
          } else {
            verdict = 'unrecognized';
            reason = `${reason}; запись длинная, сохраняем в «Не распознано»`;
          }
        }
        if (isDiscarded(verdict)) {
          setFinishing('checking-sound');
          const measured = await measureRecordingLevel(folder, seconds.current || null);
          if (measured.kind === 'unknown') {
            levelNote = `не измерен: ${measured.reason}`;
            verdict = 'unrecognized';
            reason = `${reason}; уровень звука не измерен, сохраняем в «Не распознано»`;
          } else {
            levelNote = formatLevel(measured.level);
            if (!isSilent(measured.level)) {
              verdict = 'unrecognized';
              reason = `${reason}; звук выше порога тишины, сохраняем в «Не распознано»`;
            } else {
              reason = `${reason}; звук на уровне тишины, удаляем (папка в корзину)`;
            }
          }
          setFinishing('judging');
        }

        // Журнал решения: одна строка на каждую остановку (консоль окна; логгер
        // приложения tauri-plugin-log в ядре не подключён, из интерфейса недоступен)
        const fmt = (n: number | null) => (n === null ? 'нет данных' : `${n.toFixed(1)} с`);
        console.info(
          `[aid] Итог записи: длительность ${fmt(seconds.current)}, речь по детектору ${fmt(detectorSeconds)} ` +
            `(${vadSegments} сегм.), реплик ${judgement.segmentsBefore} → ${judgement.segmentsAfter} после чистки, ` +
            `слов ${judgement.words}, речь в репликах ${fmt(judgement.speechSeconds)}, ` +
            `модель ${model === null ? 'не проверена' : model ? 'есть' : 'нет'}, ` +
            `ошибка распознавания ${liveRef.current.recognitionFailed ? 'да' : 'нет'}, ` +
            `звук: ${levelNote} → ${verdict}: ${reason}`,
        );

        try {
          sessionStorage.setItem(
            OUTCOME_KEY,
            JSON.stringify({ folder, verdict, vadSegments, recognitionFailed: liveRef.current.recognitionFailed } satisfies StoredOutcome),
          );
        } catch {
          /* страница встречи покажет общую причину */
        }

        if (!isDiscarded(verdict) && !trashShort) {
          if (verdict === 'unrecognized') {
            // «Не распознано»: встреча сохраняется, но в общий список не попадает
            // (раздел внизу). Промежуточных экранов нет: ни «Сохранено», ни страницы
            // встречи с «Речь не распознана»; пользователь остаётся, где был, и видит
            // короткую карточку с крестиком
            markUnrecognized(folder);
            setQuiet(true);
            try {
              sessionStorage.setItem(STAY_KEY, JSON.stringify({ at: Date.now(), path: window.location.pathname + window.location.search }));
            } catch {
              /* без пометки откроется страница встречи, как раньше */
            }
            setFinishing(null);
            await handle(true);
            showNotice('unrecognized');
            setTimeout(() => setQuiet(false), 4000);
            return verdict;
          }
          setFinishing(null);
          await handle(true);
          return verdict;
        }

        // Тишина и нет текста: пометка «не сохранять» ставится сразу, до любой записи
        // в базу, поэтому такая встреча не появится в списке и не откроется по адресу,
        // даже если попадёт в базу другим путём. В базу не пишем (оригинальный путь
        // handleRecordingStop(false)); то, что успело попасть в базу с этой папкой,
        // удаляется сразу. Папка записи со звуком уходит в корзину на 7 дней
        // (recording-trash.ts), а не стирается.
        markDiscarded(folder, name, 0);
        setDiscardVerdict(verdict === 'too-little' ? 'too-little' : 'no-speech');
        setFinishing('discarding');
        await handle(false);
        void purgeDiscarded();
        // В корзину только тишина; пара фраз просто не сохраняется
        const trashed = trashShort ? null : await moveRecordingToTrash(folder, name);
        console.info(trashed ? `[aid] Папка пустой записи перенесена в корзину: ${trashed}` : `[aid] Папка пустой записи осталась на месте: ${folder}`);
        showNotice(verdict as DiscardNotice['verdict']);
        // Окно за другим приложением: системное уведомление, иначе карточку никто не увидит.
        // Через менеджер уведомлений ядра: он учитывает согласие, «Не беспокоить» и
        // настройку «Уведомлять об остановке записи»
        if (typeof document !== 'undefined' && (document.visibilityState === 'hidden' || !document.hasFocus())) {
          void notifyNotSaved(verdict === 'no-speech');
        }
        return verdict;
      } finally {
        busy.current = false;
        setFinishing(null);
        setDiscardVerdict(null);
      }
    },
    [transcriptsRef, handleRecordingStop, showNotice],
  );

  // Обработчики из ref: подписки живут всё время работы провайдера и не
  // переподписываются, когда меняются finish и handleRecordingStop.
  const stopRef = useRef({ finish, handleRecordingStop });
  stopRef.current = { finish, handleRecordingStop };

  useEffect(() => {
    const offs = [
      subscribe('recording-started', () => {
        // Новая запись: карточка о прошлой закрывается
        closeNotice();
        setQuiet(false);
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
        update({
          vadSegments: Math.max(liveRef.current.vadSegments, queued),
          lastSpeechAt: seconds.current,
          speechTimes: [...liveRef.current.speechTimes.slice(-2000), seconds.current],
        });
      }),
      subscribe<{ text?: string; duration?: number }>('transcript-update', (e) => {
        // Для подсчёта слов исходный текст: ядро не подписывает спикеров, а эвристика
        // toSegment приняла бы «Давайте договоримся: …» за имя спикера
        const raw = (e.payload?.text ?? '').trim();
        const text = toSegment({ text: raw } as never).text;
        const duration = typeof e.payload?.duration === 'number' ? e.payload.duration : null;
        segs.current = [...segs.current, { text: raw, duration }];
        if (/\p{L}/u.test(text) && !isHallucination(text)) {
          update({
            textSegments: liveRef.current.textSegments + 1,
            lastSpeechAt: seconds.current,
            speechTimes: [...liveRef.current.speechTimes.slice(-2000), seconds.current],
          });
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
  }, [update, closeNotice]);

  const value = useMemo(
    () => ({ live, finishing, discardVerdict, finish, notice, quiet }),
    [live, finishing, discardVerdict, finish, notice, quiet],
  );
  return <RecordingOutcomeContext.Provider value={value}>{children}</RecordingOutcomeContext.Provider>;
}

export function useRecordingOutcome(): Ctx {
  const ctx = useContext(RecordingOutcomeContext);
  if (!ctx) throw new Error('useRecordingOutcome вне AidRecordingProvider');
  return ctx;
}
