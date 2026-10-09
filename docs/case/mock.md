# Режим заглушек: интерфейс Meetily в обычном браузере

Интерфейс можно открыть через `pnpm dev`, без сборки Tauri и Rust. Все вызовы ядра (`invoke`) и события (`listen`) перехватывает слой заглушек на встроенном модуле `@tauri-apps/api/mocks`. Компоненты и места вызова не менялись.

## Как запустить

```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:3118
```

Откройте в браузере, например:

- `http://localhost:3118/?mock=full` — главная;
- `http://localhost:3118/meeting-details?id=mock-sync-granat&mock=full` — детали встречи;
- `http://localhost:3118/settings?mock=full` — настройки.

Без параметра `?mock` берётся последний выбранный сценарий, а если его нет, то `full`. Выбор хранится в `sessionStorage`: при переходах внутри приложения `router.push` теряет query-параметр, а сценарий остаётся. `?mock=off` отключает заглушки до закрытия вкладки.

В правом нижнем углу висит плашка `MOCK · <сценарий>`. По клику она раскрывается в список сценариев, клик по сценарию перезагружает текущую страницу с ним. Плашка появляется только в режиме заглушек.

### Когда заглушки включаются

Условия в `frontend/src/dev/mock-tauri/bootstrap.ts`, все три сразу:

1. `process.env.NODE_ENV === 'development'` (то есть `pnpm dev`);
2. код выполняется в браузере (`typeof window !== 'undefined'`);
3. нет `window.__TAURI_INTERNALS__`, то есть страница открыта не внутри Tauri.

В `pnpm tauri:dev` заглушки не включаются: Tauri подставляет `__TAURI_INTERNALS__` раньше скриптов страницы.

### Почему заглушки не попадают в production

`bootstrap.ts` подключает установку через `require('./install')` внутри условия. При `next build` webpack подставляет `NODE_ENV` строкой `"production"`, ветка становится мёртвой, и ни `install.ts`, ни фикстуры в бандл не попадают. Проверено после `pnpm build`: в `frontend/out` и `frontend/.next/static` нет ни одной строки из заглушек (`mock-tauri`, `__MEETILY_MOCK__`, `mockIPC`, названий вымышленных встреч).

В `app/layout.tsx` добавлена одна строка, первым импортом: `import '@/dev/mock-tauri/bootstrap'`. Первым — чтобы заглушки встали до первого `invoke`.

## Сценарии

| `?mock=` | Что видно |
|---|---|
| `empty` | Онбординг пройден, модели скачаны, встреч нет. Пустой сайдбар и приветствие на главной |
| `full` | 9 вымышленных встреч. Резюме всех 6 шаблонов, у 4 встреч таблица задач, ещё у 2 другие таблицы (блокеры, план). Транскрипты с метками времени и спикерами. Одна встреча без резюме (пустое состояние), одна с упавшим резюме |
| `long` | Встреча на 3 часа: 2100 реплик, длинное название, резюме с таблицей на 40 строк. Ещё 45 встреч в сайдбаре, часть с очень длинными названиями |
| `recording` | Идёт запись. На главной запись стартует сама через событие трея `request-recording-toggle`, то есть по настоящему пути приложения. Реплики приходят событием `transcript-update` раз в 1,8 с вместе с `speech-detected`. Пауза, возобновление и стоп работают; после стопа встреча сохраняется и открываются её детали. На других страницах ядро «уже пишет» с момента загрузки |
| `error` | Команды ядра падают с текстами, похожими на настоящие (`database is locked`, `Parakeet model not loaded…`). Старт записи сначала шлёт `transcription-error`, потом отклоняется, как в `recording_commands.rs`. Список команд, которые падают: `FAILING_COMMANDS` в `handlers.ts` |
| `onboarding` | Первый запуск: `get_onboarding_status` возвращает `null`, модели не скачаны. Мастер проходится целиком: загрузки идут с прогрессом около 6 секунд, разрешения выдаются по кнопке Enable. После Finish Setup открывается приложение |

Во всех сценариях, как и в настоящем приложении, всегда падают две команды, которых нет в `generate_handler!` ядра: `api_get_auto_generate_setting` и `builtin_ai_get_models_directory`. Ошибка такая же, как у Tauri 2: `command <имя> not found`. Первую видно в Настройках → Summary: в консоли появляется `Failed to fetch auto-generate setting`.

## Что мокается

**Команды.** Замокано 149 из 149 команд, которые вызывает интерфейс. Это все строковые имена в `invoke(...)` и `invokeTauri(...)` в `src`. Разбор в `docs/recon.md` насчитал 145: grep не видел вызовы, где имя команды стоит на следующей строке. Пропущены были `api_detect_transcript_summary_language`, `api_get_meeting_detected_summary_language`, `api_save_meeting_detected_summary_language` и `recover_audio_from_checkpoints`.

Плюс команды плагинов: `plugin:store|*` (хранилище в памяти), `plugin:app|version`, `plugin:path|resolve_directory`, `plugin:updater|check` (обновлений нет), `plugin:process|*`, `plugin:notification|*`, `plugin:resources|close`. `plugin-os` читает данные синхронно из `window.__TAURI_OS_PLUGIN_INTERNALS__`. Заглушка подкладывает этот объект с `platform: 'macos'`, поэтому в онбординге есть шаг с разрешениями.

Команда без заглушки возвращает `null`, а в консоли один раз появляется `[mock-tauri] Нет заглушки для команды "…"`.

**События.** Интерфейс подписан на 38 событий. Одно из них, `model-config-updated`, отправляет сам интерфейс; оно проходит через ту же шину заглушек. Из 37 событий ядра:

- 22 заглушка шлёт сама в ответ на действия: `recording-starting/started/paused/resumed/stopped`, `transcript-update`, `speech-detected`, `transcription-complete`, `transcription-error` (error-сценарий), `request-recording-toggle` (автостарт в сценарии recording), прогресс и завершение загрузок `parakeet-*`, `model-download-*`, `builtin-ai-download-progress`, `ollama-model-download-*`, `import-progress/complete`, `retranscription-progress/complete`, `audio-levels`;
- 15 можно вызвать вручную из консоли (см. ниже): `recording-stop-complete` (стоп «из трея»), `mic-unavailable`, `mic-device-switched`, `mic-swap-failed`, `mic-recovery-exhausted`, `chunk-drop-warning`, `transcript-error`, `parakeet-model-download-error`, `model-download-error`, `ollama-model-download-error`, `import-error`, `retranscription-error`, `tauri://drag-enter/drop/leave`.

### Консоль

Состояние заглушек лежит в `window.__MEETILY_MOCK__`:

```js
__MEETILY_MOCK__.calledCommands      // какие команды вызывались
__MEETILY_MOCK__.unknownCommands     // вызовы без заглушки
__MEETILY_MOCK__.listenedEvents      // на что подписан интерфейс
__MEETILY_MOCK__.backend.meetings    // «база» встреч (можно править на лету)
__MEETILY_MOCK__.emit('chunk-drop-warning', 'текст')   // любое событие ядра
__MEETILY_MOCK__.presets.micUnavailable()              // готовые события
__MEETILY_MOCK__.presets.stopFromTray()                // стоп «из трея»
```

Готовые пресеты: `micUnavailable`, `micSwitched`, `micSwapFailed`, `micRecoveryExhausted`, `chunkDrop`, `transcriptError`, `transcriptionError`, `parakeetDownloadError`, `whisperDownloadError`, `ollamaDownloadError`, `importError`, `retranscriptionError`, `stopFromTray`, `trayToggle`, `dragEnter`, `dragDrop`, `dragLeave`.

## Что не мокается или мокается условно

В браузере этого нет физически. Заглушка либо ведёт себя разумно, либо ничего не делает и пишет предупреждение `[mock-tauri] …: в браузере недоступно` в консоль:

| Что | Как ведёт себя заглушка |
|---|---|
| Захват звука, Whisper/Parakeet | Звука нет. Транскрипт — заранее написанные реплики по таймеру. `whisper_transcribe_audio`, `parakeet_transcribe_audio` ничего не делают |
| Уровень звука (`audio-levels`) | Синусоида вместо реального сигнала |
| Системные разрешения macOS | `trigger_*_permission` всегда возвращает `true`. `open_system_settings` пишет предупреждение |
| Файловая система | Пути вымышленные (`/mock/Meetily/...`). «Открыть папку» (`open_*_folder`, `open_meeting_folder`) пишет предупреждение. `read_audio_file` отдаёт пустой массив |
| Диалоги выбора файлов | `select_and_validate_audio_command`, `select_legacy_database_path` возвращают `null`, как при отмене |
| Перетаскивание файлов из Finder | Работает только через пресеты `dragEnter` / `dragDrop` |
| Трей | Есть только события: `presets.trayToggle()` и `presets.stopFromTray()` |
| Нативные уведомления | `plugin:notification|*`: разрешения нет, уведомления не показываются |
| Запросы к LLM (Ollama, Claude и т. п.) | Резюме генерирует заглушка за 3 секунды из первых реплик транскрипта. Проверка соединения с custom OpenAI всегда возвращает ошибку |
| `open_external_url` | Ссылки не открываются, в консоль пишется предупреждение |
| `plugin-store` | Хранилище в памяти, на диск ничего не пишется, после перезагрузки страницы сбрасывается |
| Поведение окна (`.titlebar`, перетаскивание окна), консоль Windows | Не проверить. `show/hide/toggle_console` ничего не делают |

Состояние «ядра» (встречи, переименования, новые записи) живёт в памяти до перезагрузки страницы. Переходы через сайдбар его сохраняют.

## Как добавить сценарий

1. Опишите сценарий в `frontend/src/dev/mock-tauri/scenarios.ts`: добавьте id в тип `ScenarioId` и запись в `SCENARIOS`:

   ```ts
   slow: {
     id: 'slow', label: 'slow', description: 'Ядро отвечает с задержкой',
     meetings: createFullMeetings, onboardingCompleted: true, modelsReady: true,
     recordingOnLoad: false, failing: false,
   },
   ```

2. Флаги `onboardingCompleted`, `modelsReady`, `recordingOnLoad`, `failing` уже понимает `backend.ts` / `install.ts`. Если нужно новое поведение, добавьте флаг в интерфейс `Scenario` и проверьте его в `install.ts` (общая логика) или в нужном обработчике `handlers.ts` (обработчик получает `be.scenario`).
3. Кнопка в плавающей панели появится сама, адрес — `?mock=slow`.

## Как добавить фикстуру

- **Встреча.** В `fixtures/meetings.ts` (или в новом файле рядом) добавьте объект `MockMeeting`. Транскрипт удобно собирать через `buildTranscript(id, startIso, [[спикер, текст, секунды?], ...])`: он сам посчитает `timestamp`, `audio_start_time`, `audio_end_time` и уверенность. Спикер идёт префиксом текста «Имя: …», потому что отдельного поля для спикера в модели данных приложения нет. Резюме — markdown в `summary.markdown` со `status: 'completed'`. `status: 'idle'` даёт пустое состояние, `'failed'` с `error` — ошибку.
- **Модели, устройства, настройки** — `fixtures/settings.ts`. Имена моделей должны совпадать с реальными: интерфейс ищет их по имени (`parakeet-tdt-0.6b-v3-int8`, `gemma3:1b`).
- **Ответ команды** — `handlers.ts`, словарь `handlers` (команды ядра) или `pluginHandlers` (плагины). Ошибку возвращайте как ядро, строкой: `return Promise.reject('текст')`.
- **Данные только вымышленные:** придуманные компании, имена и темы, без настоящих ссылок, адресов и персональных данных.

## Файлы

```
frontend/src/dev/mock-tauri/
├── bootstrap.ts      точка входа, условие включения (импортируется в app/layout.tsx)
├── install.ts        mockIPC + mockWindows + plugin-os, отладочный window.__MEETILY_MOCK__
├── handlers.ts       команда → ответ, ошибки error-сценария, плагины
├── backend.ts        состояние «ядра»: встречи, резюме, запись, загрузки, уровни звука
├── scenarios.ts      сценарии и выбор через ?mock= / sessionStorage
├── panel.ts          плавающая плашка выбора сценария (чистый DOM вне React)
└── fixtures/
    ├── types.ts      типы и buildTranscript
    ├── meetings.ts   9 встреч сценария full (все 6 шаблонов)
    ├── long.ts       длинная встреча и 45 встреч для сайдбара
    ├── recording.ts  реплики живой записи
    └── settings.ts   модели, устройства, шаблоны, настройки
```

## Известные особенности

- В `@tauri-apps/api/mocks` 2.11 есть ошибка: при отписке мок ищет `args.id`, а `event.js` присылает `eventId`. Отписанные обработчики оставались в списке, и каждое событие давало предупреждение `Couldn't find callback id`. В `install.ts` это обходится: перед вызовом мока `eventId` копируется в `id`. Пакет не менялся.
- `recording-stop-complete` ядро шлёт только при остановке из трея (`tray.rs`). Если слать его и при остановке из интерфейса, встреча сохранится дважды. Заглушка повторяет поведение ядра.
- В сценарии `error` список встреч не загружается, но интерфейс никак это не показывает: сайдбар просто пустой. Это поведение приложения, а не заглушки; при редизайне его стоит учесть.
