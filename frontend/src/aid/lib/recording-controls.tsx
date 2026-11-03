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

type Recording = ReturnType<typeof useAidRecording>;

interface Controls extends Recording {
  /** Что показывает главная во время записи. */
  view: 'recording' | 'list';
  setView: (view: 'recording' | 'list') => void;
  /** Старт с любой страницы: главная показывает транскрипт или причину, почему запись не началась. */
  startAnywhere: () => Promise<void>;
  toggle: () => void;
  hotkey: string;
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

  useEffect(() => setHotkey(hotkeyLabel()), []);

  // Новая запись (в том числе из трея) открывается на экране транскрипта
  const wasRecording = useRef(rec.isRecording);
  useEffect(() => {
    if (rec.isRecording && !wasRecording.current) setView('recording');
    wasRecording.current = rec.isRecording;
  }, [rec.isRecording]);

  const startAnywhere = useCallback(async () => {
    setView('recording');
    if (pathname !== '/') router.push('/');
    await rec.start();
  }, [pathname, router, rec]);

  const toggle = useCallback(() => {
    if (rec.isRecording) void rec.stop();
    else if (!rec.phase && !rec.isStarting) void startAnywhere();
  }, [rec, startAnywhere]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
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

  const value = useMemo(() => ({ ...rec, view, setView, startAnywhere, toggle, hotkey }), [rec, view, startAnywhere, toggle, hotkey]);
  return <RecordingControlsContext.Provider value={value}>{children}</RecordingControlsContext.Provider>;
}

export function useRecordingControls(): Controls {
  const ctx = useContext(RecordingControlsContext);
  if (!ctx) throw new Error('useRecordingControls вне AidRecordingControls');
  return ctx;
}
