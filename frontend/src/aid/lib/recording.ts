// Запись в aid-интерфейсе: тонкая обёртка над оригинальными хуками старта и стопа.
// Логика ядра не дублируется: проверка модели, имя встречи, ожидание транскрипции,
// сохранение и переход к встрече остаются в useRecordingStart и useRecordingStop.
// Кнопка в трее работает через событие start-recording-from-sidebar,
// которое слушает useRecordingStart.

'use client';

import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { toast } from 'sonner';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingStateSync } from '@/hooks/useRecordingStateSync';
import { useRecordingStart } from '@/hooks/useRecordingStart';
import { useRecordingStop } from '@/hooks/useRecordingStop';

function isNoRecording(error: unknown) {
  return String(error instanceof Error ? error.message : error).includes('No recording in progress');
}

export function useAidRecording() {
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'stop' | null>(null);
  const recording = useRecordingState();
  const { setIsMeetingActive } = useSidebar();

  const { setIsRecordingDisabled } = useRecordingStateSync(isRecordingLocal, setIsRecordingLocal, setIsMeetingActive);
  const { handleRecordingStart } = useRecordingStart(isRecordingLocal, setIsRecordingLocal);
  const { handleRecordingStop, setIsStopping } = useRecordingStop(setIsRecordingLocal, setIsRecordingDisabled);

  const start = useCallback(async () => {
    if (recording.isRecording || recording.status === RecordingStatus.STARTING) return;
    await handleRecordingStart();
  }, [handleRecordingStart, recording.isRecording, recording.status]);

  // Тот же порядок, что у RecordingControls: stop_recording с путём файла,
  // затем пост-обработка в useRecordingStop.
  const stop = useCallback(async () => {
    if (!recording.isRecording || busy === 'stop') return;
    setBusy('stop');
    setIsStopping(true);
    try {
      const dataDir = await appDataDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await invoke('stop_recording', { args: { save_path: `${dataDir}/recording-${stamp}.wav` } });
      await handleRecordingStop(true);
    } catch (error) {
      if (isNoRecording(error)) return;
      console.error('[aid] Не удалось остановить запись:', error);
      toast.error('Не удалось остановить запись', { description: String(error) });
      await handleRecordingStop(false);
    } finally {
      setBusy(null);
    }
  }, [recording.isRecording, busy, setIsStopping, handleRecordingStop]);

  const togglePause = useCallback(async () => {
    if (!recording.isRecording || busy) return;
    setBusy('pause');
    try {
      await invoke(recording.isPaused ? 'resume_recording' : 'pause_recording');
    } catch (error) {
      toast.error(recording.isPaused ? 'Не удалось продолжить запись' : 'Не удалось поставить на паузу', {
        description: String(error),
      });
    } finally {
      setBusy(null);
    }
  }, [recording.isRecording, recording.isPaused, busy]);

  const status = recording.status;
  return {
    isRecording: recording.isRecording,
    isPaused: recording.isPaused,
    duration: recording.activeDuration ?? recording.recordingDuration ?? 0,
    isStarting: status === RecordingStatus.STARTING,
    isFinishing:
      status === RecordingStatus.STOPPING ||
      status === RecordingStatus.PROCESSING_TRANSCRIPTS ||
      status === RecordingStatus.SAVING,
    busy,
    start,
    stop,
    togglePause,
  };
}
