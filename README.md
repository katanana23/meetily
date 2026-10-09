# Aid Meetings

> **Это форк Meetily, а не оригинал.**
> Оригинальный проект: [Zackriya-Solutions/meeting-minutes](https://github.com/Zackriya-Solutions/meeting-minutes) (Meetily).
> Код распространяется по лицензии MIT, текст лицензии и копирайт оригинала сохранены в [LICENSE.md](LICENSE.md).
> Форк не связан с авторами оригинала и не поддерживается ими. Вопросы по форку задавайте в этом репозитории, не в оригинальном.

## Отличия от оригинала

- **Своя идентичность приложения**: имя «Aid Meetings», идентификатор `io.github.katanana23.aid-meetings`. Форк ставится рядом с оригиналом и работает одновременно с ним на одном Mac.
- **Свои данные**: отдельная база, настройки, хранилище WebView, папка своих шаблонов, папка записей по умолчанию `~/Movies/aid-meetings-recordings`. Данные оригинала форк не читает и не меняет. Подробно: [docs/isolation.md](docs/isolation.md).
- **Автообновление отключено**: адрес обновлений и ключ подписи оригинала убраны. Форк не скачивает и не ставит сборки оригинала.
- **Модели** (Whisper, Parakeet, встроенная LLM) лежат в папке данных форка и скачиваются заново. Как подключить папку моделей оригинала и чем это рискованно: [docs/isolation.md, раздел 2](docs/isolation.md#2-модели-оставлены-как-есть-решение-и-риск).
- **Политика веток**: `main` это зеркало оригинала, работа идёт в ветке `aid`. Как подтягивать обновления оригинала: [docs/FORK.md](docs/FORK.md).
- Интерфейс пока не менялся и местами показывает название оригинала.

## Что это

Приложение для записи, расшифровки и резюме встреч, которое работает локально на компьютере.

- Запись микрофона и системного звука одновременно, с микшированием.
- Расшифровка на устройстве моделями Whisper или Parakeet, без облака.
- Резюме встреч через выбранного провайдера: Ollama (локально), встроенная модель, Claude, Groq, OpenRouter, OpenAI или свой совместимый с OpenAI адрес. При облачном провайдере текст встречи уходит этому провайдеру.
- Импорт аудиофайлов и повторная расшифровка (бета).
- Ускорение на GPU: Metal и CoreML на macOS, Vulkan или CUDA при сборке на Windows и Linux.

Архитектура: настольное приложение на [Tauri](https://tauri.app/) с ядром на Rust и интерфейсом на Next.js. Подробнее: [docs/architecture.md](docs/architecture.md). Каталог `backend/` это архив старого сервера на Python, он не поддерживается.

## Сборка из исходников

Готовых сборок форка нет. Сборка на macOS:

```bash
git clone https://github.com/katanana23/meetily
cd meetily
git checkout aid
cd frontend
pnpm install --frozen-lockfile
./clean_build.sh
```

Требования и сборка на других системах: [docs/BUILDING.md](docs/BUILDING.md), [docs/building_in_linux.md](docs/building_in_linux.md).

## Участие

Изменения направляйте pull request-ом в ветку `aid`. Правила веток и правок ядра: [docs/FORK.md](docs/FORK.md). Исправления, полезные оригиналу, лучше предлагать в [оригинальный репозиторий](https://github.com/Zackriya-Solutions/meeting-minutes).

## Лицензия

MIT. См. [LICENSE.md](LICENSE.md). Copyright оригинала: Zackriya Solutions. Лицензия MIT не даёт прав на товарный знак оригинала.

## Благодарности

- Авторам и участникам оригинального проекта Meetily.
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp), [Screenpipe](https://github.com/mediar-ai/screenpipe), [transcribe-rs](https://crates.io/crates/transcribe-rs): из них заимствована часть кода оригинала.
- NVIDIA за модель Parakeet и [istupakov](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx) за её конвертацию в ONNX.
