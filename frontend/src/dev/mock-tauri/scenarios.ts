// Сценарии режима заглушек. Выбираются параметром адреса ?mock=<id>,
// выбор запоминается в sessionStorage, чтобы переживать переходы
// между страницами (router.push теряет query-параметр).

import { createFullMeetings } from './fixtures/meetings';
import { createLongMeetings } from './fixtures/long';
import type { MockMeeting } from './fixtures/types';

export type ScenarioId = 'empty' | 'full' | 'long' | 'recording' | 'error' | 'onboarding';

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
