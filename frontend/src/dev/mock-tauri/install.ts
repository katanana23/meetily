// Установка заглушек. Подключается только из bootstrap.ts (dev + браузер без Tauri).

import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { MockBackend } from './backend';
import { FAILING_COMMANDS, UNREGISTERED_COMMANDS, handlers, notFound, pluginHandlers } from './handlers';
import { mountScenarioPanel } from './panel';
import { MOCK_OFF, SCENARIOS, resolveScenarioId } from './scenarios';

declare global {
  interface Window {
    __MEETILY_MOCK__?: {
      scenario: string;
      backend: MockBackend;
      calledCommands: Set<string>;
      unknownCommands: Set<string>;
      listenedEvents: Set<string>;
      handledCommands: string[];
      /** Отправить событие «от ядра» вручную, например emit('mic-unavailable'). */
      emit: (event: string, payload?: unknown) => Promise<void>;
      /** Готовые события, которые сами по таймеру не приходят. */
      presets: Record<string, () => Promise<void>>;
    };
  }
}

export function installMockTauri() {
  const scenarioId = resolveScenarioId();
  if (scenarioId === MOCK_OFF) {
    console.info('[mock-tauri] Заглушки отключены (?mock=off). Включить: ?mock=full');
    return;
  }
  const scenario = SCENARIOS[scenarioId];
  const be = new MockBackend(scenario);

  const calledCommands = new Set<string>();
  const unknownCommands = new Set<string>();
  const listenedEvents = new Set<string>();

  mockWindows('main');
  mockConvertFileSrc('macos');
  // plugin-os читает данные синхронно из этого объекта, а не через invoke
  (window as unknown as { __TAURI_OS_PLUGIN_INTERNALS__: unknown }).__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: 'macos', os_type: 'macos', family: 'unix', version: '15.0', arch: 'aarch64', eol: '\n', exe_extension: '',
  };

  mockIPC(
    (cmd, payload) => {
      const args = payload as Record<string, unknown> | undefined;
      calledCommands.add(cmd);

      if (UNREGISTERED_COMMANDS.includes(cmd)) {
        return Promise.reject(notFound(cmd));
      }
      if (scenario.failing && cmd in FAILING_COMMANDS) {
        console.warn(`[mock-tauri] error-сценарий: ${cmd} → ошибка`);
        if (cmd === 'start_recording_with_devices_and_meeting' || cmd === 'start_recording') {
          // как в recording_commands.rs: сначала событие, потом отказ
          be.emit('transcription-error', {
            error: FAILING_COMMANDS[cmd],
            userMessage: `Recording cannot start: ${FAILING_COMMANDS[cmd]}`,
            actionable: false,
            phase: 'startup',
          });
        }
        return Promise.reject(FAILING_COMMANDS[cmd]);
      }

      const handler = handlers[cmd] ?? pluginHandlers[cmd];
      if (handler) return handler(args, be);

      if (!unknownCommands.has(cmd)) {
        unknownCommands.add(cmd);
        console.warn(`[mock-tauri] Нет заглушки для команды "${cmd}", возвращаю null. Аргументы:`, args);
      }
      return null;
    },
    { shouldMockEvents: true },
  );

  // Подсматриваем подписки на события (для отчёта о покрытии).
  const internals = window.__TAURI_INTERNALS__ as { invoke: (cmd: string, args?: Record<string, unknown>, o?: unknown) => Promise<unknown> };
  const originalInvoke = internals.invoke;
  internals.invoke = (cmd, args, options) => {
    if (cmd === 'plugin:event|listen' && typeof args?.event === 'string') listenedEvents.add(args.event);
    // Обход ошибки в @tauri-apps/api/mocks 2.11: отписка ищет args.id, а event.js
    // присылает eventId. Без этого отписанные обработчики остаются в списке и
    // каждое событие сыплет предупреждениями "Couldn't find callback id".
    if (cmd === 'plugin:event|unlisten' && args && args.id === undefined) {
      return originalInvoke(cmd, { ...args, id: args.eventId }, options);
    }
    return originalInvoke(cmd, args, options);
  };

  window.__MEETILY_MOCK__ = {
    scenario: scenario.id,
    backend: be,
    calledCommands,
    unknownCommands,
    listenedEvents,
    handledCommands: Object.keys(handlers),
    emit: (event, payload) => be.emit(event, payload),
    presets: {
      micUnavailable: () => be.emit('mic-unavailable', null),
      micSwitched: () => be.emit('mic-device-switched', { device_name: 'USB-гарнитура «Сойка» (заглушка)' }),
      micSwapFailed: () => be.emit('mic-swap-failed', { error: 'Device busy', device_name: 'USB-гарнитура «Сойка» (заглушка)' }),
      micRecoveryExhausted: () => be.emit('mic-recovery-exhausted', { device_name: 'Встроенный микрофон (заглушка)' }),
      chunkDrop: () => be.emit('chunk-drop-warning', 'Transcription is falling behind: 12 audio chunks dropped'),
      transcriptError: () => be.emit('transcript-error', 'Whisper inference failed: out of memory'),
      transcriptionError: () => be.emit('transcription-error', { error: 'Model crashed', userMessage: 'Transcription stopped unexpectedly', actionable: true, phase: 'active' }),
      parakeetDownloadError: () => be.emit('parakeet-model-download-error', { modelName: 'parakeet-tdt-0.6b-v3-int8', error: 'Network error: connection reset' }),
      whisperDownloadError: () => be.emit('model-download-error', { modelName: 'small', error: 'Network error: connection reset' }),
      ollamaDownloadError: () => be.emit('ollama-model-download-error', { modelName: 'llama3.2:3b', error: 'pull failed: manifest not found' }),
      importError: () => be.emit('import-error', { error: 'Unsupported audio codec' }),
      retranscriptionError: () => be.emit('retranscription-error', { meeting_id: be.meetings[0]?.id ?? '', error: 'Model not loaded' }),
      stopFromTray: () => be.stopFromTray(),
      trayToggle: () => be.emit('request-recording-toggle', null),
      dragEnter: () => be.emit('tauri://drag-enter', { paths: [], position: { x: 0, y: 0 } }),
      dragDrop: () => be.emit('tauri://drag-drop', { paths: ['/mock/import/запись.m4a'], position: { x: 0, y: 0 } }),
      dragLeave: () => be.emit('tauri://drag-leave', null),
    },
  };

  if (scenario.recordingOnLoad) {
    if (window.location.pathname === '/') {
      // На главной запускаем запись настоящим путём приложения: как кнопка в трее
      // (request-recording-toggle → useRecordingStart → start_recording_with_devices_and_meeting).
      setTimeout(() => {
        if (!be.recording) be.emit('request-recording-toggle', null);
      }, 2500);
    } else {
      // На других страницах: ядро уже пишет (как после перезагрузки окна посреди записи),
      // реплики идут по таймеру.
      be.beginLive();
      setTimeout(() => be.emit('recording-started', { message: 'Recording started (mock)' }), 1500);
    }
  }

  console.info(
    `%c[mock-tauri]%c Режим заглушек: сценарий "${scenario.id}" — ${scenario.description}. ` +
      'Переключить: ?mock=empty|full|long|recording|error|onboarding, отключить: ?mock=off. ' +
      'Состояние: window.__MEETILY_MOCK__',
    'background:#7c3aed;color:#fff;padding:1px 4px;border-radius:3px',
    'color:inherit',
  );
  console.warn(
    '[mock-tauri] Не работает в браузере: захват звука, системные разрешения, трей, перетаскивание файлов из ОС, ' +
      'нативные уведомления, диалоги выбора файлов, открытие папок, запросы к LLM. Подробнее: docs/case/mock.md',
  );

  mountScenarioPanel(scenario.id);
}
