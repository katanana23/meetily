// Строки интерфейса Aid Meetings. Русский по умолчанию; английский добавляется
// вторым словарём с теми же ключами.

const ru = {
  appName: 'Aid Meetings',
  loading: 'Загрузка…',
  retry: 'Повторить',
  back: 'Ко всем встречам',
  details: 'Подробности',

  // навигация и тема
  navMeetings: 'Встречи',
  navSettings: 'Настройки',
  themeLight: 'Светлая тема',
  themeDark: 'Тёмная тема',
  themeToLight: 'Включить светлую тему',
  themeToDark: 'Включить тёмную тему',

  // главная
  homeTitle: 'Встречи',
  homeSubtitle: 'Записи, транскрипты и итоги хранятся на этом компьютере',
  startRecording: 'Начать запись',
  importAudio: 'Импортировать аудио',
  searchMeetings: 'Найти встречу по названию',
  noMeetings: 'Пока нет ни одной встречи',
  noMeetingsHint: 'Нажмите «Начать запись», и транскрипт появится здесь, пока идёт разговор.',
  nothingFound: 'Ничего не нашлось',
  nothingFoundHint: 'Проверьте название или очистите поиск.',
  meetingsError: 'Не удалось загрузить список встреч',

  // запись
  recording: 'Идёт запись',
  paused: 'Пауза',
  stopRecording: 'Остановить',
  pauseRecording: 'Пауза',
  resumeRecording: 'Продолжить',
  liveTranscript: 'Транскрипт в реальном времени',
  waitingSpeech: 'Ждём речь',
  waitingSpeechHint: 'Реплики появятся здесь через несколько секунд после начала разговора.',
  saving: 'Сохраняем встречу',
  savingHint: 'Дописываем транскрипт и сохраняем запись. Окно можно не закрывать.',

  // встреча
  summary: 'Итоги',
  transcript: 'Транскрипт',
  noSummary: 'Итогов пока нет',
  noSummaryHint: 'Модель прочитает транскрипт и соберёт решения, задачи и главное. Это займёт до пары минут.',
  generateSummary: 'Сделать итоги',
  regenerateSummary: 'Попробовать снова',
  summaryProcessing: 'Готовим итоги',
  summaryProcessingHint: 'Модель читает транскрипт. Можно переключиться на вкладку «Транскрипт».',
  summaryFailed: 'Итоги не получились',
  emptyTranscript: 'В транскрипте нет ни одной реплики',
  loadMore: 'Показать ещё',
  segmentsCount: 'реплик',
  unknownSpeaker: 'Спикер',
  meetingNotFound: 'Встреча не найдена',
  meetingNotFoundHint: 'Возможно, её удалили. Вернитесь к списку встреч.',
  meetingError: 'Не удалось открыть встречу',

  // копирование
  copy: 'Копировать',
  copied: 'Скопировано',
  copyAsMarkdown: 'Как Markdown',
  copyFailed: 'Не получилось скопировать. Выделите текст и нажмите ⌘C.',

  // приватность
  privacy: 'Приватность',
  privacyLocal: 'Локально',
  privacyCloud: 'Облако',
  privacyUnknown: 'Неизвестно',
  privacyHintLocal: 'Звук, транскрипт и итоги не покидают этот компьютер.',
  privacyHintCloud: 'Часть данных отправляется провайдеру в интернете.',
  privacyHintUnknown: 'Не удалось понять, где обрабатываются данные. Проверьте модели в настройках.',
};

export type StringKey = keyof typeof ru;

export function t(key: StringKey): string {
  return ru[key] ?? key;
}
