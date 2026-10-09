// Словарь «команда ядра → ответ». Покрывает все команды, которые вызывает
// интерфейс (grep по src), плюс команды плагинов Tauri.
// Ошибки возвращаются как в настоящем ядре: invoke отклоняется строкой.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MockBackend } from './backend';
import {
  MOCK_ROOT, audioBackends, audioDevices, builtinModels, notificationSettings, ollamaModels,
  parakeetModels, recordingPreferences, templates, whisperModels,
} from './fixtures/settings';

export type Args = Record<string, any> | undefined;
export type Handler = (args: Args, be: MockBackend) => unknown;

const ok = <T,>(v: T) => () => v;
const NULL = ok(null);
const TRUE = ok(true);
const FALSE = ok(false);
const warnNative = (what: string) => () => {
  console.warn(`[mock-tauri] ${what}: в браузере недоступно, заглушка ничего не делает`);
  return null;
};

/** Команды, которых нет в generate_handler! ядра. В настоящем приложении падают всегда. */
export const UNREGISTERED_COMMANDS = ['api_get_auto_generate_setting', 'builtin_ai_get_models_directory'];
/** Текст ошибки Tauri 2 для незарегистрированной команды. */
export const notFound = (cmd: string) => `command ${cmd} not found`;

/**
 * Сценарий error: эти команды отклоняются с текстами, похожими на настоящие
 * (строки взяты из src-tauri/src). Остальные работают, чтобы оболочка открылась.
 */
export const FAILING_COMMANDS: Record<string, string> = {
  api_get_meetings: 'error returned from database: (code: 5) database is locked',
  api_search_transcripts: 'error returned from database: (code: 5) database is locked',
  api_get_meeting: 'Failed to retrieve meeting: error returned from database: (code: 5) database is locked',
  api_get_meeting_metadata: 'Failed to retrieve meeting metadata: error returned from database: (code: 5) database is locked',
  api_get_meeting_transcripts: 'Failed to retrieve transcripts: error returned from database: (code: 5) database is locked',
  api_get_summary: 'Failed to get summary status: error returned from database: (code: 5) database is locked',
  api_process_transcript: 'Failed to start summary generation: model not configured',
  api_save_transcript: 'Failed to save transcript: disk I/O error',
  api_delete_meeting: 'Failed to delete meeting: database is locked',
  api_save_meeting_title: 'Failed to update meeting title: database is locked',
  api_list_templates: 'Failed to read templates directory: Permission denied (os error 13)',
  api_get_model_config: 'Failed to load model config: no rows returned by a query that expected to return at least one row',
  api_get_transcript_config: 'Failed to load transcript config: no rows returned by a query that expected to return at least one row',
  start_recording: 'Parakeet model not loaded. Please download a model first.',
  start_recording_with_devices_and_meeting: 'Parakeet model not loaded. Please download a model first.',
  get_ollama_models: 'Failed to connect to Ollama: error sending request for url',
  whisper_get_available_models: 'Whisper engine not initialized',
  parakeet_get_available_models: 'Parakeet engine not initialized',
  builtin_ai_list_models: 'Failed to read models directory: Permission denied (os error 13)',
  get_recording_preferences: 'Failed to load preferences: store file is corrupted',
  get_notification_settings: 'Failed to load notification settings: store file is corrupted',
  open_meeting_folder: 'Failed to open folder: No such file or directory (os error 2)',
};

const meetingMeta = (be: MockBackend, id: string) => {
  const m = be.find(id);
  if (!m) return Promise.reject(`Meeting not found: ${id}`);
  return { id: m.id, title: m.title, created_at: m.created_at, updated_at: m.updated_at, folder_path: m.folder_path };
};

export const handlers: Record<string, Handler> = {
  // ---------- онбординг и база ----------
  get_onboarding_status: (_a, be) =>
    be.onboardingCompleted
      ? {
          version: '1.0', completed: true, current_step: 4,
          model_status: { parakeet: 'downloaded', summary: 'downloaded', selected_summary_model: 'gemma3:1b' },
          last_updated: '2026-10-01T09:00:00Z',
        }
      : null,
  save_onboarding_status_cmd: NULL,
  complete_onboarding: (_a, be) => {
    be.onboardingCompleted = true;
    try {
      window.sessionStorage.setItem('meetily.mock.onboardingDone', '1');
    } catch {
      /* без sessionStorage после перезагрузки мастер покажется снова */
    }
    return null;
  },
  check_first_launch: (_a, be) => !be.onboardingCompleted,
  check_default_legacy_database: NULL,
  check_homebrew_database: NULL,
  detect_legacy_database: NULL,
  select_legacy_database_path: warnNative('Диалог выбора файла базы'),
  import_and_initialize_database: NULL,
  initialize_fresh_database: NULL,
  get_database_directory: ok(`${MOCK_ROOT}/data`),
  open_database_folder: warnNative('Открытие папки базы в Finder/Explorer'),

  // ---------- встречи ----------
  api_get_meetings: (_a, be) => be.meetings.map((m) => ({ id: m.id, title: m.title })),
  api_get_meeting: (a, be) => {
    const m = be.find(a?.meetingId);
    if (!m) return Promise.reject(`Meeting not found: ${a?.meetingId}`);
    return { id: m.id, title: m.title, created_at: m.created_at, updated_at: m.updated_at, transcripts: m.transcripts };
  },
  api_get_meeting_metadata: (a, be) => meetingMeta(be, a?.meetingId),
  api_get_meeting_transcripts: (a, be) => {
    const m = be.find(a?.meetingId);
    if (!m) return Promise.reject(`Meeting not found: ${a?.meetingId}`);
    const offset = Number(a?.offset ?? 0);
    const limit = Number(a?.limit ?? 100);
    const page = m.transcripts.slice(offset, offset + limit);
    return { transcripts: page, total_count: m.transcripts.length, has_more: offset + limit < m.transcripts.length };
  },
  api_search_transcripts: (a, be) => {
    const q = String(a?.query ?? '').toLowerCase().trim();
    if (!q) return [];
    const out: Array<{ id: string; title: string; matchContext: string; timestamp: string }> = [];
    for (const m of be.meetings) {
      const t = m.transcripts.find((s) => s.text.toLowerCase().includes(q));
      if (t) out.push({ id: m.id, title: m.title, matchContext: t.text.slice(0, 120), timestamp: t.timestamp });
    }
    return out;
  },
  api_save_transcript: (a, be) => ({
    meeting_id: be.addMeeting(a?.meetingTitle || 'New Meeting', a?.transcripts ?? [], a?.folderPath ?? null),
  }),
  api_delete_meeting: (a, be) => {
    be.meetings = be.meetings.filter((m) => m.id !== a?.meetingId);
    return null;
  },
  api_save_meeting_title: (a, be) => {
    const m = be.find(a?.meetingId);
    if (m) m.title = a?.title;
    return null;
  },
  get_meeting_folder_path: ok(`${MOCK_ROOT}/recordings/current`),
  open_meeting_folder: warnNative('Открытие папки встречи'),

  // ---------- резюме ----------
  api_get_summary: (a, be) => {
    const m = be.find(a?.meetingId);
    if (!m) return Promise.reject(`Meeting not found: ${a?.meetingId}`);
    const s = m.summary;
    return {
      status: s.status,
      meetingName: m.title,
      meeting_id: m.id,
      // интерфейс (SidebarProvider) сверяет start с process_id из api_process_transcript
      start: s.processId ?? (s.status === 'idle' ? null : m.created_at),
      end: s.status === 'completed' ? m.updated_at : null,
      data: s.markdown ? { markdown: s.markdown } : null,
      error: s.error ?? null,
    };
  },
  api_process_transcript: (a, be) => be.startSummary(a?.meetingId, a?.templateId),
  api_cancel_summary: (a, be) => {
    const m = be.find(a?.meetingId);
    if (m && m.summary.status === 'processing') m.summary = { status: 'cancelled', processId: m.summary.processId };
    return { cancelled: true, message: 'Summary generation cancelled', meeting_id: a?.meetingId };
  },
  api_save_meeting_summary: (a, be) => {
    const m = be.find(a?.meetingId);
    if (m) {
      const s = a?.summary;
      m.summary = { ...m.summary, status: 'completed', markdown: typeof s?.markdown === 'string' ? s.markdown : m.summary.markdown };
    }
    return { message: 'Summary saved (mock)' };
  },
  api_list_templates: ok(templates),
  api_get_meeting_summary_language: (a, be) => ({ language: be.find(a?.meetingId)?.summaryLanguage ?? null, storage: 'metadata' }),
  api_save_meeting_summary_language: (a, be) => {
    const m = be.find(a?.meetingId);
    if (m) m.summaryLanguage = a?.summaryLanguage ?? null;
    return { language: a?.summaryLanguage ?? null, storage: 'metadata' };
  },
  api_get_meeting_detected_summary_language: ok({ language: null, storage: 'metadata' }),
  api_save_meeting_detected_summary_language: (a) => ({ language: a?.detectedSummaryLanguage ?? null, storage: 'metadata' }),
  // Простейшая эвристика вместо детектора ядра: кириллица → ru, иначе en
  api_detect_transcript_summary_language: (a) => {
    const text = (a?.transcriptTexts ?? []).join(' ');
    if (!text.trim()) return { language: null, reason: 'empty' };
    return { language: /[а-яё]/i.test(text) ? 'ru' : 'en', reason: 'detected' };
  },
  api_get_auto_generate_setting: (_a) => Promise.reject(notFound('api_get_auto_generate_setting')),

  // ---------- конфигурация моделей ----------
  api_get_model_config: ok({ provider: 'builtin-ai', model: 'gemma3:1b', whisperModel: 'large-v3-turbo', apiKey: null, ollamaEndpoint: null }),
  api_save_model_config: NULL,
  api_get_api_key: ok(''),
  api_get_transcript_config: ok({ provider: 'parakeet', model: 'parakeet-tdt-0.6b-v3-int8', apiKey: null }),
  api_save_transcript_config: NULL,
  api_get_transcript_api_key: ok(''),
  api_get_custom_openai_config: NULL,
  api_save_custom_openai_config: ok({ status: 'success', message: 'Saved (mock)' }),
  api_test_custom_openai_connection: ok({ status: 'error', message: 'Заглушка: сетевые запросы к LLM не выполняются', http_status: 0 }),
  get_ollama_models: ok(ollamaModels),
  pull_ollama_model: (a, be) => be.simulateDownload('ollama', a?.modelName, 815),
  delete_ollama_model: NULL,
  get_openai_models: ok([{ id: 'mock-gpt-model' }]),
  get_anthropic_models: ok([{ id: 'mock-claude-model', display_name: 'Mock Claude model' }]),
  get_groq_models: ok([{ id: 'mock-groq-model' }]),
  get_openrouter_models: ok([{ id: 'mock/openrouter-model', name: 'Mock OpenRouter model' }]),
  set_language_preference: NULL,

  // ---------- Whisper ----------
  whisper_init: NULL,
  whisper_get_available_models: ok(whisperModels()),
  whisper_load_model: NULL,
  whisper_get_current_model: ok('large-v3-turbo'),
  whisper_is_model_loaded: TRUE,
  whisper_has_available_models: TRUE,
  whisper_validate_model_ready: ok('large-v3-turbo'),
  whisper_transcribe_audio: warnNative('Распознавание звука Whisper'),
  whisper_get_models_directory: ok(`${MOCK_ROOT}/models`),
  whisper_download_model: (a, be) => be.simulateDownload('whisper', a?.modelName, 466),
  whisper_cancel_download: (a, be) => be.cancelDownload('whisper', a?.modelName),
  whisper_delete_corrupted_model: ok('deleted'),
  open_models_folder: warnNative('Открытие папки моделей'),

  // ---------- Parakeet ----------
  parakeet_init: NULL,
  parakeet_get_available_models: (_a, be) =>
    parakeetModels(be.modelsReady).map((m) =>
      be.isDownloading('parakeet', m.name) ? { ...m, status: { Downloading: { progress: 50 } } } : m,
    ),
  parakeet_load_model: NULL,
  parakeet_get_current_model: (_a, be) => (be.modelsReady ? 'parakeet-tdt-0.6b-v3-int8' : null),
  parakeet_is_model_loaded: (_a, be) => be.modelsReady,
  parakeet_has_available_models: (_a, be) => be.modelsReady,
  parakeet_validate_model_ready: (_a, be) =>
    be.modelsReady ? 'parakeet-tdt-0.6b-v3-int8' : Promise.reject('No Parakeet models available. Please download a model first.'),
  parakeet_transcribe_audio: warnNative('Распознавание звука Parakeet'),
  parakeet_get_models_directory: ok(`${MOCK_ROOT}/models/parakeet`),
  parakeet_download_model: (a, be) => be.simulateDownload('parakeet', a?.modelName, 670),
  parakeet_retry_download: (a, be) => be.simulateDownload('parakeet', a?.modelName, 670),
  parakeet_cancel_download: (a, be) => be.cancelDownload('parakeet', a?.modelName),
  parakeet_delete_corrupted_model: ok('deleted'),
  open_parakeet_models_folder: warnNative('Открытие папки моделей Parakeet'),

  // ---------- встроенная модель резюме ----------
  builtin_ai_list_models: (_a, be) =>
    builtinModels(be.modelsReady).map((m) =>
      be.isDownloading('builtin', m.name) ? { ...m, status: { type: 'downloading', progress: 50 } } : m,
    ),
  builtin_ai_get_model_info: (a, be) => builtinModels(be.modelsReady).find((m) => m.name === a?.modelName) ?? null,
  builtin_ai_is_model_ready: (a, be) => be.modelsReady && a?.modelName === 'gemma3:1b',
  builtin_ai_get_available_summary_model: (_a, be) => (be.modelsReady ? 'gemma3:1b' : null),
  builtin_ai_get_recommended_model: ok('gemma3:1b'),
  builtin_ai_download_model: (a, be) => be.simulateDownload('builtin', a?.modelName, 1019),
  builtin_ai_cancel_download: (a, be) => be.cancelDownload('builtin', a?.modelName),
  builtin_ai_delete_model: NULL,
  builtin_ai_get_models_directory: () => Promise.reject(notFound('builtin_ai_get_models_directory')),

  // ---------- запись ----------
  is_recording: (_a, be) => be.recording,
  get_recording_state: (_a, be) => be.recordingState(),
  get_recording_meeting_name: (_a, be) => be.recordingTitle,
  start_recording: (_a, be) => be.startRecording(null),
  start_recording_with_devices_and_meeting: (a, be) => be.startRecording(a?.meetingName ?? null),
  stop_recording: (_a, be) => be.stop(),
  pause_recording: (_a, be) => be.pause(),
  resume_recording: (_a, be) => be.resume(),
  get_transcription_status: (_a, be) => be.transcriptionStatus(),
  get_transcript_history: ok([]),
  has_audio_checkpoints: FALSE,
  cleanup_checkpoints: NULL,
  recover_audio_from_checkpoints: () => {
    console.warn('[mock-tauri] recover_audio_from_checkpoints: аудио-чекпоинтов в браузере нет');
    return { status: 'none', chunk_count: 0, estimated_duration_seconds: 0, audio_file_path: null, message: 'Mock: no checkpoints' };
  },
  read_audio_file: () => {
    console.warn('[mock-tauri] read_audio_file: файлов на диске нет, возвращаю пустой буфер');
    return [];
  },

  // ---------- устройства и звук ----------
  get_audio_devices: ok(audioDevices),
  // настоящего звука нет: уровни синтетические
  start_audio_level_monitoring: (a, be) => be.startAudioLevels(a?.deviceNames ?? []),
  stop_audio_level_monitoring: (_a, be) => be.stopAudioLevels(),
  get_active_audio_output: ok({ device_name: 'Системный звук (заглушка)', is_bluetooth: false, sample_rate: 48000, device_type: 'Speaker' }),
  get_audio_backend_info: ok(audioBackends),
  get_current_audio_backend: ok('screencapturekit'),
  set_audio_backend: NULL,
  trigger_microphone_permission: TRUE,
  trigger_system_audio_permission_command: TRUE,
  open_system_settings: warnNative('Открытие системных настроек'),

  // ---------- настройки ----------
  get_recording_preferences: ok(recordingPreferences()),
  set_recording_preferences: NULL,
  get_default_recordings_folder_path: ok(`${MOCK_ROOT}/recordings`),
  open_recordings_folder: warnNative('Открытие папки записей'),
  get_notification_settings: ok(notificationSettings()),
  set_notification_settings: NULL,

  // ---------- импорт и ретранскрипция (бета) ----------
  select_and_validate_audio_command: warnNative('Диалог выбора аудиофайла'),
  validate_audio_file_command: (a) => ({
    path: a?.path ?? '/mock/import/запись.m4a',
    filename: String(a?.path ?? 'запись.m4a').split('/').pop(),
    duration_seconds: 1834,
    size_bytes: 29_400_000,
    format: 'm4a',
  }),
  start_import_audio_command: (_a, be) => {
    let p = 0;
    const t = setInterval(() => {
      p += 20;
      be.emit('import-progress', { stage: 'transcribing', progress_percentage: p, message: `Распознавание… ${p}%` });
      if (p >= 100) {
        clearInterval(t);
        const id = be.addMeeting('Импортированная запись (заглушка)', [], null);
        be.emit('import-complete', { meeting_id: id, title: 'Импортированная запись (заглушка)', segments_count: 0, duration_seconds: 1834 });
      }
    }, 600);
    return null;
  },
  cancel_import_command: NULL,
  start_retranscription_command: (a, be) => {
    let p = 0;
    const t = setInterval(() => {
      p += 25;
      be.emit('retranscription-progress', { meeting_id: a?.meetingId, stage: 'transcribing', progress_percentage: p, message: `Ретранскрипция… ${p}%` });
      if (p >= 100) {
        clearInterval(t);
        be.emit('retranscription-complete', { meeting_id: a?.meetingId, segments_count: be.find(a?.meetingId)?.transcripts.length ?? 0, duration_seconds: 600, language: 'ru' });
      }
    }, 600);
    return null;
  },
  cancel_retranscription_command: NULL,

  // ---------- консоль, ссылки ----------
  show_console: NULL,
  hide_console: NULL,
  toggle_console: NULL,
  open_external_url: (a) => {
    console.warn(`[mock-tauri] open_external_url: внешние ссылки в режиме заглушек не открываются (${a?.url})`);
    return null;
  },

  // ---------- аналитика: всё отключено ----------
  init_analytics: NULL,
  disable_analytics: NULL,
  is_analytics_enabled: FALSE,
  is_analytics_session_active: FALSE,
  start_analytics_session: ok('mock-session'),
  end_analytics_session: NULL,
  identify_user: NULL,
  track_event: NULL,
  track_analytics_disabled: NULL,
  track_analytics_enabled: NULL,
  track_analytics_transparency_viewed: NULL,
  track_custom_prompt_used: NULL,
  track_daily_active_user: NULL,
  track_feature_used: NULL,
  track_meeting_deleted: NULL,
  track_meeting_started: NULL,
  track_model_changed: NULL,
  track_recording_started: NULL,
  track_recording_stopped: NULL,
  track_settings_changed: NULL,
  track_summary_generation_completed: NULL,
  track_summary_regenerated: NULL,
  track_user_first_launch: NULL,
};

// ---------------- плагины Tauri ----------------

const stores = new Map<number, Map<string, unknown>>();
const storeByPath = new Map<string, number>();
let nextRid = 1;

export const pluginHandlers: Record<string, Handler> = {
  // plugin-store: хранилище в памяти, на диск ничего не пишется
  'plugin:store|load': (a) => {
    const path = String(a?.path);
    if (!storeByPath.has(path)) {
      const rid = nextRid++;
      storeByPath.set(path, rid);
      stores.set(rid, new Map(Object.entries(a?.options?.defaults ?? {})));
    }
    return storeByPath.get(path);
  },
  'plugin:store|get_store': (a) => storeByPath.get(String(a?.path)) ?? null,
  'plugin:store|get': (a) => {
    const s = stores.get(a?.rid);
    return s?.has(a?.key) ? [s.get(a?.key), true] : [null, false];
  },
  'plugin:store|set': (a) => { stores.get(a?.rid)?.set(a?.key, a?.value); return null; },
  'plugin:store|has': (a) => stores.get(a?.rid)?.has(a?.key) ?? false,
  'plugin:store|delete': (a) => stores.get(a?.rid)?.delete(a?.key) ?? false,
  'plugin:store|clear': (a) => { stores.get(a?.rid)?.clear(); return null; },
  'plugin:store|reset': (a) => { stores.get(a?.rid)?.clear(); return null; },
  'plugin:store|keys': (a) => [...(stores.get(a?.rid)?.keys() ?? [])],
  'plugin:store|values': (a) => [...(stores.get(a?.rid)?.values() ?? [])],
  'plugin:store|entries': (a) => [...(stores.get(a?.rid)?.entries() ?? [])],
  'plugin:store|length': (a) => stores.get(a?.rid)?.size ?? 0,
  'plugin:store|reload': NULL,
  'plugin:store|save': NULL,
  'plugin:resources|close': NULL,

  // app / path
  'plugin:app|version': ok('0.4.1-mock'),
  'plugin:app|name': ok('meetily'),
  'plugin:app|tauri_version': ok('2.x-mock'),
  'plugin:app|identifier': ok('com.meetily.mock'),
  'plugin:path|resolve_directory': ok(`${MOCK_ROOT}/AppData`),
  'plugin:path|join': (a) => (a?.paths ?? []).join('/'),

  // updater / process
  'plugin:updater|check': NULL, // обновлений нет
  'plugin:process|restart': () => { window.location.reload(); return null; },
  'plugin:process|exit': warnNative('Выход из приложения'),

  // notification
  'plugin:notification|is_permission_granted': FALSE,
  'plugin:notification|request_permission': ok('denied'),
  'plugin:notification|notify': warnNative('Системное уведомление'),
};
