// Строки интерфейса Aid Meetings.
// По умолчанию русский, структура готова под английский.

export type Lang = 'ru' | 'en';

const strings = {
  ru: {
    // Общие
    appName: 'Aid Meetings',
    loading: 'Загрузка…',
    error: 'Ошибка',
    retry: 'Повторить',
    cancel: 'Отменить',
    close: 'Закрыть',
    save: 'Сохранить',
    delete: 'Удалить',
    search: 'Поиск',

    // Главная
    homeTitle: 'Встречи',
    startRecording: 'Начать запись',
    importAudio: 'Импортировать аудио',
    searchMeetings: 'Найти встречу',
    recentMeetings: 'Последние встречи',
    noMeetings: 'Пока нет ни одной записи',
    noMeetingsHint: 'Нажмите «Начать запись», чтобы зафиксировать встречу',

    // Запись
    recording: 'Идёт запись',
    stopRecording: 'Остановить',
    pauseRecording: 'Пауза',
    resumeRecording: 'Продолжить',
    liveTranscript: 'Живой транскрипт',
    copyAll: 'Копировать всё',
    copiedAll: 'Скопировано',
    copySegment: 'Копировать',
    copyAsMarkdown: 'Как Markdown',
    recordingError: 'Не удалось начать запись',
    recordingErrorHint: 'Проверьте микрофон и системный звук в настройках',

    // Встреча
    meetingDetails: 'Детали встречи',
    summary: 'Итоги',
    transcript: 'Транскрипт',
    processing: 'Как это обработано',
    noSummary: 'Итогов пока нет',
    generateSummary: 'Сделать итоги',
    selectModel: 'Сначала выберите модель в настройках',
    copySummary: 'Копировать итоги',
    copyTranscript: 'Копировать транскрипт',
    copyAsMarkdownFull: 'Копировать как Markdown',
    duration: 'Длительность',
    date: 'Дата',

    // Приватность
    privacyLocal: 'Локально',
    privacyCloud: 'Облако',
    privacyUnknown: 'Неизвестно',
    privacyHintLocal: 'Все данные остаются на вашем устройстве',
    privacyHintCloud: 'Транскрипт и итоги обрабатываются на сервере провайдера',
    privacyHintUnknown: 'Не удалось определить, где обрабатываются данные',

    // Провайдеры
    providerOllama: 'Ollama',
    providerBuiltin: 'Встроенная модель',
    providerWhisper: 'Whisper',
    providerParakeet: 'Parakeet',
    providerClaude: 'Claude',
    providerGroq: 'Groq',
    providerOpenRouter: 'OpenRouter',
    providerOpenAI: 'OpenAI',
    providerCustom: 'Своя конфигурация',
  },

  en: {
    // Общие
    appName: 'Aid Meetings',
    loading: 'Loading…',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    delete: 'Delete',
    search: 'Search',

    // Главная
    homeTitle: 'Meetings',
    startRecording: 'Start Recording',
    importAudio: 'Import Audio',
    searchMeetings: 'Search Meetings',
    recentMeetings: 'Recent Meetings',
    noMeetings: 'No meetings yet',
    noMeetingsHint: 'Press "Start Recording" to capture your first meeting',

    // Запись
    recording: 'Recording',
    stopRecording: 'Stop',
    pauseRecording: 'Pause',
    resumeRecording: 'Resume',
    liveTranscript: 'Live Transcript',
    copyAll: 'Copy All',
    copiedAll: 'Copied',
    copySegment: 'Copy',
    copyAsMarkdown: 'As Markdown',
    recordingError: 'Failed to start recording',
    recordingErrorHint: 'Check your microphone and system audio in settings',

    // Встреча
    meetingDetails: 'Meeting Details',
    summary: 'Summary',
    transcript: 'Transcript',
    processing: 'Processing Info',
    noSummary: 'No summary yet',
    generateSummary: 'Generate Summary',
    selectModel: 'Please select a model in settings first',
    copySummary: 'Copy Summary',
    copyTranscript: 'Copy Transcript',
    copyAsMarkdownFull: 'Copy as Markdown',
    duration: 'Duration',
    date: 'Date',

    // Приватность
    privacyLocal: 'Local',
    privacyCloud: 'Cloud',
    privacyUnknown: 'Unknown',
    privacyHintLocal: 'All data stays on your device',
    privacyHintCloud: 'Transcript and summary processed on provider server',
    privacyHintUnknown: 'Could not determine where data is processed',

    // Провайдеры
    providerOllama: 'Ollama',
    providerBuiltin: 'Built-in Model',
    providerWhisper: 'Whisper',
    providerParakeet: 'Parakeet',
    providerClaude: 'Claude',
    providerGroq: 'Groq',
    providerOpenRouter: 'OpenRouter',
    providerOpenAI: 'OpenAI',
    providerCustom: 'Custom Configuration',
  },
};

let currentLang: Lang = 'ru';

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function t(key: keyof typeof strings.ru): string {
  return strings[currentLang][key] || key;
}

export default strings.ru;
