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
import { isHallucination, judgeRecording, measureSpeech, MIN_MEANINGFUL_WORDS, type NoTextReason, type RecordingVerdict, type SpeechSegment } from './speech';
import { hasTranscriptionModel } from './model-check';
import { invoke } from '@tauri-apps/api/core';
import { markDiscarded, purgeDiscarded } from './recording-marks';
import { purgeExpiredTrash } from './meeting-trash';
import { t } from '@/aid/strings';

/**
 * Сколько показывать карточку «Тишина»: короткий заголовок, подсказка и одно
 * действие читаются за 3–4 с, с запасом 8 с. Под курсором, в фокусе и с открытой
 * «Проверить звук» время не идёт, но не дольше NOTICE_MAX_MS, чтобы карточка
 * не зависала (курсор просто остался на месте после «Остановить»).
 */
export const NOTICE_MS = 8_000;
export const NOTICE_MAX_MS = 30_000;
/** «Запись отменена: она была пустой» тихая: уходит сама через 3 с, наведение её не держит. */
export const CANCELLED_NOTICE_MS = 3_000;
/**
 * Детектор слышал речь, а слов пока меньше порога: ждём, пока ядро допишет последние
 * фразы (очередь распознавания пуста), не дольше этого, и только потом решаем.
 * Иначе короткая запись, чьи реплики ещё распознаются, ушла бы как «ничего не записалось».
 */
const LATE_TEXT_WAIT_MS = 20_000;
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
  /**
   * Встреча не создана, почему: cancelled — короткая пустая запись, тихо отменена;
   * no-speech — длиннее, речи не слышно; unrecognized — речь слышали, текста нет.
   */
  verdict: 'cancelled' | 'no-speech' | 'unrecognized';
  /** Причина задержать карточку: 'hover', 'focus', 'dialog'. */
  hold: (reason: string, on: boolean) => void;
  dismiss: () => void;
}

interface Ctx {
  live: LiveSpeech;
  /**
   * judging: идёт оценка (карточка у кнопки записи: «Дописываю реплики»);
   * discarding: речи нет, встреча не создаётся (карточка «запись не сохранена», строки нет).
   */
  finishing: 'judging' | 'discarding' | null;
  finish: (handleRecordingStop: StopHandler) => Promise<RecordingVerdict>;
  /**
   * Запись остановлена страховкой микрофона (с микрофона только нули): не сохраняется
   * и в корзину не идёт, без карточки итога (вместо неё карточка про микрофон).
   */
  abandon: (handleRecordingStop: StopHandler) => Promise<void>;
  notice: DiscardNotice | null;
}

const EMPTY: LiveSpeech = { tracking: false, vadSegments: 0, textSegments: 0, lastSpeechAt: null, recognitionFailed: false, speechTimes: [] };
const RecordingOutcomeContext = createContext<Ctx | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notifyNotSaved() {
  try {
    await invoke('show_notification', {
      notification: {
        id: null,
        title: t('noSpeechNoticeTitle'),
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
    (verdict: DiscardNotice['verdict'], persist = false) => {
      closeNotice();
      // Предпросмотр в разработке: карточка стоит, пока адрес тот же
      if (persist) {
        setNotice({ verdict, hold, dismiss: closeNotice });
        return;
      }
      // Тихая отмена уходит сама через 3 с и не задерживается под курсором
      const ms = verdict === 'cancelled' ? CANCELLED_NOTICE_MS : NOTICE_MS;
      const max = verdict === 'cancelled' ? CANCELLED_NOTICE_MS : NOTICE_MAX_MS;
      countdown.current = { remaining: ms, startedAt: null, hardStop: Date.now() + max };
      hardTimer.current = setTimeout(closeNotice, max);
      setNotice({ verdict, hold, dismiss: closeNotice });
      sync();
    },
    [closeNotice, hold, sync],
  );

  // Только в разработке: показать карточку отбракованной записи по ?finish=discarded
  // («Слишком коротко») или ?notice=cancelled|no-speech|unrecognized, чтобы смотреть её без
  // записи. В сборке не работает
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get('finish') === 'discarded' ? 'cancelled' : params.get('notice');
    if (v === 'cancelled' || v === 'no-speech' || v === 'unrecognized') showNotice(v, true);
  }, [showNotice]);

  // При запуске: удалить из базы пустые записи, которые не успели удалить в прошлый
  // раз, и очистить корзину (удалённое человеком) от записей старше 7 дней
  useEffect(() => {
    void purgeDiscarded();
    void purgeExpiredTrash();
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
        const collect = (): SpeechSegment[] => {
          const own = segs.current;
          const fromContext: SpeechSegment[] = transcriptsRef.current.map((t) => ({
            text: (t.text ?? '').trim(),
            duration: typeof t.duration === 'number' ? t.duration : null,
          }));
          return own.length >= fromContext.length ? own : fromContext;
        };
        const vadSegments = () => Math.max(liveRef.current.vadSegments, queueTotal.current ?? 0);
        // Детектор слышал речь, а слов меньше порога: последние фразы могут ещё распознаваться
        // (у короткой записи это почти весь текст). Ждём пустую очередь, потом решаем
        let waited = 0;
        if (vadSegments() > 0 && measureSpeech(collect()).words < MIN_MEANINGFUL_WORDS) {
          const t0 = Date.now();
          while (Date.now() - t0 < LATE_TEXT_WAIT_MS && measureSpeech(collect()).words < MIN_MEANINGFUL_WORDS) {
            try {
              const st = await invoke<{ is_processing?: boolean; chunks_in_queue?: number }>('get_transcription_status');
              if (!st?.is_processing && !st?.chunks_in_queue) break;
            } catch {
              break;
            }
            await sleep(300);
          }
          // Событие с текстом последнего чанка приходит чуть позже, чем очередь пустеет
          await sleep(600);
          waited = Date.now() - t0;
        }
        const segments = collect();
        const vad = vadSegments();
        // Секунды речи по детектору (для журнала): длины речевых сегментов, о которых ядро сообщило
        const known = [...segments.map((x) => x.duration), ...vadDurations.current].filter(
          (d): d is number => typeof d === 'number' && Number.isFinite(d),
        );
        const detectorSeconds = known.length ? known.reduce((a, b) => a + b, 0) : null;
        const model = await hasTranscriptionModel();
        const noTextReason: NoTextReason | null =
          model === false ? 'no-model' : liveRef.current.recognitionFailed ? 'recognition-error' : null;

        const judgement = judgeRecording({
          segments,
          vadSegments: vad,
          detectorSeconds,
          noTextReason,
          durationSec: liveRef.current.tracking ? seconds.current : null,
        });
        let verdict = judgement.verdict;
        let reason = judgement.reason;
        const folder = sessionStorage.getItem('last_recording_folder_path');
        const name = sessionStorage.getItem('last_recording_meeting_name');

        // Начало записи не видели (окно перезагрузили посреди записи): не выбрасываем,
        // сохраняем как есть обычной встречей
        if (verdict !== 'speech' && !liveRef.current.tracking) {
          verdict = 'speech';
          reason = 'начало записи не отслежено, сохраняем как есть';
        }

        // Журнал решения: одна строка на каждую остановку (консоль окна; логгер
        // приложения tauri-plugin-log в ядре не подключён, из интерфейса недоступен)
        const fmt = (n: number | null) => (n === null ? 'нет данных' : `${n.toFixed(1)} с`);
        console.info(
          `[aid] Итог записи: длительность ${fmt(seconds.current)}, речь по детектору ${fmt(detectorSeconds)} ` +
            `(${vad} сегм.), реплик ${judgement.segmentsBefore} → ${judgement.segmentsAfter} после чистки, ` +
            `слов ${judgement.words}, ожидание последних фраз ${waited} мс, ` +
            `модель ${model === null ? 'не проверена' : model ? 'есть' : 'нет'}, ` +
            `ошибка распознавания ${liveRef.current.recognitionFailed ? 'да' : 'нет'} → ${verdict}: ${reason}`,
        );

        try {
          sessionStorage.setItem(
            OUTCOME_KEY,
            JSON.stringify({ folder, verdict, vadSegments: vad, recognitionFailed: liveRef.current.recognitionFailed } satisfies StoredOutcome),
          );
        } catch {
          /* страница встречи покажет общую причину */
        }

        if (verdict === 'speech') {
          setFinishing(null);
          await handle(true);
          return verdict;
        }

        // Текста нет: встреча не создаётся (раздела «Не распознано» нет). Строка обработки в
        // списке гаснет (finishing 'discarding' → фаза null), карточка у кнопки записи та же,
        // с итогом по контексту: короткая запись — «Слишком коротко - запись не сохранена»
        // (уходит сама через 3 с); длиннее, детектор молчал — «Речи не было» с «Проверить
        // звук»; детектор слышал речь — «Речь не распознана». Файл звука остаётся в
        // папке записей, как у оригинала при «не сохранять». Пометка «не сохранять» ставится до любой записи в базу, поэтому
        // такая встреча не появится в списке и не откроется по адресу. В базу не пишем
        // (оригинальный путь handleRecordingStop(false)); то, что успело попасть в базу
        // с этой папкой, удаляется. В корзину ничего не уходит: корзина только для
        // удалённого человеком; файл звука остаётся в папке записей, как у оригинала.
        markDiscarded(folder, name, 0);
        setFinishing('discarding');
        showNotice(verdict);
        await handle(false);
        void purgeDiscarded();
        // Окно за другим приложением: системное уведомление, иначе карточку никто не увидит.
        // Через менеджер уведомлений ядра: он учитывает согласие, «Не беспокоить» и
        // настройку «Уведомлять об остановке записи»
        if (verdict === 'no-speech' && typeof document !== 'undefined' && (document.visibilityState === 'hidden' || !document.hasFocus())) {
          void notifyNotSaved();
        }
        return verdict;
      } finally {
        busy.current = false;
        setFinishing(null);
      }
    },
    [transcriptsRef, showNotice],
  );

  const abandon = useCallback(async (handle: StopHandler) => {
    if (busy.current) return;
    busy.current = true;
    setFinishing('discarding');
    try {
      // Папку записи ядро сообщает событием recording-stopped (useRecordingStop)
      for (let i = 0; i < 30 && !sessionStorage.getItem('last_recording_folder_path'); i++) await sleep(100);
      const folder = sessionStorage.getItem('last_recording_folder_path');
      const name = sessionStorage.getItem('last_recording_meeting_name');
      markDiscarded(folder, name, 0);
      await handle(false);
      void purgeDiscarded();
      console.info(`[aid] Итог записи: с микрофона только нули, не сохраняем (без корзины), папка ${folder ?? 'неизвестна'}`);
    } finally {
      busy.current = false;
      setFinishing(null);
    }
  }, []);

  // Обработчики из ref: подписки живут всё время работы провайдера и не
  // переподписываются, когда меняются finish и handleRecordingStop.
  const stopRef = useRef({ finish, handleRecordingStop });
  stopRef.current = { finish, handleRecordingStop };

  useEffect(() => {
    const offs = [
      subscribe('recording-started', () => {
        // Новая запись: карточка о прошлой закрывается
        closeNotice();
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
    () => ({ live, finishing, finish, abandon, notice }),
    [live, finishing, finish, abandon, notice],
  );
  return <RecordingOutcomeContext.Provider value={value}>{children}</RecordingOutcomeContext.Provider>;
}

export function useRecordingOutcome(): Ctx {
  const ctx = useContext(RecordingOutcomeContext);
  if (!ctx) throw new Error('useRecordingOutcome вне AidRecordingProvider');
  return ctx;
}
