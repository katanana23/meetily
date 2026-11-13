// Запись в aid-интерфейсе: тонкая обёртка над оригинальными хуками старта и стопа.
// Логика ядра не дублируется: проверка модели, имя встречи, ожидание транскрипции,
// сохранение и переход к встрече остаются в useRecordingStart и useRecordingStop.
// Кнопка в трее работает через событие start-recording-from-sidebar,
// которое слушает useRecordingStart.
//
// Сверху Aid добавляет проверки (mic-access.ts, mic-watch.ts):
// - перед стартом: модель распознавания и доступ к микрофону. «Не знаю» не значит
//   «доступ есть»:
//   - доступа нет → запись не стартует, карточка «ShadeNotes нужен микрофон»
//     у кнопки записи, пока доступ не появится, кнопка «нужен доступ»;
//   - не спрашивали → вопрос macOS сразу по «Записать»;
//   - проверить не удалось → запись стартует под страховкой: первые 3 с одни нули
//     с микрофона → остановка без сохранения и та же карточка;
//   - слушать микрофон нечем → подсказка «Не удалось проверить микрофон», а если в
//     итоге речи нет, после стопа та же карточка.
//   «Записать только звук компьютера» — явный выбор человека, без страховки;
// - после стопа: решение по содержанию, а не по длительности (recording-outcome.tsx).

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  checkMicrophone,
  checkSystemAudio,
  isMicRefusal,
  knownMicAccess,
  onMicAccessChange,
  rememberMicAccess,
  type KnownMicAccess,
  type MicAccess,
} from './mic-access';
import { useMicWatch } from './mic-watch';
import { useConfig } from '@/contexts/ConfigContext';
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
  | {
      kind: 'mic-denied';
      systemAudio: boolean;
      coreRefused?: boolean;
      stillDenied?: boolean;
      /** Страховка остановила запись: первые секунды с микрофона шли одни нули. */
      zeros?: boolean;
      /** Проверить доступ не удалось, а в записи не оказалось речи. */
      unverified?: boolean;
    }
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
export async function checkBeforeRecording(
  checkPermissions: () => Promise<{ hasMicrophone: boolean }>,
  options: { access?: boolean } = {},
): Promise<{ blocker: StartBlocker | null; mic: MicAccess | null }> {
  try {
    const config = await invoke<{ provider?: string } | null>('api_get_transcript_config').catch(() => null);
    const commands = getProviderCommands(config?.provider || 'parakeet');
    if (commands) {
      await invoke(commands.initialize);
      const ready = await invoke<boolean>(commands.hasAvailableModels);
      if (!ready) {
        const models = await invoke<ModelWithStatus[]>(commands.getAvailableModels).catch(() => []);
        return { blocker: hasDownloadingModel(models) ? { kind: 'model-downloading' } : { kind: 'no-model' }, mic: null };
      }
    }
    if (!options.access) {
      const { hasMicrophone } = await checkPermissions();
      return { blocker: hasMicrophone ? null : { kind: 'no-microphone' }, mic: null };
    }
    const mic = await checkMicrophone();
    console.info(`[aid] mic перед записью: ${mic.access} (${mic.trail.join('; ')})`);
    if (mic.access === 'denied') return { blocker: { kind: 'mic-denied', systemAudio: await checkSystemAudio() }, mic: mic.access };
    if (mic.access === 'no-device') return { blocker: { kind: 'no-microphone', systemAudio: await checkSystemAudio() }, mic: mic.access };
    return { blocker: null, mic: mic.access };
  } catch (error) {
    return { blocker: { kind: 'check-failed', raw: String(error) }, mic: null };
  }
}

export async function checkReadyToRecord(
  checkPermissions: () => Promise<{ hasMicrophone: boolean }>,
  options: { access?: boolean } = {},
): Promise<StartBlocker | null> {
  return (await checkBeforeRecording(checkPermissions, options)).blocker;
}

/** Путь файла для stop_recording, как у RecordingControls оригинала. */
async function stopPath(): Promise<string> {
  const dataDir = await appDataDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${dataDir}/recording-${stamp}.wav`;
}

export function useAidRecording() {
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'stop' | 'check' | null>(null);
  const [blocker, setBlocker] = useState<StartBlocker | null>(null);
  const [micMode, setMicMode] = useState<MicMode>('mic');
  /** Доступ к микрофону подтверждён перед стартом или запись под страховкой. */
  const [micCheck, setMicCheck] = useState<'confirmed' | 'unverified'>('confirmed');
  const recording = useRecordingState();
  // Запись кончилась: следующая (в том числе из трея) снова с микрофоном и без страховки
  useEffect(() => {
    if (!recording.isRecording) {
      setMicMode('mic');
      setMicCheck('confirmed');
    }
  }, [recording.isRecording]);
  // Что известно о доступе между запусками: «нужен доступ» на кнопке записи
  const [knownAccess, setKnownAccess] = useState<KnownMicAccess>(null);
  useEffect(() => {
    setKnownAccess(knownMicAccess());
    return onMicAccessChange(() => setKnownAccess(knownMicAccess()));
  }, []);
  const { selectedDevices } = useConfig();
  const micWatch = useMicWatch({
    active: recording.isRecording && micMode === 'mic',
    paused: recording.isPaused,
    deviceName: selectedDevices?.micDevice,
  });
  /** За эту запись слушать микрофон было нечем, а доступ не подтверждён. */
  const blindRef = useRef(false);
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
      const { blocker: problem, mic } = await checkBeforeRecording(checkPermissions, { access: !options.systemOnly });
      setBusy(null);
      if (mic === 'granted') rememberMicAccess('granted');
      if (problem?.kind === 'mic-denied') rememberMicAccess('denied');
      // Без микрофона, но по выбору человека: модель всё равно нужна
      const blocking = options.systemOnly && isMicBlocker(problem) ? null : problem;
      setBlocker(blocking);
      if (blocking && blocking.kind !== 'check-failed') return;
      setMicMode(options.systemOnly ? 'system-only' : 'mic');
      // Проверить не удалось: стартуем, но первые секунды под страховкой
      setMicCheck(!options.systemOnly && mic !== 'granted' ? 'unverified' : 'confirmed');
      blindRef.current = false;
      try {
        await handleRecordingStart();
      } catch (error) {
        // Ядро не стартует без микрофона (verify_microphone_access): та же карточка,
        // но без «Записать только звук компьютера»: ядро так не умеет
        if (isMicRefusal(error)) {
          rememberMicAccess('denied');
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
   * Перепроверка после возврата из Системных настроек:
   * - доступ есть → карточка уходит, 'granted';
   * - доступа нет → карточка остаётся с пометкой «всё ещё нет», 'denied';
   * - проверить не удалось → «нужен доступ» снимается (не утверждаем ни того, ни
   *   другого), следующая запись пойдёт под страховкой, 'unknown'.
   */
  const recheckMicrophone = useCallback(async (): Promise<'granted' | 'denied' | 'unknown'> => {
    const { blocker: problem, mic } = await checkBeforeRecording(checkPermissions, { access: true });
    if (problem?.kind === 'mic-denied') {
      rememberMicAccess('denied');
      setBlocker({ ...problem, stillDenied: true });
      return 'denied';
    }
    if (problem?.kind === 'no-microphone') {
      setBlocker(problem);
      return 'denied';
    }
    setBlocker(problem);
    if (mic === 'granted') {
      rememberMicAccess('granted');
      return 'granted';
    }
    rememberMicAccess(null);
    return 'unknown';
  }, [checkPermissions]);

  /** Кнопка записи в состоянии «нужен доступ»: показать карточку, ничего не записывая. */
  const openMicCard = useCallback(() => {
    setBlocker({ kind: 'mic-denied', systemAudio: false });
    void checkSystemAudio().then((systemAudio) =>
      setBlocker((b) => (b?.kind === 'mic-denied' && !b.coreRefused ? { ...b, systemAudio } : b)),
    );
  }, []);

  // Страховка: доступ не подтверждён, а первые секунды с микрофона одни нули.
  // Остановить без сохранения и показать карточку
  const aborting = useRef(false);
  useEffect(() => {
    if (!recording.isRecording || micMode !== 'mic' || micCheck !== 'unverified') return;
    if (micWatch.probe === 'heard') {
      // Ненулевой звук с микрофона: доступ на деле есть
      rememberMicAccess('granted');
      setMicCheck('confirmed');
      return;
    }
    if (micWatch.probe === 'blind') {
      blindRef.current = true;
      return;
    }
    if (micWatch.probe !== 'zeros' || aborting.current) return;
    aborting.current = true;
    console.info('[aid] mic: первые секунды с микрофона только нули, останавливаем запись без сохранения');
    void (async () => {
      setBusy('stop');
      setIsStopping(true);
      try {
        // Папку этой записи ядро сообщит заново (recording-stopped)
        sessionStorage.removeItem('last_recording_folder_path');
        await invoke('stop_recording', { args: { save_path: await stopPath() } });
        await outcome.abandon(handleRecordingStop);
      } catch (error) {
        if (!isNoRecording(error)) {
          console.error('[aid] Не удалось остановить запись страховкой:', error);
          await handleRecordingStop(false);
        }
      } finally {
        setBusy(null);
        aborting.current = false;
      }
      rememberMicAccess('denied');
      setBlocker({ kind: 'mic-denied', systemAudio: await checkSystemAudio(), zeros: true });
    })();
  }, [recording.isRecording, micMode, micCheck, micWatch.probe, outcome, handleRecordingStop, setIsStopping]);

  // Тот же порядок, что у RecordingControls: stop_recording с путём файла,
  // затем пост-обработка в useRecordingStop, но с решением по содержанию записи.
  const stop = useCallback(async () => {
    if (!recording.isRecording || busy === 'stop') return;
    setBusy('stop');
    setIsStopping(true);
    try {
      const blind = blindRef.current && micCheck === 'unverified';
      await invoke('stop_recording', { args: { save_path: await stopPath() } });
      const verdict = await outcome.finish(handleRecordingStop);
      // Микрофон проверить было нечем, и речи в записи нет: скорее всего, доступа нет
      if (blind && verdict !== 'speech') setBlocker({ kind: 'mic-denied', systemAudio: false, unverified: true });
    } catch (error) {
      if (isNoRecording(error)) return;
      console.error('[aid] Не удалось остановить запись:', error);
      aidToast.error('Не удалось остановить запись', { description: String(error) });
      await handleRecordingStop(false);
    } finally {
      setBusy(null);
    }
  }, [recording.isRecording, busy, setIsStopping, handleRecordingStop, outcome, micCheck]);

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
  // Текста нет (discarding): строка обработки в списке гаснет сразу, карточка говорит итог
  const phase: FinishPhase | null = outcome.finishing === 'discarding'
    ? null
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
    /** Известно, что доступа к микрофону нет: кнопка записи «нужен доступ». */
    micNeedsAccess: knownAccess === 'denied',
    openMicCard,
    /** Слежение за микрофоном во время записи: ok, silent, lost. */
    micState: micWatch.state,
    /** Доступ не подтверждён и слушать микрофон нечем: «Не удалось проверить микрофон». */
    micBlind: recording.isRecording && micMode === 'mic' && micCheck === 'unverified' && micWatch.probe === 'blind',
    busy,
    live: outcome.live,
    start,
    stop,
    togglePause,
  };
}

export type FinishPhase = 'transcribing' | 'saving' | 'opening';
