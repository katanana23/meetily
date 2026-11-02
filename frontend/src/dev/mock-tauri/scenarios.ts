// Сценарии режима заглушек. Выбираются параметром адреса ?mock=<id>,
// выбор запоминается в sessionStorage, чтобы переживать переходы
// между страницами (router.push теряет query-параметр).

import { createFullMeetings } from './fixtures/meetings';
import { createLongMeetings } from './fixtures/long';
import { createEdgeMeetings } from './fixtures/edge';
import type { MockMeeting } from './fixtures/types';

export type ScenarioId =
  | 'empty' | 'full' | 'long' | 'recording' | 'error' | 'onboarding'
  | 'silence-5s' | 'silence-hallucination' | 'one-phrase' | 'heard-no-text' | 'mid-silence'
  | 'long-empty' | 'sparse' | 'no-model' | 'no-permission';

/**
 * Что «ядро» присылает во время записи. Речевой сегмент после VAD приходит
 * событием transcription-progress, распознанный текст событием transcript-update.
 * - normal: речь и текст по кругу;
 * - none: тишина, VAD молчит;
 * - few: три реплики, потом тишина;
 * - hallucination: тишина, на один шумовой сегмент модель выдаёт «Продолжение следует...»;
 * - one-phrase: одна фраза «Созвон переносим на пятницу», потом тишина;
 * - vad-only: VAD слышит речь, но текста нет (модель не распознаёт);
 * - then-silence: пять реплик, потом тишина и скачок времени на silenceJumpSec.
 */
export type LiveMode = 'normal' | 'none' | 'few' | 'hallucination' | 'one-phrase' | 'vad-only' | 'then-silence';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  /** Встречи в «базе» на старте. */
  meetings: () => MockMeeting[];
  /** Онбординг пройден (false — покажется мастер первого запуска). */
  onboardingCompleted: boolean;
  /** Модели транскрипции и резюме уже скачаны. */
  modelsReady: boolean;
  /** «Ядро» уже пишет встречу в момент загрузки страницы. */
  recordingOnLoad: boolean;
  /** Команды падают (см. FAILING_COMMANDS в handlers.ts). */
  failing: boolean;
  /** Реплики во время записи: как обычно, ни одной или только три. */
  live?: LiveMode;
  /** Запись «началась» столько секунд назад: длинная запись без ожидания. */
  startOffsetSec?: number;
  /** then-silence: на сколько секунд «перематывается» время после последней реплики. */
  silenceJumpSec?: number;
  /** false: нет доступа к микрофону (в списке устройств нет входов). */
  micPermission?: boolean;
  /** Уведомления как в ядре по умолчанию: согласие есть, показ выключен. */
  notificationsCoreDefault?: boolean;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  empty: {
    id: 'empty', label: 'empty', description: 'Нет ни одной встречи',
    meetings: () => [], onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  full: {
    id: 'full', label: 'full', description: '9 встреч: резюме всех 6 шаблонов, задачи, транскрипты',
    meetings: createFullMeetings, onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  long: {
    id: 'long', label: 'long', description: 'Встреча на 3 часа (2100 реплик) и 45 встреч в сайдбаре',
    meetings: createLongMeetings, onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
  },
  recording: {
    id: 'recording', label: 'recording', description: 'Идёт запись: реплики приходят по таймеру, есть пауза',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
  },
  error: {
    id: 'error', label: 'error', description: 'Команды ядра падают с ошибками',
    meetings: () => [], onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: true,
  },
  onboarding: {
    id: 'onboarding', label: 'onboarding', description: 'Первый запуск: мастер настройки, модели не скачаны',
    meetings: () => [], onboardingCompleted: false, modelsReady: false, recordingOnLoad: false, failing: false,
  },
  'silence-5s': {
    id: 'silence-5s', label: 'silence-5s', description: 'Тишина: VAD ничего не слышит, реплик нет. Остановите через 5 секунд',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'none',
  },
  'silence-hallucination': {
    id: 'silence-hallucination', label: 'silence-hallucination', description: 'Три минуты тишины, на шум модель выдала «Продолжение следует...»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'hallucination', startOffsetSec: 180,
  },
  'one-phrase': {
    id: 'one-phrase', label: 'one-phrase', description: '20 секунд и одна фраза «Созвон переносим на пятницу»: встреча должна сохраниться',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'one-phrase', startOffsetSec: 15,
  },
  'heard-no-text': {
    id: 'heard-no-text', label: 'heard-no-text', description: 'VAD слышит речь, но распознавание не даёт текста: встреча сохраняется как «Речь не распознана»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'vad-only', startOffsetSec: 30,
  },
  'mid-silence': {
    id: 'mid-silence', label: 'mid-silence', description: 'Пять реплик, потом две с лишним минуты тишины: подсказка «Остановить?»',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: true, failing: false,
    live: 'then-silence', silenceJumpSec: 130,
  },
  'long-empty': {
    id: 'long-empty', label: 'long-empty', description: 'Запись на 5 минут без единой реплики (подсказка «Не слышу речи») и такая же сохранённая встреча',
    meetings: () => [...createEdgeMeetings(), ...createFullMeetings().slice(0, 2)], onboardingCompleted: true, modelsReady: true,
    recordingOnLoad: true, failing: false, live: 'none', startOffsetSec: 300,
  },
  sparse: {
    id: 'sparse', label: 'sparse', description: 'Запись, в которой распознаны только три реплики',
    meetings: () => [...createEdgeMeetings(), ...createFullMeetings().slice(0, 2)], onboardingCompleted: true, modelsReady: true,
    recordingOnLoad: true, failing: false, live: 'few', startOffsetSec: 40,
  },
  'no-model': {
    id: 'no-model', label: 'no-model', description: 'Мастер пройден, но модель распознавания не скачана; уведомления как в ядре по умолчанию',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: false, recordingOnLoad: false, failing: false,
    notificationsCoreDefault: true,
  },
  'no-permission': {
    id: 'no-permission', label: 'no-permission', description: 'Нет доступа к микрофону и записи экрана',
    meetings: () => createFullMeetings().slice(0, 3), onboardingCompleted: true, modelsReady: true, recordingOnLoad: false, failing: false,
    micPermission: false,
  },
};

export const DEFAULT_SCENARIO: ScenarioId = 'full';
export const SCENARIO_STORAGE_KEY = 'meetily.mock.scenario';
/** Значение ?mock=off отключает заглушки до конца сессии вкладки. */
export const MOCK_OFF = 'off';

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Читает сценарий из адреса, иначе из sessionStorage, иначе берёт по умолчанию. */
export function resolveScenarioId(): ScenarioId | typeof MOCK_OFF {
  const fromUrl = new URLSearchParams(window.location.search).get('mock');
  const storage = safeSession();
  if (fromUrl) {
    if (fromUrl === MOCK_OFF || fromUrl in SCENARIOS) {
      storage?.setItem(SCENARIO_STORAGE_KEY, fromUrl);
      return fromUrl as ScenarioId | typeof MOCK_OFF;
    }
    console.warn(`[mock-tauri] Неизвестный сценарий "${fromUrl}", беру "${DEFAULT_SCENARIO}". Есть: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const saved = storage?.getItem(SCENARIO_STORAGE_KEY);
  if (saved && (saved === MOCK_OFF || saved in SCENARIOS)) return saved as ScenarioId | typeof MOCK_OFF;
  return DEFAULT_SCENARIO;
}

/** Переключает сценарий: сохраняет выбор и перезагружает текущую страницу. */
export function switchScenario(id: ScenarioId) {
  const storage = safeSession();
  storage?.setItem(SCENARIO_STORAGE_KEY, id);
  // флаги сценария (например, пройденный онбординг) сбрасываем
  storage?.removeItem(ONBOARDING_DONE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set('mock', id);
  window.location.href = url.toString();
}

/** В сценарии onboarding после «Завершить» приложение перезагружается; помним, что мастер пройден. */
export const ONBOARDING_DONE_KEY = 'meetily.mock.onboardingDone';
