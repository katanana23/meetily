# Изоляция форка от оригинального Meetily

Дата: 2026-10-06. Основа: `docs/recon.md`, код на коммите `a2cb62e` (Release v0.4.1) плюс патч идентичности (коммит «chore(fork): isolate app identity»).

Цель: форк «Aid Meetings» и оригинальный Meetily стоят на одном Mac, работают одновременно и не читают и не пишут данные друг друга.

Почти все пути в Tauri 2 строятся от `identifier` из `tauri.conf.json`. На macOS `app_data_dir()` равен `~/Library/Application Support/<identifier>/`, на Windows `%APPDATA%\<identifier>\`, на Linux `~/.local/share/<identifier>/`. Поэтому главная правка одна: свой `identifier`. Остальные правки закрывают места, где ядро собирает путь по зашитому имени «Meetily», без учёта `identifier`.

Значения до и после:

| Что | Оригинал | Форк |
|---|---|---|
| `identifier` | `com.meetily.ai` | `io.github.katanana23.aid-meetings` |
| `productName` | `meetily` | `Aid Meetings` |
| Папка данных на macOS | `~/Library/Application Support/com.meetily.ai/` | `~/Library/Application Support/io.github.katanana23.aid-meetings/` |
| Папка записей на macOS | `~/Movies/meetily-recordings` | `~/Movies/aid-meetings-recordings` |
| Свои шаблоны и `notifications.json` на macOS | `~/Library/Application Support/Meetily/` | `~/Library/Application Support/Aid Meetings/` |

Колонка «Общий?» ниже отвечает на вопрос: будет ли ресурс общим с оригиналом, если `identifier` оставить прежним (`com.meetily.ai`).

---

## 1. Что хранит приложение и от чего зависит путь

| Ресурс | От чего зависит путь | Общий? | Файл и строка | Что менять для изоляции | Риск |
|---|---|---|---|---|---|
| **База SQLite** `meeting_minutes.sqlite` (+ `-wal`, `-shm`) и старая `meeting_minutes.db` | `app_data_dir()` → `identifier` | да | `frontend/src-tauri/src/database/manager.rs:46-67` (пути), `:35` (миграции), `:122-127`; `database/commands.rs:88-93`, `:228-250` | Сменить `identifier` (сделано) | Высокий. Встречи, транскрипты, резюме, API-ключи провайдеров лежат в базе. При общем пути база одна на двоих (см. раздел 3) |
| **plugin-store**: `preferences.json`, `analytics.json`, `store.json`, `recording_preferences.json`, `onboarding-status.json` | Относительные имена; plugin-store кладёт их в `app_data_dir()` → `identifier` | да | Интерфейс: `src/components/RecordingSettings.tsx:65,120`, `src/lib/recordingNotification.tsx:16,42`, `src/components/AnalyticsProvider.tsx:34,77`, `src/lib/analytics.ts:172`. Ядро: `src-tauri/src/audio/recording_preferences.rs:100,148`, `src-tauri/src/api/api.rs:209`, `src-tauri/src/onboarding.rs:50,88,116,141` | Сменить `identifier` (сделано). Имена файлов не трогать | Средний. Общие настройки, общий флаг онбординга, общий путь к папке записей |
| **Папка записей** (аудио, `transcripts.json`, метаданные встречи) | Зашитое имя `meetily-recordings` внутри `~/Movies` (macOS), `~/Music` (Windows), `~/Documents` (Linux). От `identifier` **не зависит** | да, даже при новом `identifier` | `src-tauri/src/audio/recording_preferences.rs:43-77`; имя теперь в `src-tauri/src/config.rs:61` | Вынесено в константу `RECORDINGS_DIR_NAME = "aid-meetings-recordings"` (сделано) | Средний. Две программы пишут встречи в одну папку, ссылки из базы одной программы указывают на файлы, которые может удалить другая. Если пользователь уже выбрал свою папку в настройках, путь берётся из `recording_preferences.json` |
| **Временный WAV при остановке из трея** | `app_data_dir()` → `identifier` | да | `src-tauri/src/tray.rs:66,162` | Ничего, следует за `identifier` | Низкий |
| **Папка своих шаблонов** | `dirs::data_dir()` + зашитое `Meetily` + `templates`. От `identifier` **не зависит** | да, даже при новом `identifier` | `src-tauri/src/summary/templates/loader.rs:25-30`, комментарии `loader.rs:22-24`, `templates/mod.rs:34-36`; имя в `src-tauri/src/config.rs:58` | Вынесено в константу `APP_DATA_DIR_NAME` (сделано) | Низкий. Шаблоны только читаются, но правка шаблона в одной программе меняет резюме в другой |
| **Настройки уведомлений** `notifications.json` | `dirs::config_dir()` + зашитое `meetily`. От `identifier` **не зависит** | да, даже при новом `identifier` | `src-tauri/src/notifications/settings.rs:114-127` | Вынесено в константу `APP_DATA_DIR_NAME` (сделано) | Низкий. На macOS `config_dir` и `data_dir` совпадают, а APFS по умолчанию не различает регистр, поэтому у оригинала `meetily/` и `Meetily/` это одна папка. У форка это `Aid Meetings/` |
| **Модели Whisper** | `app_data_dir()/models` → `identifier`. Запасной путь `dirs::data_dir()/Meetily/models` | да | `src-tauri/src/whisper_engine/commands.rs:15-32`; запасной путь `whisper_engine/whisper_engine.rs:150-155` | **Не менялось** по решению задачи | См. раздел 2. После смены `identifier` форк ищет модели в своей папке и скачает их заново |
| **Модели Parakeet** | `app_data_dir()/models/parakeet` → `identifier`. Запасной путь `dirs::data_dir()/Meetily/models/parakeet` | да | `src-tauri/src/parakeet_engine/commands.rs:15-19`; запасной путь `parakeet_engine/parakeet_engine.rs:291-296`; адрес скачивания `parakeet_engine.rs:127` (сервер оригинала) | **Не менялось** | То же, что для Whisper |
| **Встроенная LLM** (сайдкар `llama-helper`, GGUF) | `app_data_dir()/models/summary` → `identifier`. Запасной путь `dirs::data_dir()/Meetily/models/summary` | да | `src-tauri/src/summary/summary_engine/commands.rs:53`, `:363`; запасной путь `summary_engine/model_manager.rs:145-150` | **Не менялось** | То же. Модели большие (гигабайты) |
| **Логи** | Только stderr через `env_logger`, файла логов нет. Консоль на macOS: `log stream --process meetily` | нет | `src-tauri/src/main.rs:10-11`; `src-tauri/src/console_utils/console_utils.rs:52,90,132` | Ничего. Имя процесса берётся из имени бинарника (`name = "meetily"` в `Cargo.toml`), его не меняли | Низкий. В консоли разработчика `log stream --process meetily` покажет логи обеих программ, если обе запущены |
| **Кэш WebView** | На macOS WKWebView хранит кэш в `~/Library/Caches/<identifier>/` и `~/Library/WebKit/<identifier>/` | да | Задаётся Tauri и WebKit, в коде нет | Сменить `identifier` (сделано) | Низкий |
| **localStorage и sessionStorage WebView** (ключи `betaFeatures`, `providerModelMap`, `primaryLanguage`, `isAutoSummary`, `meetily.meetingDetails.transcriptPaneRatio` и др.) | Хранилище WebKit, на macOS разделено по bundle id (`identifier`); origin у обеих программ одинаковый (`tauri://localhost`) | да | Например `src/components/MeetingDetails/MeetingDetailsSplitView.tsx:6`, `src/lib/analytics.ts:188-191` | Сменить `identifier` (сделано). **Ключи не переименовывать** | Средний. При общем хранилище бета-флаги и выбор модели одной программы влияют на другую |
| **IndexedDB** `MeetilyRecoveryDB` (резервная копия транскрипта во время записи) | Хранилище WebKit по `identifier` | да | `src/services/indexedDBService.ts:34` | Сменить `identifier` (сделано). **Имя базы не переименовывать** | Высокий при общем хранилище: окно восстановления одной программы предложит «восстановить» и сохранит в свою базу запись другой |
| **Трей** | Иконка с id `main-tray`, подсказка | нет (иконка своя у каждого процесса) | `src-tauri/src/tray.rs:23-27` | Подсказка `APP_DISPLAY_NAME` (сделано) | Низкий. Без правки в трее были бы две одинаковые иконки «Meetily» |
| **Системные уведомления** | На macOS Центр уведомлений регистрирует отправителя по bundle id; заголовок задаёт ядро | да (одна запись в «Уведомлениях» и общий запрет или разрешение) | Заголовки: `src-tauri/src/notifications/types.rs:122,129,139,149,163,174,182,192`, `notifications/commands.rs:335,385` | `identifier` и заголовки через `APP_DISPLAY_NAME` / `APP_ERROR_TITLE` (сделано) | Низкий |
| **Единственный экземпляр** | Плагин `single-instance`, на macOS и Linux это сокет `/tmp/<identifier с _ вместо . и ->_si.sock` | да | Подключение: `src-tauri/src/lib.rs:452-463`. Путь сокета: плагин `tauri-plugin-single-instance 2.3.7`, `src/platform_impl/macos.rs:60-70` | Сменить `identifier` (сделано) | Высокий при общем `identifier`: второй запущенный (форк) найдёт сокет оригинала, покажет окно оригинала и закроется. Две программы одновременно не запустить |
| **Схемы адресов (deep-link)** | Не используются: плагина `deep-link` нет в `Cargo.toml`, схем нет в `tauri.conf.json` и `Info.plist` | нет | `src-tauri/Cargo.toml:152-168` (список плагинов) | Ничего | Нет. Если оригинал добавит схему `meetily://`, при слиянии её надо переименовать |
| **Автозапуск** | Не используется: плагина `autostart` нет | нет | `src-tauri/Cargo.toml:152-168` | Ничего | Нет |
| **Разрешения macOS** (микрофон, запись экрана, захват системного звука) | TCC хранит разрешения по bundle id и подписи. Подпись ad-hoc (`signingIdentity: "-"`) | да | `src-tauri/Info.plist`, `src-tauri/entitlements.plist`, `tauri.conf.json:104-108` | Сменить `identifier` (сделано) | Средний. При общем bundle id сброс разрешения для одной программы сбрасывает его для другой. С новым id форк спросит разрешения сам. Ad-hoc подпись меняется при каждой сборке, macOS может спрашивать повторно после пересборки (так же и у оригинала) |
| **Автообновление** | `plugins.updater` в `tauri.conf.json`: адрес `latest.json` на GitHub оригинала и публичный ключ оригинала | да | Конфиг: `src-tauri/tauri.conf.json:113-118`, `bundle.createUpdaterArtifacts` `:91`. Плагин: `src-tauri/src/lib.rs:469`. Интерфейс: `src/services/updateService.ts:64`, `src/components/UpdateDialog.tsx:37,61`, `src/hooks/useUpdateCheck.ts:20-46` | Адрес и ключ убраны (`endpoints: []`, `pubkey: ""`), `createUpdaterArtifacts: false` (сделано) | Высокий без правки: форк скачал бы сборку оригинала, подписанную ключом оригинала, и **заменил бы себя оригиналом** |
| **Аналитика** (PostHog, идентификатор пользователя) | `user_id` хранится в `analytics.json` (plugin-store → `identifier`); запасной вариант `sessionStorage['meetily_user_id']`. Отправка на `us.i.posthog.com` с ключом проекта оригинала | да | `src/lib/analytics.ts:168-196`; согласие `src/components/AnalyticsProvider.tsx:34,77`; клиент `src-tauri/src/analytics/commands.rs:10-21`, `src-tauri/src/analytics/analytics.rs:48` | `identifier` разделяет `user_id` и согласие (сделано). Ключ PostHog и хост не трогали | Средний. По умолчанию аналитика выключена (`analyticsOptedIn: false`). Если её включить в форке, события уйдут в проект PostHog оригинала. Ключ лучше убрать отдельной правкой ядра, если аналитика в форке не нужна |
| **Установка на диск** | Имя `.app` и установщика берётся из `productName` | да (`meetily.app` затёр бы `meetily.app`) | `src-tauri/tauri.conf.json:3` | `productName: "Aid Meetings"` (сделано) | Средний: без правки установка форка заменила бы программу оригинала в `/Applications` |

## 2. Модели оставлены как есть: решение и риск

По задаче модели (Whisper, Parakeet, встроенная LLM) остаются в «общей папке», код путей моделей не менялся.

Важная деталь: в рабочей сборке путь моделей берётся не из зашитого `Meetily`, а из `app_data_dir()/models`, то есть **зависит от `identifier`**. Зашитый `dirs::data_dir()/Meetily/models` используется только как запасной путь, когда ядро не передало папку (в обычной работе не срабатывает). Отсюда:

- После смены `identifier` модели форка лежат в `~/Library/Application Support/io.github.katanana23.aid-meetings/models/`, отдельно от оригинала. Форк скачает модели заново (это гигабайты диска и трафика).
- Если нужна действительно общая папка, её можно сделать без правок кода: закрыть обе программы и заменить папку `models` форка символической ссылкой на папку оригинала:
  `ln -s "$HOME/Library/Application Support/com.meetily.ai/models" "$HOME/Library/Application Support/io.github.katanana23.aid-meetings/models"` (папка `models` форка перед этим должна отсутствовать).
- Риск общей папки: обе программы могут одновременно качать или удалять одну и ту же модель. Удаление модели в настройках форка удалит её и у оригинала. Частично скачанный файл одной программы другая может принять за готовую модель. Форматы моделей у обеих программ одинаковые, пока оригинал не сменит каталог моделей.
- Запасные пути `.../Meetily/models` (`whisper_engine.rs:154`, `parakeet_engine.rs:294`, `model_manager.rs:148`) остались с именем оригинала намеренно.

---

## 3. Что может повредить данные оригинала, если `identifier` совпадает

Всё ниже относится к сценарию «форк собран с `com.meetily.ai`». С патчем идентичности эти пути у форка свои.

1. **Миграции базы.** При каждом запуске ядро выполняет `sqlx::migrate!("./migrations")` (`database/manager.rs:35`) над `meeting_minutes.sqlite`. Если в форке появится своя миграция, она применится к базе оригинала. После этого оригинал при запуске увидит в `_sqlx_migrations` версию, которой у него нет, и sqlx откажется работать («migration … was previously applied but is missing»). Оригинал перестанет открываться. Обратное тоже верно: новая миграция оригинала сломает старый форк. Изменение уже применённой миграции (другая контрольная сумма) ломает обе программы.
2. **Удаление WAL и SHM.** Если база не открылась с ошибкой «malformed» или «corrupt», ядро удаляет `meeting_minutes.sqlite-wal` и `-shm` (`database/manager.rs:78-97`). Если в этот момент оригинал работает и держит в WAL незаписанные транзакции, они теряются, база может стать неконсистентной.
3. **Одновременная запись в SQLite** из двух процессов. В режиме WAL это допустимо, но при длинных транзакциях вторая программа получит `database is locked` и может не сохранить встречу или резюме.
4. **Удаление встреч.** Встреча, удалённая в одной программе, исчезнет и в другой вместе с папкой записи, если путь записи общий.
5. **Импорт старой базы.** `import_and_initialize_database` копирует выбранный файл в `app_data_dir/meeting_minutes.db` (`database/manager.rs:147-154`) и затем мигрирует его в `meeting_minutes.sqlite`. При общем `app_data_dir` это перезапись чужого рабочего каталога. Сам исходный файл только копируется, не меняется.
6. **plugin-store.** Сброс онбординга, смена пути записей, выключение уведомлений в форке меняют поведение оригинала. Разный формат значений в будущем может сломать чтение настроек у одной из программ.
7. **IndexedDB `MeetilyRecoveryDB`.** Окно восстановления после сбоя у одной программы покажет и сохранит в свою базу незаконченную запись другой, а затем очистит её.
8. **Модели.** Удаление или повторная загрузка модели в одной программе затрагивает другую.
9. **Автообновление.** Форк с адресом и ключом оригинала обновится до сборки оригинала и потеряет все правки.
10. **Единственный экземпляр.** Форк не запустится, пока работает оригинал (и наоборот), а его окно «вызовет» окно оригинала.
11. **Разрешения macOS.** `tccutil reset … com.meetily.ai` для одной программы сбросит разрешения другой.

---

## 4. Перечень правок патча идентичности

Коммит «chore(fork): isolate app identity». Номера строк указаны после патча. При обновлении оригинала эти места проверять в первую очередь.

| Файл | Строка | Было | Стало |
|---|---|---|---|
| `frontend/src-tauri/tauri.conf.json` | 3 | `"productName": "meetily"` | `"productName": "Aid Meetings"` |
| `frontend/src-tauri/tauri.conf.json` | 5 | `"identifier": "com.meetily.ai"` | `"identifier": "io.github.katanana23.aid-meetings"` |
| `frontend/src-tauri/tauri.conf.json` | 15 | `"title": "meetily"` | `"title": "Aid Meetings"` |
| `frontend/src-tauri/tauri.conf.json` | 91 | `"createUpdaterArtifacts": true` | `"createUpdaterArtifacts": false` |
| `frontend/src-tauri/tauri.conf.json` | 115 | `"pubkey": "<ключ оригинала>"` | `"pubkey": ""` |
| `frontend/src-tauri/tauri.conf.json` | 116 | `"endpoints": ["https://github.com/Zackriya-Solutions/meeting-minutes/releases/latest/download/latest.json"]` | `"endpoints": []` |
| `frontend/src-tauri/src/config.rs` | 38-61 (новый блок в конце файла) | — | макрос `fork_app_name!()` = `"Aid Meetings"`; константы `APP_DISPLAY_NAME`, `APP_ERROR_TITLE`, `APP_DATA_DIR_NAME`, `RECORDINGS_DIR_NAME = "aid-meetings-recordings"` |
| `frontend/src-tauri/src/tray.rs` | 26 | `.tooltip("Meetily")` | `.tooltip(crate::config::APP_DISPLAY_NAME)` |
| `frontend/src-tauri/src/notifications/types.rs` | 122, 129, 139, 149, 163, 174, 192 | `"Meetily"` | `crate::config::APP_DISPLAY_NAME` |
| `frontend/src-tauri/src/notifications/types.rs` | 182 | `"Meetily Error"` | `crate::config::APP_ERROR_TITLE` |
| `frontend/src-tauri/src/notifications/commands.rs` | 335, 385 | `let title = "Meetily";` | `let title = crate::config::APP_DISPLAY_NAME;` |
| `frontend/src-tauri/src/notifications/settings.rs` | 118 | `path.push("meetily");` | `path.push(crate::config::APP_DATA_DIR_NAME);` |
| `frontend/src-tauri/src/summary/templates/loader.rs` | 27 | `path.push("Meetily");` | `path.push(crate::config::APP_DATA_DIR_NAME);` |
| `frontend/src-tauri/src/summary/templates/loader.rs` | 22-24 | комментарий с `Meetily` | комментарий с `<APP_DATA_DIR_NAME>` (заодно исправлен путь Linux: `dirs::data_dir()` это `~/.local/share`) |
| `frontend/src-tauri/src/summary/templates/mod.rs` | 34-36 | комментарий с `Meetily` | комментарий с `<APP_DATA_DIR_NAME>` |
| `frontend/src-tauri/src/audio/recording_preferences.rs` | 48, 53, 61, 66, 75 | `.join("meetily-recordings")` | `.join(crate::config::RECORDINGS_DIR_NAME)` |
| `frontend/src-tauri/src/audio/recording_preferences.rs` | 46, 59, 72 | комментарии с `meetily-recordings` | комментарии с `<RECORDINGS_DIR_NAME>` |

Логика не менялась: заменены только строковые литералы на константы с новым значением и значения в конфиге.

### Где менять название форка

Одним коммитом в двух местах (в Rust нельзя прочитать `tauri.conf.json` на этапе компиляции без новой логики):

1. `frontend/src-tauri/src/config.rs`: литерал в `fork_app_name!` и, если нужно, `RECORDINGS_DIR_NAME`.
2. `frontend/src-tauri/tauri.conf.json`: `productName` (строка 3) и `app.windows[0].title` (строка 15). `identifier` менять не стоит: при его смене пользователь потеряет доступ к своим данным (новая пустая папка).

Смена `APP_DATA_DIR_NAME` или `RECORDINGS_DIR_NAME` после того, как форком уже пользовались, тоже «теряет» свои шаблоны и папку записей по умолчанию (старые файлы остаются на диске, их надо перенести руками).

### Что сознательно не менялось

- **Технические ключи** localStorage, sessionStorage и IndexedDB: `meetily.meetingDetails.transcriptPaneRatio` (`MeetingDetailsSplitView.tsx:6`), `MeetilyRecoveryDB` (`indexedDBService.ts:34`), `meetily_user_id` (`analytics.ts:188,191`). Хранилище и так разделено по `identifier`, а переименование потеряло бы данные.
- **Интерфейс** (`frontend/src`): тексты «Meetily», «Welcome to meetily!», логотипы, `app/metadata.ts` (`title: 'Meetily'`). Заголовок окна из `tauri.conf.json` после загрузки страницы может перекрыться `<title>` из `metadata.ts`, то есть в окне снова будет «Meetily». Это правка интерфейса, по условиям задачи не делалась.
- **Имя пакета и бинарника** (`Cargo.toml: name = "meetily"`, `package.json: "name": "meetily"`). На пути данных не влияют. Имя бинарника нужно для `log stream --process meetily` в `console_utils.rs`.
- **Модели**: см. раздел 2.
- **Строка ошибки** `Restart Meetily…` (`src-tauri/src/audio/recording_commands.rs:111`), User-Agent `Meetily/…` при скачивании моделей (`whisper_engine.rs:1144,1657`), имя аудиотапа `meetily-audio-tap` (`audio/capture/core_audio.rs:139`), префикс временных файлов `.meetily_decode_` (`audio/decoder.rs:294`), переменная окружения `MEETILY_LLAMA_HELPER` (`summary_engine/sidecar.rs:110`). Это не пути данных: имя тапа и префикс уникальны внутри процесса (у временных файлов случайный суффикс), остальное только текст.
- **Адрес скачивания Parakeet** на сервере оригинала (`parakeet_engine.rs:127`) и **ключ PostHog** (`analytics/commands.rs:12`): это внешние сервисы оригинала, а не пути данных. Решение по ним отдельное.
- Права в `capabilities` (`updater:default`, `process:default`) оставлены. Проверка обновлений в интерфейсе теперь падает с ошибкой «нет адресов», ошибка тихо глотается в `useUpdateCheck.ts:41-43`. Ручная проверка из диалога обновлений покажет ошибку.

### Как проверить изоляцию на Mac

1. Собрать форк, запустить его при открытом оригинале. Должны быть две иконки в трее, два окна.
2. `ls ~/Library/Application\ Support/` → появилась `io.github.katanana23.aid-meetings/` и, после первого сохранения шаблона или настроек уведомлений, `Aid Meetings/`.
3. Сделать запись в форке → файл в `~/Movies/aid-meetings-recordings/`.
4. Встреча форка не видна в оригинале и наоборот.
5. `ls -la ~/Library/Application\ Support/com.meetily.ai/` до и после работы форка: даты изменения файлов оригинала не меняются.
