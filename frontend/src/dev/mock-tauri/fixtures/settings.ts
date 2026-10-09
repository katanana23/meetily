// Модели, устройства и настройки. Имена моделей совпадают с реальными
// (их ищет код интерфейса), всё остальное вымышлено.

export const MOCK_ROOT = '/mock/Meetily';

export const audioDevices = [
  { name: 'Встроенный микрофон (заглушка)', device_type: 'Input' as const },
  { name: 'USB-гарнитура «Сойка» (заглушка)', device_type: 'Input' as const },
  { name: 'Системный звук (заглушка)', device_type: 'Output' as const },
  { name: 'Виртуальный кабель (заглушка)', device_type: 'Output' as const },
];

type WhisperStatus = 'Available' | 'Missing';

const whisper = (name: string, size_mb: number, accuracy: string, speed: string, status: WhisperStatus) => ({
  name, size_mb, accuracy, speed, status,
  path: `${MOCK_ROOT}/models/ggml-${name}.bin`,
  description: undefined,
});

export function whisperModels() {
  return [
    whisper('tiny', 39, 'Decent', 'Very Fast', 'Missing'),
    whisper('base', 142, 'Good', 'Fast', 'Available'),
    whisper('small', 466, 'Good', 'Medium', 'Missing'),
    whisper('medium', 1463, 'High', 'Slow', 'Missing'),
    whisper('large-v3-turbo', 1549, 'High', 'Medium', 'Available'),
    whisper('large-v3', 2951, 'High', 'Slow', 'Missing'),
  ];
}

export function parakeetModels(available: boolean) {
  return [
    {
      name: 'parakeet-tdt-0.6b-v3-int8', size_mb: 670, accuracy: 'High', speed: 'Ultra Fast',
      quantization: 'Int8', status: available ? 'Available' : 'Missing',
      path: `${MOCK_ROOT}/models/parakeet/parakeet-tdt-0.6b-v3-int8`,
      description: 'Real time, optimized for speed',
    },
    {
      name: 'parakeet-tdt-0.6b-v2-int8', size_mb: 661, accuracy: 'High', speed: 'Very Fast',
      quantization: 'Int8', status: 'Missing',
      path: `${MOCK_ROOT}/models/parakeet/parakeet-tdt-0.6b-v2-int8`,
      description: 'Smaller size with good accuracy',
    },
  ];
}

export function builtinModels(available: boolean) {
  const st = (ok: boolean) => (ok ? { type: 'available' } : { type: 'not_downloaded' });
  return [
    { name: 'gemma3:1b', display_name: 'Gemma 3 1B (Fast)', status: st(available), path: `${MOCK_ROOT}/models/summary/gemma-3-1b.gguf`, size_mb: 1019, context_size: 32768, description: 'Fastest model. Good for quick summaries.', gguf_file: 'gemma-3-1b-it-Q8_0.gguf' },
    { name: 'gemma3:4b', display_name: 'Gemma 3 4B (Balanced)', status: st(false), path: `${MOCK_ROOT}/models/summary/gemma-3-4b.gguf`, size_mb: 2374, context_size: 32768, description: 'Balanced model.', gguf_file: 'gemma-3-4b-it-Q4_K_M.gguf' },
    { name: 'qwen3.5:2b', display_name: 'Qwen 3.5 2B (Balanced)', status: st(false), path: `${MOCK_ROOT}/models/summary/qwen3.5-2b.gguf`, size_mb: 1221, context_size: 32768, description: 'Balanced Qwen model.', gguf_file: 'Qwen3.5-2B-Q4_K_M.gguf' },
  ];
}

export const ollamaModels = [
  { name: 'llama3.2:3b', id: 'mock0001', size: '2.0 GB', modified: '3 weeks ago' },
  { name: 'gemma3:1b', id: 'mock0002', size: '815 MB', modified: '5 days ago' },
];

export const templates = [
  { id: 'standard_meeting', name: 'Standard Meeting Notes', description: 'A standard template for general meetings, focusing on key outcomes and actions.' },
  { id: 'daily_standup', name: 'Daily Standup', description: 'Time-boxed daily updates for engineering/product teams.' },
  { id: 'project_sync', name: 'Project Sync / Status Update', description: 'Weekly or bi-weekly project status meeting focusing on milestones and risks.' },
  { id: 'retrospective', name: 'Retrospective (Agile)', description: 'Sprint retrospective template for continuous improvement.' },
  { id: 'sales_marketing_client_call', name: 'Client / Sales Meeting', description: 'Capture client goals, deliverables, and next steps.' },
  { id: 'psychatric_session', name: 'Psychiatric Session Note (SOAP + AI Hybrid)', description: 'AI-assisted psychiatric progress note template based on SOAP, with clinical metadata and AI summary.' },
];

export function notificationSettings() {
  return {
    recording_notifications: true,
    time_based_reminders: false,
    meeting_reminders: false,
    respect_do_not_disturb: true,
    notification_sound: true,
    system_permission_granted: true,
    consent_given: true,
    manual_dnd_mode: false,
    notification_preferences: {
      show_recording_started: true,
      show_recording_stopped: true,
      show_recording_paused: true,
      show_recording_resumed: true,
      show_transcription_complete: true,
      show_meeting_reminders: false,
      show_system_errors: true,
      meeting_reminder_minutes: [5],
    },
  };
}

export function recordingPreferences() {
  return {
    save_folder: `${MOCK_ROOT}/recordings`,
    auto_save: true,
    file_format: 'mp4',
    preferred_mic_device: null as string | null,
    preferred_system_device: null as string | null,
  };
}

export const audioBackends = [
  { id: 'screencapturekit', name: 'ScreenCaptureKit', description: 'Заглушка: системный звук через ScreenCaptureKit' },
  { id: 'coreaudio', name: 'Core Audio', description: 'Заглушка: системный звук через Core Audio tap' },
];
