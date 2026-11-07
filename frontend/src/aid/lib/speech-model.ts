// Модель распознавания по умолчанию для новых установок: Whisper large-v3-turbo-q5_0.
//
// Почему не Parakeet: он не принимает язык и на каждом куске речи сам решает, какой
// это язык; на фоне музыки уходит в английский и португальский. Whisper получает язык
// из настроек (по умолчанию язык системы, lib/system-language.ts). Turbo это кодировщик
// large-v3 с лёгким декодером: качество близко к large-v3, работает быстрее medium;
// q5_0 втрое меньше по размеру (547 МБ). Parakeet остаётся выбором в настройках.
//
// Только существующие команды ядра: whisper_init, whisper_get_available_models,
// whisper_download_model (события model-download-progress / -complete / -error)
// и api_save_transcript_config. Ядро не меняется: complete_onboarding по-прежнему
// пишет Parakeet, поэтому saveDefaultSpeechModel() вызывать ПОСЛЕ него.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ModelInfo } from '@/lib/whisper';

export const DEFAULT_SPEECH_PROVIDER = 'localWhisper';
export const DEFAULT_SPEECH_MODEL = 'large-v3-turbo-q5_0';
/** Размер из каталога ядра (config.rs): Whisper шлёт только проценты. */
const MODEL_MB = 547;
/** Нет событий загрузки дольше этого и 0 %: предложить «Повторить». */
const STALL_MS = 20_000;

/** То же состояние, что ждёт ReadyStep (SpeechModelState). */
export interface DefaultSpeechModelState {
  ready: boolean;
  percent: number;
  downloadedMb: number;
  totalMb: number;
  failed: boolean;
  retrying: boolean;
}

const log = (message: string, extra?: unknown) =>
  extra === undefined ? console.info('[aid] модель распознавания:', message) : console.info('[aid] модель распознавания:', message, extra);

function statusOf(models: ModelInfo[]) {
  const status = models.find((m) => m.name === DEFAULT_SPEECH_MODEL)?.status;
  if (status === 'Available') return { ready: true, percent: 100, downloading: false };
  if (status && typeof status === 'object' && 'Downloading' in status) {
    return { ready: false, percent: status.Downloading.progress, downloading: true };
  }
  return { ready: false, percent: 0, downloading: false };
}

/**
 * Загрузка модели по умолчанию. start() идемпотентен: если модель уже скачана
 * или качается (повторный вход в первый запуск), новую загрузку не начинает.
 */
export function useDefaultSpeechModel() {
  const [ready, setReady] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [active, setActive] = useState(false);
  const started = useRef(false);
  const lastEventAt = useRef(0);

  useEffect(() => {
    const touch = () => {
      lastEventAt.current = Date.now();
      setStalled(false);
    };
    const offProgress = listen<{ modelName: string; progress: number }>('model-download-progress', (event) => {
      if (event.payload.modelName !== DEFAULT_SPEECH_MODEL) return;
      touch();
      setError(false);
      setPercent(event.payload.progress);
    });
    const offComplete = listen<{ modelName: string }>('model-download-complete', (event) => {
      if (event.payload.modelName !== DEFAULT_SPEECH_MODEL) return;
      touch();
      log('скачана');
      setPercent(100);
      setReady(true);
    });
    const offError = listen<{ modelName: string; error: string }>('model-download-error', (event) => {
      if (event.payload.modelName !== DEFAULT_SPEECH_MODEL) return;
      touch();
      log('ошибка загрузки', event.payload.error);
      setError(true);
    });
    return () => {
      void offProgress.then((off) => off());
      void offComplete.then((off) => off());
      void offError.then((off) => off());
    };
  }, []);

  const download = useCallback(() => {
    lastEventAt.current = Date.now();
    setActive(true);
    // Команда ждёт конца загрузки: не ждём её, ход загрузки приходит событиями
    invoke('whisper_download_model', { modelName: DEFAULT_SPEECH_MODEL }).catch((err) => {
      // «уже качается» не ошибка; остальное ядро дублирует событием model-download-error
      if (String(err).toLowerCase().includes('already')) return;
      log('загрузка не началась', err);
      setError(true);
    });
  }, []);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    try {
      await invoke('whisper_init');
      const current = statusOf(await invoke<ModelInfo[]>('whisper_get_available_models'));
      setPercent(current.percent);
      if (current.ready) {
        log(`${DEFAULT_SPEECH_MODEL} уже скачана`);
        setReady(true);
        return;
      }
      if (current.downloading) {
        log(`${DEFAULT_SPEECH_MODEL} уже качается`);
        lastEventAt.current = Date.now();
        setActive(true);
        return;
      }
      log(`загрузка ${DEFAULT_SPEECH_MODEL}: старт`);
      download();
    } catch (err) {
      log('не удалось проверить модели', err);
      setError(true);
    }
  }, [download]);

  const retry = useCallback(() => {
    setRetrying(true);
    setError(false);
    setStalled(false);
    if (!started.current) {
      void start().finally(() => setRetrying(false));
      return;
    }
    download();
    // Ответ команды придёт только в конце загрузки: кнопку отпускаем сразу
    window.setTimeout(() => setRetrying(false), 1000);
  }, [download, start]);

  // Загрузка не пошла: через STALL_MS без событий и на 0 % предложить «Повторить»
  useEffect(() => {
    if (!active || ready) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastEventAt.current > STALL_MS && percent === 0) setStalled(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, ready, percent]);

  const state: DefaultSpeechModelState = {
    ready,
    percent: ready ? 100 : percent,
    downloadedMb: ((ready ? 100 : percent) * MODEL_MB) / 100,
    totalMb: MODEL_MB,
    failed: !ready && (error || stalled),
    retrying,
  };

  return { state, start, retry };
}

/**
 * Записать Whisper моделью распознавания. Вызывать после complete_onboarding:
 * он сам пишет Parakeet. Ошибку не скрываем, вызывающий решает, что показать.
 */
export async function saveDefaultSpeechModel(): Promise<void> {
  await invoke('api_save_transcript_config', { provider: DEFAULT_SPEECH_PROVIDER, model: DEFAULT_SPEECH_MODEL, apiKey: null });
  log(`выбрана ${DEFAULT_SPEECH_MODEL} (Whisper)`);
}
