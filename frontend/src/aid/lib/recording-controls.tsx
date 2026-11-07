// Управление записью на всё приложение: один экземпляр хуков оригинала
// (useRecordingStart, useRecordingStop через useAidRecording), кнопка записи
// внизу (RecordDock), горячая клавиша Cmd+Shift+R (Ctrl+Shift+R не на Mac)
// и выбор, что показывает главная во время записи: транскрипт или список.
// Раньше хуки жили на главной; на уровне каркаса они не размонтируются при
// переходах, поэтому запуск и остановка работают с любой страницы.
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAidRecording } from './recording';
import { aidToast } from './toasts';
import { t } from '@/aid/strings';

/**
 * Сочетание работает только в окне ShadeNotes: глобальному нужен плагин в ядре
 * (tauri-plugin-global-shortcut), а ядро не меняем. Подписи говорят об этом прямо.
 * Остановка тем же сочетанием не раньше чем через 3 с после старта: повторное
 * нажатие по привычке не обрывает только что начатую встречу.
 */
export const HOTKEY_STOP_GUARD_MS = 3000;

type Recording = ReturnType<typeof useAidRecording>;

interface Controls extends Recording {
  /** Что показывает главная во время записи. */
  view: 'recording' | 'list';
  setView: (view: 'recording' | 'list') => void;
  /**
   * Старт с любой страницы: главная показывает транскрипт, а если запись не началась,
   * у кнопки записи карточка с причиной. systemOnly: «Записать только звук компьютера».
   */
  startAnywhere: (options?: { systemOnly?: boolean }) => Promise<void>;
  toggle: () => void;
  hotkey: string;
  /** Где работает сочетание: «в окне ShadeNotes». */
  hotkeyScope: string;
  /**
   * Встреча сохранена, экран обработки ещё на месте («Записано» и действия). Держится и
   * после того, как оригинальный хук сбросил статус в IDLE: экран сам откроет встречу.
   */
  finished: { id: string } | null;
  setFinished: (finished: { id: string } | null) => void;
}

const RecordingControlsContext = createContext<Controls | null>(null);

function hotkeyLabel(): string {
  if (typeof navigator === 'undefined') return '⌘⇧R';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘⇧R' : 'Ctrl+Shift+R';
}

export function AidRecordingControls({ children }: { children: ReactNode }) {
  const rec = useAidRecording();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [view, setView] = useState<'recording' | 'list'>('recording');
  const [hotkey, setHotkey] = useState('⌘⇧R');
  const [finished, setFinished] = useState<{ id: string } | null>(null);

  useEffect(() => setHotkey(hotkeyLabel()), []);

  // Новая запись (в том числе из трея) открывается на экране транскрипта
  const wasRecording = useRef(rec.isRecording);
  useEffect(() => {
    if (rec.isRecording && !wasRecording.current) {
      setView('recording');
      setFinished(null);
    }
    wasRecording.current = rec.isRecording;
  }, [rec.isRecording]);

  const startAnywhere = useCallback(
    async (options?: { systemOnly?: boolean }) => {
      setView('recording');
      if (pathname !== '/') router.push('/');
      await rec.start(options);
    },
    [pathname, router, rec],
  );

  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = rec.isRecording ? (startedAt.current ?? Date.now()) : null;
  }, [rec.isRecording]);

  const toggle = useCallback(() => {
    if (rec.isRecording) void rec.stop();
    else if (!rec.phase && !rec.isStarting) {
      setFinished(null);
      void startAnywhere();
    }
  }, [rec, startAnywhere]);

  /** Сочетание клавиш: то же, что toggle, но стоп не раньше чем через 3 с после старта. */
  const onHotkey = useCallback(() => {
    if (rec.isStarting) return;
    if (rec.isRecording && startedAt.current !== null && Date.now() - startedAt.current < HOTKEY_STOP_GUARD_MS) {
      aidToast.info(t('hotkeyStopTooEarly'), { id: 'aid-hotkey-guard' });
      return;
    }
    toggle();
  }, [rec.isRecording, rec.isStarting, toggle]);

  const toggleRef = useRef(onHotkey);
  toggleRef.current = onHotkey;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.code !== 'KeyR') return;
      e.preventDefault();
      if (e.repeat) return;
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(
    () => ({ ...rec, view, setView, startAnywhere, toggle, hotkey, hotkeyScope: t('hotkeyScope'), finished, setFinished }),
    [rec, view, startAnywhere, toggle, hotkey, finished],
  );
  return <RecordingControlsContext.Provider value={value}>{children}</RecordingControlsContext.Provider>;
}

export function useRecordingControls(): Controls {
  const ctx = useContext(RecordingControlsContext);
  if (!ctx) throw new Error('useRecordingControls вне AidRecordingControls');
  return ctx;
}
