// Запись в aid-интерфейсе: тонкая обёртка над оригинальными хуками старта и стопа.
// Логика ядра не дублируется: проверка модели, имя встречи, ожидание транскрипции,
// сохранение и переход к встрече остаются в useRecordingStart и useRecordingStop.
// Кнопка в трее работает через событие start-recording-from-sidebar,
// которое слушает useRecordingStart.
//
// Сверху Aid добавляет две проверки:
// - перед стартом: есть ли модель распознавания и микрофон. Без них запись
//   дала бы тишину или звук без текста, поэтому «Начать запись» ведёт на исправление;
// - после стопа: запись короче 5 секунд без единой реплики не сохраняется
//   (handleRecordingStop(false) оригинала: дождаться транскрипции, но не писать в базу).

'use client';

import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingStateSync } from '@/hooks/useRecordingStateSync';
import { useRecordingStart } from '@/hooks/useRecordingStart';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { getProviderCommands, hasDownloadingModel, type ModelWithStatus } from '@/lib/transcription-model-readiness';
import { transcriptService } from '@/services/transcriptService';
import { aidToast } from './toasts';

/** Короче этого и без реплик запись не сохраняется. */
export const MIN_SAVED_SECONDS = 5;

export type StartBlocker =
  | { kind: 'no-model' }
  | { kind: 'model-downloading' }
  | { kind: 'no-microphone' }
  | { kind: 'check-failed'; raw: string };

function isNoRecording(error: unknown) {
  return String(error instanceof Error ? error.message : error).includes('No recording in progress');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Те же команды, что проверяет useRecordingStart перед стартом
 * (transcription-model-readiness), плюс список устройств из usePermissionCheck.
 */
export async function checkReadyToRecord(
  checkPermissions: () => Promise<{ hasMicrophone: boolean }>,
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
    const { hasMicrophone } = await checkPermissions();
    if (!hasMicrophone) return { kind: 'no-microphone' };
    return null;
  } catch (error) {
    return { kind: 'check-failed', raw: String(error) };
  }
}

/** Ждём, пока ядро допишет очередь распознавания (не дольше timeoutMs). */
async function waitForTranscriptionIdle(timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const s = await transcriptService.getTranscriptionStatus();
      if (!s.is_processing && s.chunks_in_queue === 0) return;
    } catch {
      return;
    }
    await sleep(300);
  }
}

export function useAidRecording() {
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'stop' | 'check' | null>(null);
  const [blocker, setBlocker] = useState<StartBlocker | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const recording = useRecordingState();
  const { setIsMeetingActive } = useSidebar();
  const { transcriptsRef } = useTranscripts();
  const { checkPermissions } = usePermissionCheck();
  const lastDuration = useRef(0);

  const { setIsRecordingDisabled } = useRecordingStateSync(isRecordingLocal, setIsRecordingLocal, setIsMeetingActive);
  const { handleRecordingStart } = useRecordingStart(isRecordingLocal, setIsRecordingLocal);
  const { handleRecordingStop, setIsStopping } = useRecordingStop(setIsRecordingLocal, setIsRecordingDisabled);

  const duration = recording.activeDuration ?? recording.recordingDuration ?? 0;
  if (recording.isRecording) lastDuration.current = duration;

  const start = useCallback(async () => {
    if (recording.isRecording || recording.status === RecordingStatus.STARTING || busy) return;
    setBusy('check');
    const problem = await checkReadyToRecord(checkPermissions);
    setBusy(null);
    setBlocker(problem);
    if (problem && problem.kind !== 'check-failed') return;
    try {
      await handleRecordingStart();
    } catch (error) {
      // ошибку уже записал RecordingStateContext (status ERROR); показываем её на главной
      console.error('[aid] Запись не началась:', error);
    }
  }, [recording.isRecording, recording.status, busy, checkPermissions, handleRecordingStart]);

  // Тот же порядок, что у RecordingControls: stop_recording с путём файла,
  // затем пост-обработка в useRecordingStop.
  const stop = useCallback(async () => {
    if (!recording.isRecording || busy === 'stop') return;
    const seconds = lastDuration.current;
    setBusy('stop');
    setIsStopping(true);
    try {
      const dataDir = await appDataDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await invoke('stop_recording', { args: { save_path: `${dataDir}/recording-${stamp}.wav` } });

      let save = true;
      if (seconds < MIN_SAVED_SECONDS && transcriptsRef.current.length === 0) {
        // короткая реплика могла ещё не дойти из очереди распознавания
        await waitForTranscriptionIdle(3000);
        save = transcriptsRef.current.length > 0;
      }
      if (!save) setDiscarding(true);
      await handleRecordingStop(save);
      if (!save) aidToast.info('Запись слишком короткая, не сохранена', { description: 'Речь не распознана. Запишите ещё раз.' });
    } catch (error) {
      if (isNoRecording(error)) return;
      console.error('[aid] Не удалось остановить запись:', error);
      aidToast.error('Не удалось остановить запись', { description: String(error) });
      await handleRecordingStop(false);
    } finally {
      setDiscarding(false);
      setBusy(null);
    }
  }, [recording.isRecording, busy, setIsStopping, handleRecordingStop, transcriptsRef]);

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
  const phase: FinishPhase | null = discarding
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
    busy,
    start,
    stop,
    togglePause,
  };
}

export type FinishPhase = 'transcribing' | 'saving' | 'opening' | 'discarding';
