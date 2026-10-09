# Разведка перед редизайном интерфейса Meetily

Дата: 2026-10-06. Ветка: `claude/inspiring-rubin-4j7kwa`, состояние кода на коммите `a2cb62e` (Release v0.4.1).
Код при разведке не менялся. Цифры получены grep-ом по исходникам. Где в тексте стоит «оценка», это прикидка, а не замер.

---

## 1. Структура

### 1.1. Три слоя

| Слой | Где лежит | Что внутри |
|---|---|---|
| Интерфейс | `frontend/src` | Next.js 14 (App Router, `output: 'export'`, то есть статическая сборка в `frontend/out`), React 18, TypeScript. 117 `.tsx` и 54 `.ts` |
| Rust-ядро | `frontend/src-tauri/src` | Tauri 2: захват звука, Whisper/Parakeet, SQLite (sqlx), LLM-клиенты (Ollama, Claude, Groq, OpenRouter, OpenAI, встроенная модель через сайдкар `llama-helper`), трей, уведомления, аналитика (PostHog) |
| Архив | `backend/` | Старый Python/FastAPI. Не поддерживается, при редизайне не трогаем |

Окно задано в `frontend/src-tauri/tauri.conf.json`: 1100×700, тема `Light`, системные рамки окна.
В dev-режиме Tauri открывает `http://localhost:3118` (`pnpm dev`), в релизе берёт статику из `../out`.

### 1.2. Как интерфейс говорит с ядром

- **Команды** (интерфейс → ядро): `invoke('имя_команды', {аргументы})` из `@tauri-apps/api/core`. В части хуков то же самое импортировано под именем `invokeTauri`.
  - В ядре зарегистрировано **197** команд (`generate_handler!` в `src-tauri/src/lib.rs`).
  - Интерфейс вызывает **145** разных команд.
  - Две вызываемые команды в ядре не зарегистрированы: `api_get_auto_generate_setting` (в `lib.rs:723` закомментирована) и `builtin_ai_get_models_directory`. Такой вызов всегда падает с ошибкой. Для редизайна это неважно, но при мокировании их надо учитывать.
- **События** (ядро → интерфейс): `listen('имя', cb)` из `@tauri-apps/api/event`. Ядро отправляет около 50 разных событий. Интерфейс подписан примерно на 30 из них, плюс системные `tauri://drag-*`. Есть одно событие интерфейс → интерфейс: `model-config-updated` (отправляется через `emit` из настроек).
- **Плагины Tauri**, которые интерфейс использует напрямую: `plugin-store` (файл `preferences.json`: флаги уведомлений, аналитика, настройки записи), `plugin-os` (определение платформы), `plugin-updater` и `plugin-process` (обновления), `plugin-notification`.
- **Хранилище в браузере**: `localStorage`/`sessionStorage` (бета-флаги, ширина панелей, флаг автозапуска записи из трея) и IndexedDB `MeetilyRecoveryDB` (резервная копия транскрипта на время записи, `services/indexedDBService.ts`). Всего около 100 обращений.

Схема потока такая. Пользователь нажимает «Запись» → `start_recording_with_devices_and_meeting` → ядро шлёт `recording-started`, затем поток `transcript-update` → интерфейс складывает их в `TranscriptContext` → при остановке приходят `recording-stop-complete` и `transcription-complete` → встреча сохраняется в SQLite → сайдбар перечитывает `api_get_meetings`.

### 1.3. Экраны, файлы и команды

| Экран / область | Главный файл | Какие команды вызывает (основные) | Какие события слушает |
|---|---|---|---|
| Оболочка приложения (провайдеры, онбординг или основное окно, drag-and-drop аудио) | `app/layout.tsx` | `get_onboarding_status` | `request-recording-toggle` (из трея), `tauri://drag-enter/leave/drop` |
| Сайдбар: список встреч, поиск, кнопки «Запись», «Импорт», «Настройки», удаление и переименование встречи | `components/Sidebar/index.tsx` (882 строки), `Sidebar/SidebarProvider.tsx` | `api_get_meetings`, `api_search_transcripts`, `api_get_summary` (опрос статуса резюме), `api_delete_meeting`, `api_save_meeting_title`, `api_get/save_model_config`, `api_get/save_transcript_config`, `api_get_api_key` | `model-config-updated` |
| Главная: запись и живой транскрипт | `app/page.tsx`, `app/_components/TranscriptPanel.tsx`, `StatusOverlays.tsx`, `SettingsModal.tsx`, `components/RecordingControls.tsx` | Через `services/recordingService.ts`: `start_recording_with_devices_and_meeting`, `stop_recording`, `pause_recording`, `resume_recording`, `is_recording`, `get_recording_state`. Также `api_get_transcript_config`, `whisper_*`/`parakeet_*` (проверка модели), `has_audio_checkpoints`, `get_meeting_folder_path`, `api_save_transcript` | `recording-*`, `transcript-update`, `transcription-complete`, `transcription-error`, `transcript-error`, `speech-detected`, `chunk-drop-warning`, `mic-*`, `model-download-complete` |
| Детали встречи: транскрипт слева, резюме справа | `app/meeting-details/page.tsx`, `page-content.tsx`, `components/MeetingDetails/*`, `components/AISummary/*`, хуки `hooks/meeting-details/*` | `api_get_meeting_metadata`, `api_get_meeting_transcripts` (постранично), `api_get_summary`, `api_process_transcript`, `api_cancel_summary`, `api_save_meeting_summary`, `api_list_templates`, `api_get/save_model_config`, `get_ollama_models`, `builtin_ai_is_model_ready`, `open_meeting_folder`, `api_get/save_meeting_summary_language`, `start/cancel_retranscription_command` (бета) | `model-config-updated`, `retranscription-*`, `transcription-progress` |
| Настройки, 5 вкладок: General, Recordings, Transcription, Summary, Beta | `app/settings/page.tsx` + `PreferenceSettings`, `RecordingSettings`, `TranscriptSettings` (с `WhisperModelManager`, `ParakeetModelManager`), `SummaryModelSettings` (с `ModelSettingsModal`, 1408 строк), `BetaSettings` | `get/set_recording_preferences`, `get_default_recordings_folder_path`, `open_*_folder`, `get/set_notification_settings`, `whisper_*`, `parakeet_*`, `builtin_ai_*`, `get_ollama_models`, `pull/delete_ollama_model`, `get_{openai,anthropic,groq,openrouter}_models`, `api_*_custom_openai_config`, `api_test_custom_openai_connection`, `get/set_audio_backend`, `track_*` | `model-download-progress`, `parakeet-model-download-*`, `builtin-ai-download-progress`, `ollama-model-download-*` |
| Онбординг, 4 шага: Welcome, SetupOverview, DownloadProgress, Permissions | `components/onboarding/*`, `contexts/OnboardingContext.tsx` | `get_onboarding_status`, `save_onboarding_status_cmd`, `complete_onboarding`, `check_first_launch`, `parakeet_init/download_model/...`, `builtin_ai_download_model/...`, `trigger_microphone_permission`, `trigger_system_audio_permission_command`, `open_system_settings`, `check_default_legacy_database`, `import_and_initialize_database`, `initialize_fresh_database` | прогресс загрузок моделей |
| Импорт аудио (бета, диалог и оверлей) | `components/ImportAudio/*`, `hooks/useImportAudio.ts` | `select_and_validate_audio_command`, `validate_audio_file_command`, `start_import_audio_command`, `cancel_import_command` | `import-progress`, `import-complete`, `import-error` |
| Восстановление после сбоя | `components/TranscriptRecovery/*`, `hooks/useTranscriptRecovery.ts` | `has_audio_checkpoints`, `cleanup_checkpoints`, `get_meeting_folder_path`, `api_save_transcript` | — |
| Импорт старой базы | `components/DatabaseImport/*` | `detect_legacy_database`, `select_legacy_database_path`, `check_homebrew_database`, `import_and_initialize_database`, `initialize_fresh_database` | — |
| Мусор: заглушка-демо | `app/notes/[id]/page.tsx` | нет, захардкоженные примеры заметок 2024 года | — |

Поперёк всех экранов работают: `lib/analytics.ts` (около 20 команд `track_*`, `init_analytics` и т. п.), `UpdateCheckProvider`/`UpdateDialog` (`plugin-updater`) и `ConsoleToggle` (`show/hide/toggle_console`).

---

## 2. Экраны и состояния

### 2.1. Навигация
Next.js-маршрутов три: `/` (главная), `/meeting-details?id=…`, `/settings`. Четвёртый, `/notes/[id]`, остался от демо. Онбординг маршрутом не является: `layout.tsx` показывает его вместо всего приложения, пока `get_onboarding_status` не вернёт `completed: true`. Слева постоянно висит сайдбар: развёрнутый 16rem, свёрнутый 4rem.

### 2.2. Состояния по экранам

**Запись** (`RecordingStateContext`, перечисление `RecordingStatus`):
- `IDLE`: пустой транскрипт с текстом «Welcome to meetily!» (`TranscriptView.tsx:373`, `VirtualizedTranscriptView.tsx:260`) и круглая плавающая кнопка записи внизу.
- `STARTING`, `RECORDING`, `STOPPING`, `PROCESSING_TRANSCRIPTS`, `SAVING`, `COMPLETED`, `ERROR`. Пауза в это перечисление не входит, её хранит отдельный флаг (события `recording-paused` / `recording-resumed`).
- Во время записи анимируются 3 полоски (на главной это случайные высоты, к реальному уровню они не привязаны), горит индикатор `speech-detected`, есть пауза и стоп.
- После остановки панель записи прячется и показывается оверлей «Processing / Saving» (`StatusOverlays.tsx`).
- Кнопка записи скрыта, если нет микрофона (`usePermissionCheck`). Тогда показывается `PermissionWarning`.
- При старте записи появляется тост «🔴 Recording Started. Inform all participants…» с галочкой «больше не показывать» (`lib/recordingNotification.tsx`). Есть и `ComplianceNotification` у кнопки в сайдбаре.

**Список встреч** (сайдбар):
- Плоская папка «Meeting Notes» со списком встреч (только `id` и `title`: команда `api_get_meetings` больше ничего не отдаёт, хотя в базе есть `created_at`).
- При пустом списке пустого состояния нет, папка просто пустая.
- Поиск: поле в сайдбаре. Фильтрует по названию на клиенте и по тексту транскриптов через `api_search_transcripts`, совпавшие встречи остаются в списке.
- Свёрнутый режим: только иконки.
- Диалоги удаления и переименования.

**Детали встречи**:
- Загрузка (спиннер), ошибка (красный текст с кнопкой), «No meeting selected».
- Разделённый вид с перетаскиваемой границей, ширина хранится в `localStorage` под ключом `meetily.meetingDetails.transcriptPaneRatio`. На узком окне вкладки «Transcript / Summary».
- Транскрипт виртуализирован (`@tanstack/react-virtual`), догружается постранично, у сегмента есть индикатор уверенности (`ConfidenceIndicator`).
- Резюме: пустое состояние `EmptyStateSummary` (кнопка генерации, предупреждение «Please select a model in Settings first»), идёт генерация (опрос статуса), готово (редактор BlockNote), ошибка, отмена.
- Кнопки: копировать транскрипт или резюме, открыть папку встречи, перегенерировать, выбрать шаблон, язык резюме, ретранскрибировать (бета).

**Настройки**: 5 вкладок с подчёркиванием на framer-motion. Внутри менеджеры моделей с состояниями «не скачана / качается N% / готова / повреждена / ошибка».

**Ошибки** приходят тремя путями:
- тосты `sonner` (внизу по центру, `richColors`);
- модалки `SettingsModals` / `useModalState` (`errorAlert`, `chunkDropWarning`, `modelSelector` и т. п.);
- инлайн-блоки `bg-red-50 text-red-700`.

Единого компонента ошибки нет.

**Пустые состояния**: приветствие в пустом транскрипте, `EmptyStateSummary`, пустой список моделей. Пустой список встреч никак не оформлен.

### 2.3. Сколько компонентов
- `src/components`: **99** `.tsx`. Из них **22** примитива shadcn/ui в `components/ui`, 11 файлов онбординга, остальное прикладное.
- `src/app`: **10** `.tsx` (страницы и `_components`).
- Контекстов 7, хуков 23, сервисов 6.
- Мёртвый код, нигде не импортируется: `AudioPlayer.tsx` (пустой файл), `CustomDialog.tsx`, `ModelDownloadProgress.tsx`, `BlockNoteEditor/BasicBlockNoteTest.tsx`, `MainNav`, хук `useAudioPlayer.ts`, страница `/notes/[id]`.
- Самые крупные файлы: `ModelSettingsModal.tsx` (1408 строк), `Sidebar/index.tsx` (882), `VirtualizedTranscriptView.tsx` (394), `TranscriptView.tsx` (381).

---

## 3. Дизайн-система

- **Сборка UI**: Tailwind CSS 3.4 + shadcn/ui (стиль `new-york`, базовый цвет `neutral`, CSS-переменные включены, `components.json`) на Radix UI. Иконки: `lucide-react` (основные) и `@heroicons/react` (частично). Анимации: `framer-motion` и `tailwindcss-animate`. Тосты: `sonner`. Редактор резюме: BlockNote 0.36 (`@blocknote/shadcn`). Remirror и TipTap стоят в `package.json`, но в `src` не импортируются; TipTap нужен как источник ProseMirror для алиасов в `next.config.js`.
- **Токены** (`src/app/globals.css`, `tailwind.config.js`): стандартный набор shadcn в HSL. `--background`, `--foreground`, `--card`, `--popover`, `--primary` (почти чёрный, `0 0% 9%`), `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--radius: 0.5rem` (lg/md/sm считаются от него). Тёмная тема в переменных описана через класс `.dark`, но нигде не включается, а окно в `tauri.conf.json` жёстко `Light`. Есть лишний токен `tertiary: #64748b`.
- **Реальные цвета берутся не из токенов.** Прикладные компоненты в основном используют палитру Tailwind напрямую. Самое частое: `text-gray-600` (96 раз), `border-gray-200` (57), `bg-gray-100` (55), `text-gray-500/700/900`, акцент `text-blue-600` / `bg-blue-600` (47 и 30), ошибки `red-*`, успех `green-*`, предупреждения `yellow/amber-*`. Модификатор `dark:` встречается 5 раз в 2 файлах. Отсюда главный вывод для редизайна: **сменой токенов поменяется только shadcn-обвязка, а основной вид держится на сотнях прямых классов**.
- **Шрифт**: Source Sans 3 (400/500/600/700) через `next/font/google`, переменная `--font-source-sans-3`, назначен как `font-sans`. Важно: `next/font/google` скачивает шрифт при сборке, то есть офлайн-сборка без кеша упадёт.
- **Свои утилиты** в `globals.css`: анимации `vibrate`, `fade-in`, `fade-in-up`, классы `.titlebar` / `.no-drag` (перетаскивание окна), `.custom-scrollbar` (цвета зашиты hex-ом), принудительные `!important` для BlockNote.
- Плагины Tailwind: `typography`, `container-queries`, `animate`.

---

## 4. Можно ли открыть интерфейс в обычном браузере с заглушками

**Коротко: да, и это недорого.** Next.js-часть сама по себе обычный веб-сайт: `pnpm dev` поднимает её на `http://localhost:3118`, Rust и модели для этого не нужны. Сейчас в браузере всё упадёт: каждый `invoke` бросит ошибку, потому что нет `window.__TAURI_INTERNALS__`. Например, `get_onboarding_status` упадёт, и `layout.tsx` уйдёт в онбординг. Встроенного режима «без Tauri» в коде нет. Есть только две точечные проверки (`usePlatform.ts`, `useRecordingStateSync.ts`).

**Как мокать.** В `@tauri-apps/api` (в lock-файле версия 2.11.0) есть официальный модуль `@tauri-apps/api/mocks` с функциями `mockIPC(handler, { shouldMockEvents: true })`, `mockWindows('main')` и `clearMocks()`. Он перехватывает все `invoke`, включая вызовы плагинов (`plugin:store|...`, `plugin:event|listen`, `plugin:event|emit`). То есть менять 145 мест вызова не придётся: нужен один dev-only файл, который подключается в `layout.tsx` по флагу `NEXT_PUBLIC_MOCK_TAURI=1`, и словарь «команда → ответ». События из «ядра» можно имитировать вызовом `emit()` из того же модуля по таймеру.

**Минимальный набор, чтобы увидеть основные экраны:**

| Команда / событие | Пример данных |
|---|---|
| `get_onboarding_status` | `{ "version": "1.0", "completed": true, "current_step": 4, "model_status": { ... }, "last_updated": "2026-10-05T09:00:00Z" }` (`completed: false` покажет онбординг; форму `model_status` см. `src-tauri/src/onboarding.rs`) |
| `api_get_meetings` | `[{ "id": "m-1", "title": "Дейли команды" }]` (ядро отдаёт только эти два поля) |
| `api_get_meeting_metadata` | `{ "id": "m-1", "title": "Дейли команды", "created_at": "...", "updated_at": "...", "folder_path": "/mock/m-1" }` |
| `api_get_meeting_transcripts` | `{ "transcripts": [{ "id": "t1", "text": "Всем привет, начинаем.", "timestamp": "09:00:05", "audio_start_time": 5.0, "audio_end_time": 7.4, "duration": 2.4, "confidence": 0.93 }], "total_count": 1, "has_more": false }` |
| `api_get_summary` | `{ "status": "completed", "meetingName": "Дейли команды", "meeting_id": "m-1", "start": null, "end": null, "error": null, "data": { "markdown": "## Итоги\n- ...", "summary_json": null } }`. Для пустого состояния `status: "idle"`, `data: null` |
| `api_search_transcripts` | `[{ "id": "m-1", "title": "Дейли команды", "matchContext": "...начинаем...", "timestamp": "09:00:05" }]` |
| `api_list_templates` | `[{ "id": "daily_standup", "name": "Daily Standup", "description": "..." }]` (точную форму надо сверить с `summary/template_commands.rs`) |
| `api_get_model_config` | `{ "provider": "ollama", "model": "llama3.2", "whisperModel": "large-v3", "apiKey": null, "ollamaEndpoint": null }` |
| `api_get_transcript_config` | `{ "provider": "parakeet", "model": "parakeet-tdt-0.6b-v3-int8", "apiKey": null }` |
| `parakeet_init`, `parakeet_has_available_models`, `whisper_*` | `null` / `true` / список моделей со `status: "Available"` |
| `get_audio_devices` | `[{ "name": "MacBook Pro Microphone", "device_type": "Input" }, { "name": "BlackHole 2ch", "device_type": "Output" }]` (точную форму см. `audio/devices/configuration.rs`) |
| `is_recording`, `get_recording_state` | `false` / `{ "is_recording": false, "is_paused": false, ... }` |
| `start_recording_with_devices_and_meeting`, `stop_recording`, `pause_recording`, `resume_recording` | `null`, после чего мок сам шлёт `recording-started` / `recording-stopped` / `recording-paused` |
| `get_ollama_models`, `builtin_ai_list_models` | `[]` или пара моделей |
| `get_recording_preferences`, `get_notification_settings`, `get_default_recordings_folder_path` | объекты с дефолтами, путь `/mock/recordings` |
| Все `track_*`, `init_analytics`, `is_analytics_enabled` и т. п. | `null` / `false` |
| `plugin:store|load`, `plugin:store|get` | ресурс-идентификатор и `null` (значит «по умолчанию») |
| `plugin:os|platform` | плагин читает `window.__TAURI_OS_PLUGIN_INTERNALS__`, его надо подложить объектом (`{ platform: "macos", ... }`) |
| `plugin:updater|check` | `null` (обновлений нет) |
| Событие `transcript-update` (имитация записи) | `{ "text": "Давайте по задачам.", "timestamp": "09:01:10", "source": "mixed", "sequence_id": 3, "chunk_start_time": 0, "is_partial": false, "confidence": 0.9, "audio_start_time": 70.1, "audio_end_time": 72.0, "duration": 1.9 }` раз в 1–2 секунды |
| События `speech-detected`, `recording-stop-complete`, `transcription-complete` | `{}` / `true` / `{}` |

Неизвестные команды мок должен возвращать как `null` и писать имя в консоль. Так за один проход по экранам видно, чего не хватает.

**Оценка простыми словами.** Каркас мока (один файл, 30–40 команд, 5–6 событий, сценарий «идёт запись») займёт около 1–2 рабочих дней. После этого весь редизайн стилей и вёрстки можно делать в браузере с горячей перезагрузкой, без сборки Rust и без микрофона. Что в браузере не проверить: реальный звук, разрешения macOS, трей, перетаскивание файлов из Finder (`tauri://drag-drop`), нативные уведомления, поведение окна (`.titlebar`). Это проверяется только в настоящей сборке. Риск низкий: мок живёт в отдельном файле под флагом и в продакшн не попадает.

---

## 5. Что нельзя трогать при редизайне

- **Всё Rust-ядро** `frontend/src-tauri/src/**`: звук (`audio/`, `audio_v2/`), движки (`whisper_engine/`, `parakeet_engine/`), `summary/`, `database/`, `api/`, `lib.rs` и регистрация команд, `tray.rs`, `notifications/`. Отдельно не трогать захардкоженные в ядре тексты и имена (заголовки уведомлений «Meetily», подсказка в трее, пути к папкам): это ядро, хотя выглядит как UI.
- **Имена и сигнатуры команд и событий.** Интерфейс должен вызывать те же 145 команд с теми же аргументами (camelCase на стороне JS, Tauri сам переводит в snake_case) и слушать те же события с теми же полями.
- **Форматы данных**: `Transcript` / `TranscriptUpdate` (`types/index.ts`, поля `audio_start_time`, `audio_end_time`, `sequence_id` и др.), `SummaryProcessResponse`, формат резюме (три варианта: legacy-секции, `markdown`, `summary_json` в блоках BlockNote, `lib/summary-content.ts`), `MeetingMetadata`.
- **Схема базы и миграции** `frontend/src-tauri/migrations/*.sql` (10 файлов, от `20250916100000_initial_schema.sql` до `20251229000000_add_gemini_api_key.sql`). Таблицы `meetings`, `transcripts` (с `speaker`, `audio_*`), `summary_processes`, `transcript_chunks`, `meeting_notes`, `settings`, `transcript_settings`, таблицы лицензий. Новые колонки не добавлять, старые миграции не редактировать.
- **Шаблоны резюме** `frontend/src-tauri/templates/*.json`: попадают в бандл как ресурсы и по формату завязаны на `summary/templates/types.rs`.
- **Ключи хранилищ**, по которым живут данные пользователя: `preferences.json` (plugin-store), IndexedDB `MeetilyRecoveryDB`, ключи `localStorage` (бета-флаги и т. п.). Переименование потеряет настройки и данные восстановления.
- **Идентификатор приложения** `com.meetily.ai`, `productName`, ключ и адрес обновлений в `tauri.conf.json`. От них зависят путь к данным пользователя, подпись и автообновление.
- **Конфигурация сборки**: `Cargo.toml`, `build.rs`, `tauri.conf.json` (CSP, capabilities, `externalBin`), `next.config.js` (алиасы ProseMirror, `output: 'export'`), `pnpm.overrides` в `package.json`.
- **Архив `backend/`.**

---

## 6. Сборка на macOS

**Инструменты** (по `docs/BUILDING.md` и `build-macos.yml`):
- Xcode Command Line Tools (`xcode-select --install`): clang, Swift, фреймворки AVFoundation и ScreenCaptureKit.
- Homebrew, затем `brew install cmake node pnpm`. По документации pnpm нужен ровно `9.15.9` (`npm install -g pnpm@9.15.9`).
- Rust через rustup, stable. CI собирает под `aarch64-apple-darwin`.
- Сеть при первой сборке: crates.io, git-зависимости (`cidre`, `cpal` с GitHub), npm, Google Fonts (шрифт), а `build.rs` сам скачивает FFmpeg и ONNX Runtime.
- macOS 13+ для захвата системного звука.

**Команды запуска** (из `frontend/`):
```bash
pnpm install --frozen-lockfile
./dev-gpu.sh          # рекомендуемый путь: собирает сайдкар llama-helper (Metal), кладёт в src-tauri/binaries, запускает tauri dev
# или вручную:
#   cargo build -p llama-helper --features metal   (из корня репозитория)
#   скопировать target/debug/llama-helper в frontend/src-tauri/binaries/llama-helper-aarch64-apple-darwin
#   pnpm tauri:dev
./build-gpu.sh        # релизная сборка (.app / .dmg)
./clean_run.sh        # чистый перезапуск (удаляет node_modules, .next, out)
pnpm dev              # только интерфейс в браузере на :3118, без Rust (см. раздел 4)
```
Подвох: `tauri.conf.json` объявляет `externalBin: binaries/llama-helper, binaries/ffmpeg`, а папки `src-tauri/binaries` в репозитории нет. Голый `pnpm tauri:dev` без предварительной сборки `llama-helper` упадёт на проверке сайдкара. Поэтому для первой сборки лучше `./dev-gpu.sh`. В разделе macOS документации этот шаг не упомянут.

**Время и нагрузка первой сборки (оценка, не замер):**
- В `Cargo.lock` 855 пакетов. Кроме них из C/C++ через CMake компилируются whisper.cpp (с Metal и CoreML) и llama.cpp (в сайдкаре).
- Apple Silicon M1/M2 с 16 ГБ: первая debug-сборка займёт примерно 15–30 минут, релизная 25–45 минут. На Intel-маке в 1,5–2 раза дольше. Повторные сборки после правок только в интерфейсе Rust не пересобирают: Next.js обновляется горячо за секунды.
- Диск: `target/` займёт 8–15 ГБ, `node_modules` около 1 ГБ. Модели после запуска качаются отдельно, ещё 1–4 ГБ: Parakeet около 0,6 ГБ, Whisper large-v3 около 3 ГБ, встроенная LLM 1–2 ГБ.
- Во время компиляции все ядра загружены на 100 %, ноутбук греется и шумит. Пик памяти 6–10 ГБ.
- Для работы над стилями сборку Rust можно делать один раз: дальше хватит `pnpm dev` в браузере с моками.

---

## 7. Что из списка уже есть

| Функция | Статус | Где и как |
|---|---|---|
| Ссылка из резюме на момент транскрипта | **Нет** (только текстом) | Шаблон `standard_meeting.json` просит модель вставлять в таблицу задач колонки «Reference Transcript Segment» и «Segment Time stamp», но это обычный текст в markdown. Клик по нему ничего не делает. Плеера в UI нет: `AudioPlayer.tsx` пустой, `useAudioPlayer.ts` нигде не используется, у сегментов транскрипта нет обработчиков клика. Данные для связки уже есть: `audio_start_time` / `audio_end_time` у каждого сегмента и команда `read_audio_file` |
| Правка расшифровки | **Нет** | Транскрипт показывается только для чтения (`VirtualizedTranscriptView`). Команды для обновления отдельного сегмента в ядре нет: grep по `update_transcript` пустой. Есть только ретранскрибация целиком (бета). Редактировать можно лишь резюме (BlockNote с сохранением `api_save_meeting_summary`) и название встречи |
| Задачи с исполнителем | **Частично, только текстом** | Шаблоны просят таблицы с колонкой `Owner` (`standard_meeting`, `daily_standup`, `retrospective`, `project_sync`). Это markdown внутри резюме. Отдельной сущности «задача», статуса, фильтра и экспорта нет. Колонка `transcripts.action_items` в базе есть, но это наследие старого бэкенда, в UI она не используется |
| Шаблоны по типу встречи | **Есть** | 6 встроенных шаблонов в `src-tauri/templates/`: standard_meeting, daily_standup, project_sync, retrospective, sales_marketing_client_call, psychatric_session (опечатка в имени файла). Можно добавлять свои в `~/Library/Application Support/Meetily/templates/`. Выбор в деталях встречи через `useTemplates` → `api_list_templates`. Автовыбора по типу встречи нет |
| Поиск по встречам | **Есть, базовый** | Поле в сайдбаре: по названию (на клиенте) и по тексту транскриптов (`api_search_transcripts`). Результат только оставляет совпавшие встречи в списке. Подсветки и перехода к найденному месту нет, хотя бэкенд возвращает `matchContext` и `timestamp` |
| Индикатор приватности | **Нет** | Нет значка вроде «всё локально / данные уходят в облако». Есть только: тост «Inform all participants this meeting is being recorded», подпись «Built-in AI (Offline, No API needed)» в выпадающем списке провайдеров и переключатель аналитики со ссылкой на Privacy Policy. При этом приложение умеет слать аналитику в PostHog (`us.i.posthog.com`; по умолчанию выключено, `analyticsOptedIn: false` в `AnalyticsProvider.tsx`), а при облачном провайдере (Claude, Groq, OpenRouter, OpenAI) транскрипт уходит наружу. Для индикатора это и есть два главных сигнала: провайдер резюме локальный или облачный, аналитика включена или нет |

---

## 8. Лицензия и бренд

**Лицензия**: MIT, `LICENSE.md`, «Copyright (c) 2024 Zackriya Solutions». Код можно менять, переименовывать и распространять, в том числе коммерчески, при условии, что текст лицензии и копирайт сохраняются в копиях. Важно: MIT не даёт прав на товарный знак. Название «Meetily» и логотип лучше заменить в форке, который будет распространяться. Права на сам знак в репозитории не описаны (см. «Что не удалось определить»).

**Где зашито название «Meetily» в интерфейсе (`frontend/src`, 39 вхождений):**
- `components/Sidebar/index.tsx:693`: подпись в сайдбаре
- `components/Logo.tsx:21,25,39,41,47`: alt, aria-label, заголовок «About Meetily»
- `components/Info.tsx:22,32`: «About Meetily»
- `components/About.tsx:26,57,63,98`: ссылка `meetily.zackriya.com`, alt логотипа, «What makes Meetily different»
- `components/TranscriptView.tsx:373`, `VirtualizedTranscriptView.tsx:260`: «Welcome to meetily!»
- `components/PreferenceSettings.tsx:166`, `PermissionWarning.tsx:101,127`
- `components/onboarding/steps/WelcomeStep.tsx:27`, `SetupOverviewStep.tsx:49`, `PermissionsStep.tsx:117`, `DownloadProgressStep.tsx:494`, `OnboardingFlow.tsx:35` (комментарий)
- `components/DatabaseImport/HomebrewDatabaseDetector.tsx:15,16,100,104`, `LegacyDatabaseImport.tsx:45,122,124,138` (там же пути `/opt/homebrew/var/meetily/...`, их не менять)
- `hooks/useRecordingStart.ts:18`: текст ошибки
- `app/metadata.ts:4`, `app/metadata.tsx:4`: `title: 'Meetily'`
- Технические ключи (не менять, иначе потеряются данные): `MeetingDetailsSplitView.tsx:6` (`meetily.meetingDetails...`), `services/indexedDBService.ts:34` (`MeetilyRecoveryDB`), `lib/analytics.ts:188,191` (`meetily_user_id`)
- `components/BluetoothPlaybackWarning.tsx:84`: битая ссылка `github.com/your-org/meetily/...`
- `components/AnalyticsConsentSwitch.tsx:150`: ссылка на Privacy Policy в репозитории `Zackriya-Solutions/meeting-minutes`

**В ядре и конфигурации** (видно пользователю, но это зона «не трогать» или отдельного решения):
- `src-tauri/tauri.conf.json`: `productName: "meetily"`, `identifier: "com.meetily.ai"`, заголовок окна `"meetily"`, адрес обновлений на GitHub Zackriya-Solutions
- `src-tauri/Cargo.toml`: `name = "meetily"`, `authors = ["Sujith S"]`
- `package.json`: `"name": "meetily"`
- `src-tauri/src/tray.rs:26`: подсказка трея «Meetily»
- `src-tauri/src/notifications/types.rs:122–174`, `notifications/commands.rs:335,385`: заголовок системных уведомлений
- Папки данных: `recording_preferences.rs` (`meetily-recordings`), `whisper_engine.rs:154`, `parakeet_engine.rs:294`, `model_manager.rs:148`, `templates/loader.rs:27` (`Meetily/…`)
- `parakeet_engine.rs:127`: адрес скачивания моделей `meetily.towardsgeneralintelligence.com`
- `whisper_engine.rs:1144,1657`: User-Agent
- `console_utils.rs`: имя процесса для `log stream`

**Логотипы и иконки:**
- `frontend/public/logo.png`, `logo-collapsed.png` (в `Logo.tsx`), `icon_128x128.png` (в `About.tsx`), `icon_32x32@2x.png`; остатки шаблона Next.js: `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`
- `frontend/src/app/favicon.ico`
- `frontend/src-tauri/icons/`: 25 файлов (`icon.icns`, `app_icon.icns`, `app_icon.ico`, `icon.png`, `Square*Logo.png`, `StoreLogo.png`, `icon_*`). Иконка трея берётся отсюда же
- Документация и README: `docs/logo1.png`, `logo2.png`, `logo3.png`, `Meetily-6.png`, скриншоты и GIF в `docs/`

**Прочие упоминания** (не UI): `README.md`, `CONTRIBUTING.md`, `PRIVACY_POLICY.md`, `docs/*.md`, `frontend/README.md`, `frontend/API.md`, скрипты `build*.{sh,bat,ps1}`, `dev-gpu.*`, workflow-файлы `.github/workflows/*.yml` (имена артефактов `meetily-macos-...`), `scripts/`.

---

## 9. План редизайна в 3 этапа

### Этап 1. Только стили (риск: **низкий**)
Что делаем:
- Подготовить браузерный мок по разделу 4. Это dev-инструмент, на продакшн-код он не влияет.
- Задать свою палитру, радиусы и тени в `globals.css` / `tailwind.config.js`, подключить шрифт (желательно локальный файл вместо `next/font/google`, чтобы сборка не зависела от сети).
- Заменить прямые `gray-*` / `blue-*` / `red-*` на семантические токены (`bg-background`, `text-muted-foreground`, `bg-primary`, `text-destructive`, плюс новые `success` / `warning`). Механическая замена по 14 самым частым классам покроет большую часть.
- Решить, нужна ли тёмная тема. Если нужна, это отдельная задача: сейчас она не включается нигде, а окно в `tauri.conf.json` жёстко светлое.
- Иконки и логотипы (`public/`, `favicon.ico`), тексты с «Meetily» в интерфейсе (без технических ключей).
- Тема BlockNote и sonner под новые токены.

Почему риск низкий: меняются только className, CSS и картинки, логика и вызовы не затрагиваются. Что может сломаться: вёрстка BlockNote (там `!important`-хаки), видимость состояний (disabled, focus), контраст. Проверять глазами в браузере на моках, затем один раз в сборке Tauri. Объём (оценка): 4–7 рабочих дней.

### Этап 2. Переработка экранов (риск: **средний**)
Что делаем:
- Сайдбар: разбить `Sidebar/index.tsx` (882 строки) на части; нормальное пустое состояние. Дата у встреч и группировка по датам упираются в ядро: `api_get_meetings` отдаёт только `id` и `title`. Без правки ядра дату можно получить только через `api_get_meeting_metadata` по каждой встрече (N запросов, на длинном списке медленно). Решение фиксируем в `decisions.md`.
- Главная: панель записи, реальный уровень звука вместо случайных полосок (событие `audio-levels` уже есть, используется только в `DeviceSelection`), понятные состояния «идёт / пауза / обработка / сохранение».
- Детали встречи: шапка (название, дата, длительность, шаблон), панель резюме, единый компонент пустого, загрузочного и ошибочного состояния.
- Настройки: упростить `ModelSettingsModal` (1408 строк) и менеджеры моделей; онбординг.
- Единые компоненты ошибок и пустых состояний вместо трёх разных механизмов.
- Убрать мёртвый код (раздел 2.3), страницу `/notes/[id]` и демо-ассеты Next.js.

Почему риск средний: вместе с JSX переносятся хуки и подписки на события. Легко потерять отписку `listen` (утечки, двойные события), сломать порядок провайдеров в `layout.tsx` или условия показа кнопки записи. Ядро и форматы не меняются. Снижаем риск так: сценарии (запись → стоп → сохранение → резюме → поиск → удаление) прогоняются на моках и затем вручную в сборке после каждого экрана. Объём (оценка): 2–3 недели.

### Этап 3. Правки логики вне ядра (риск: **средний / высокий**, зависит от пункта)
Только то, что делается на стороне интерфейса существующими командами:
- **Индикатор приватности** (риск низкий): значок в шапке или сайдбаре по уже доступным данным: провайдер резюме из `api_get_model_config` (локальный: ollama / builtin-ai; облачный: остальные), провайдер транскрипции из `api_get_transcript_config`, аналитика из `is_analytics_enabled`.
- **Поиск с переходом к месту** (риск низкий): показывать `matchContext`, по клику открывать встречу и прокручивать к сегменту по `timestamp`.
- **Ссылка из резюме на момент транскрипта** (риск средний): разбирать время из колонки «Segment Time stamp» в markdown резюме и прокручивать транскрипт к ближайшему сегменту. Это эвристика: модель пишет время как придётся. Воспроизведение звука с момента потребует плеера на `read_audio_file`, и это уже ощутимая работа.
- **Задачи с исполнителем** (риск средний): разбор таблицы Owner/Task/Due из резюме и отдельный вид «Задачи» только для чтения. Хранить статусы без изменения базы нельзя, а `localStorage` ненадёжен. Значит, полноценные задачи требуют изменения ядра и выходят за рамки этого этапа.
- **Шаблон по типу встречи** (риск низкий): подсказка или запоминание последнего шаблона на клиенте.
- **Правка расшифровки** (риск высокий): без новой команды в ядре и, возможно, без миграции не делается. В этом этапе не делаем, выносим в отдельное решение.

Почему риск выше: появляется своя логика (разбор текста LLM, состояние на клиенте), а ошибки в ней видны пользователю как «неправильные данные». Каждое изменение отдельным PR, с записью в `docs/case/decisions.md`.

---

## Что не удалось определить

1. **Реальное время и нагрузку сборки на macOS.** Цифры в разделе 6 являются оценкой по числу зависимостей и опыту похожих проектов. Разведка шла на Linux-контейнере без macOS, сборка не запускалась, `node_modules` не ставились.
2. **Как интерфейс выглядит вживую.** Приложение не запускалось. Состояния описаны по коду; скриншоты в `docs/*.png` могут быть устаревшими.
3. **Точные формы ответов** части команд (`api_list_templates`, `get_audio_devices`, `get_recording_state`, `get_onboarding_status`, модели Whisper/Parakeet). Примеры в разделе 4 сведены по типам интерфейса; перед написанием мока их надо сверить с Rust-структурами.
4. **Проходит ли `@tauri-apps/plugin-os` в браузере только с `mockIPC`.** Плагин читает глобальный объект при импорте; нужна ли дополнительная подкладка, видно только на практике.
5. **Права на товарный знак «Meetily»** и разрешено ли использовать логотип. В репозитории это не описано, MIT этого не покрывает.
6. **Работают ли сейчас две незарегистрированные команды** (`api_get_auto_generate_setting`, `builtin_ai_get_models_directory`): видимо, ошибка просто глотается в `catch`, но последствия для UI не проверялись.
7. **Можно ли убрать Remirror из зависимостей.** В `src` он не импортируется, но транзитивные зависимости и влияние на сборку BlockNote не проверялись.
