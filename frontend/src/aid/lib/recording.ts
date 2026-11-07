// Запись в aid-интерфейсе: тонкая обёртка над оригинальными хуками старта и стопа.
// Логика ядра не дублируется: проверка модели, имя встречи, ожидание транскрипции,
// сохранение и переход к встрече остаются в useRecordingStart и useRecordingStop.
// Кнопка в трее работает через событие start-recording-from-sidebar,
// которое слушает useRecordingStart.
//
// Сверху Aid добавляет две проверки:
// - перед стартом: есть ли модель распознавания и доступ к микрофону (mic-access.ts).
//   Без доступа macOS отдаёт ядру тишину вместо ошибки, и запись шла бы молча
//   без голоса, поэтому запись не стартует, а у кнопки записи появляется карточка
//   «Нет доступа к микрофону». Записать только звук компьютера можно, но это
//   явный выбор человека (start({ systemOnly: true })), а не молчаливый старт;
// - после стопа: решение по содержанию, а не по длительности (recording-outcome.tsx).

'use client';

import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingStateSync } from '@/hooks/useRecordingStateSync';
import { useRecordingStart } from '@/hooks/useRecordingStart';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { getProviderCommands, hasDownloadingModel, type ModelWithStatus } from '@/lib/transcription-model-readiness';
import { aidToast } from './toasts';
import { checkMicrophone, checkSystemAudio, isMicRefusal } from './mic-access';
import { useRecordingOutcome } from './recording-outcome';

export type StartBlocker =
  | { kind: 'no-model' }
  | { kind: 'model-downloading' }
  /** Микрофона нет в списке устройств. systemAudio: можно записать только звук компьютера. */
  | { kind: 'no-microphone'; systemAudio?: boolean }
  /**
   * macOS не даёт доступ к микрофону. systemAudio: можно записать только звук
   * компьютера; coreRefused: ядро само отказалось стартовать без микрофона;
   * stillDenied: перепроверили после «Открыть настройки», доступа всё ещё нет.
   */
  | { kind: 'mic-denied'; systemAudio: boolean; coreRefused?: boolean; stillDenied?: boolean }
  | { kind: 'check-failed'; raw: string };

/** Карточка у кнопки записи (а не панель на главной): всё про микрофон. */
export const isMicBlocker = (b: StartBlocker | null): b is Extract<StartBlocker, { kind: 'no-microphone' | 'mic-denied' }> =>
  b?.kind === 'no-microphone' || b?.kind === 'mic-denied';

/** Как пишется звук: обычно (микрофон и звук компьютера) или только звук компьютера по выбору человека. */
export type MicMode = 'mic' | 'system-only';

function isNoRecording(error: unknown) {
  return String(error instanceof Error ? error.message : error).includes('No recording in progress');
}

/**
 * Те же команды, что проверяет useRecordingStart перед стартом
 * (transcription-model-readiness), плюс микрофон:
 * - access: true (перед записью) — доступ macOS (mic-access.ts), может показать
 *   вопрос macOS и на миг открыть микрофон;
 * - без access (страница встречи объясняет тишину) — только список устройств из
 *   usePermissionCheck, ничего не открывая.
 */
export async function checkReadyToRecord(
  checkPermissions: () => Promise<{ hasMicrophone: boolean }>,
  options: { access?: boolean } = {},
): Promise<StartBlocker | null> {
  try {
    const config = await invoke<{ provider?: string } | null>('api_get_transcript_config').catch(() => null);
    const commands = getProviderCommands(config?.provider || 'parakeet');
    if (commands) {
      await invoke(commands.initialize);
      const ready = await invoke<boolean>(commands.hasAvailableModels);
      if (!ready) {
        const models = await invoke<ModelWithStatus[]>(commands.getAvailableModels).catch(() => []);
        return hasDownloadingModel(models) ? { kind: 'model-downloading' } : { kind: 'no-model' };
      }
    }
    if (!options.access) {
      const { hasMicrophone } = await checkPermissions();
      return hasMicrophone ? null : { kind: 'no-microphone' };
    }
    const mic = await checkMicrophone();
    console.info(`[aid] mic перед записью: ${mic.access} (${mic.trail.join('; ')})`);
    if (mic.access === 'denied') return { kind: 'mic-denied', systemAudio: await checkSystemAudio() };
    if (mic.access === 'no-device') return { kind: 'no-microphone', systemAudio: await checkSystemAudio() };
    return null;
  } catch (error) {
    return { kind: 'check-failed', raw: String(error) };
  }
}

export function useAidRecording() {
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'stop' | 'check' | null>(null);
  const [blocker, setBlocker] = useState<StartBlocker | null>(null);
  const [micMode, setMicMode] = useState<MicMode>('mic');
  const recording = useRecordingState();
  const { setIsMeetingActive } = useSidebar();
  const { checkPermissions } = usePermissionCheck();
  const outcome = useRecordingOutcome();

  const { setIsRecordingDisabled } = useRecordingStateSync(isRecordingLocal, setIsRecordingLocal, setIsMeetingActive);
  const { handleRecordingStart } = useRecordingStart(isRecordingLocal, setIsRecordingLocal);
  const { handleRecordingStop, setIsStopping } = useRecordingStop(setIsRecordingLocal, setIsRecordingDisabled);

  const duration = recording.activeDuration ?? recording.recordingDuration ?? 0;

  /**
   * Старт записи. systemOnly: человек сам выбрал «Записать только звук компьютера»
   * в карточке про микрофон, проверку микрофона не повторяем.
   */
  const start = useCallback(
    async (options: { systemOnly?: boolean } = {}) => {
      if (recording.isRecording || recording.status === RecordingStatus.STARTING || busy) return;
      setBusy('check');
      const problem = await checkReadyToRecord(checkPermissions, { access: !options.systemOnly });
      setBusy(null);
      // Без микрофона, но по выбору человека: модель всё равно нужна
      const blocking = options.systemOnly && isMicBlocker(problem) ? null : problem;
      setBlocker(blocking);
      if (blocking && blocking.kind !== 'check-failed') return;
      setMicMode(options.systemOnly ? 'system-only' : 'mic');
      try {
        await handleRecordingStart();
      } catch (error) {
        // Ядро не стартует без микрофона (verify_microphone_access): та же карточка,
        // но без «Записать только звук компьютера»: ядро так не умеет
        if (isMicRefusal(error)) {
          setBlocker({ kind: 'mic-denied', systemAudio: false, coreRefused: true });
          return;
        }
        // ошибку уже записал RecordingStateContext (status ERROR); показываем её на главной
        console.error('[aid] Запись не началась:', error);
      }
    },
    [recording.isRecording, recording.status, busy, checkPermissions, handleRecordingStart],
  );

  /**
   * Перепроверка после возврата из Системных настроек: доступ появился — карточка
   * уходит; нет — остаётся с пометкой «всё ещё нет доступа».
   */
  const recheckMicrophone = useCallback(async () => {
    const problem = await checkReadyToRecord(checkPermissions, { access: true });
    if (isMicBlocker(problem)) {
      setBlocker(problem.kind === 'mic-denied' ? { ...problem, stillDenied: true } : problem);
      return false;
    }
    setBlocker(problem);
    return problem === null;
  }, [checkPermissions]);

  // Тот же порядок, что у RecordingControls: stop_recording с путём файла,
  // затем пост-обработка в useRecordingStop, но с решением по содержанию записи.
  const stop = useCallback(async () => {
    if (!recording.isRecording || busy === 'stop') return;
    setBusy('stop');
    setIsStopping(true);
    try {
      const dataDir = await appDataDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await invoke('stop_recording', { args: { save_path: `${dataDir}/recording-${stamp}.wav` } });
      await outcome.finish(handleRecordingStop);
    } catch (error) {
      if (isNoRecording(error)) return;
      console.error('[aid] Не удалось остановить запись:', error);
      aidToast.error('Не удалось остановить запись', { description: String(error) });
      await handleRecordingStop(false);
    } finally {
      setBusy(null);
    }
  }, [recording.isRecording, busy, setIsStopping, handleRecordingStop, outcome]);

  const togglePause = useCallback(async () => {
    if (!recording.isRecording || busy) return;
    setBusy('pause');
    try {
      await invoke(recording.isPaused ? 'resume_recording' : 'pause_recording');
    } catch (error) {
      aidToast.error(recording.isPaused ? 'Не удалось продолжить запись' : 'Не удалось поставить на паузу', {
        description: String(error),
      });
    } finally {
      setBusy(null);
    }
  }, [recording.isRecording, recording.isPaused, busy]);

  const status = recording.status;
  // Тихое сохранение в «Не распознано»: ни «Сохраняем», ни «Сохранено», сразу список
  const phase: FinishPhase | null = outcome.quiet && (status === RecordingStatus.SAVING || status === RecordingStatus.COMPLETED)
    ? null
    : outcome.finishing === 'discarding'
    ? 'discarding'
    : status === RecordingStatus.STOPPING || status === RecordingStatus.PROCESSING_TRANSCRIPTS
      ? 'transcribing'
      : status === RecordingStatus.SAVING
        ? 'saving'
        : status === RecordingStatus.COMPLETED
          ? 'opening'
          : null;

  return {
    isRecording: recording.isRecording,
    isPaused: recording.isPaused,
    duration,
    isStarting: status === RecordingStatus.STARTING || busy === 'check',
    /** Запись остановлена, идёт сохранение или переход к встрече. */
    phase,
    /** Текст ошибки старта из RecordingStateContext. */
    startError: status === RecordingStatus.ERROR ? recording.statusMessage ?? null : null,
    blocker,
    dismissBlocker: () => setBlocker(null),
    recheckMicrophone,
    /** Как пишется текущая запись: с микрофоном или только звук компьютера. */
    micMode,
    busy,
    live: outcome.live,
    /** Запись не сохраняется (фаза discarding): тишина или пара фраз. */
    discardVerdict: outcome.discardVerdict,
    start,
    stop,
    togglePause,
  };
}

export type FinishPhase = 'transcribing' | 'saving' | 'opening' | 'discarding';
