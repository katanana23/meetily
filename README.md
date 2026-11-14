# Shade

Приватный ассистент встреч для Mac: запись, расшифровка и итоги прямо на компьютере, без облака.

Основан на [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) (MIT); проект не связан с его авторами.

## Что умеет

- Запись микрофона и системного звука одновременно, с микшированием.
- Расшифровка на устройстве моделями Whisper или Parakeet.
- Итоги встречи встроенной локальной моделью или выбранным провайдером: Ollama, Claude, Groq, OpenRouter, OpenAI или свой совместимый с OpenAI адрес. При облачном провайдере текст встречи уходит этому провайдеру.
- Корзина встреч на 30 дней, импорт аудиофайлов и повторная расшифровка (бета).
- Ускорение на GPU: Metal и CoreML на macOS.

Архитектура: настольное приложение на [Tauri](https://tauri.app/) с ядром на Rust и интерфейсом на Next.js. Подробнее: [docs/architecture.md](docs/architecture.md). Каталог `backend/` это архив старого сервера на Python, он не поддерживается.

## Данные

- Папка приложения: `~/Library/Application Support/io.github.katanana23.shade/` (база встреч, модели, настройки).
- Записи по умолчанию: `~/Movies/Shade`, корзина внутри: `Корзина Shade`.
- Перенос данных из сборок под прежним именем: `scripts/migrate-from-aid.sh` (подробно в начале скрипта).

## Сборка из исходников

Готовых сборок нет. Сборка на macOS:

```bash
git clone https://github.com/katanana23/shade
cd shade
git checkout shade
cd frontend
pnpm install --frozen-lockfile
./clean_build.sh
```

Требования и сборка на других системах: [docs/BUILDING.md](docs/BUILDING.md), [docs/building_in_linux.md](docs/building_in_linux.md).

## Участие

Изменения направляйте pull request-ом в ветку `shade`; `main` зеркалит оригинал. Правила веток и правок ядра: [docs/FORK.md](docs/FORK.md).

## Лицензия

MIT, текст лицензии и копирайт оригинала сохранены в [LICENSE.md](LICENSE.md). Лицензия MIT не даёт прав на товарный знак оригинала.

## Благодарности

[Whisper.cpp](https://github.com/ggerganov/whisper.cpp), [Screenpipe](https://github.com/mediar-ai/screenpipe), [transcribe-rs](https://crates.io/crates/transcribe-rs): из них заимствована часть кода оригинала. NVIDIA за модель Parakeet и [istupakov](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx) за её конвертацию в ONNX.
