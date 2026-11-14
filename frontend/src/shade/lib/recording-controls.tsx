// Управление записью на всё приложение: один экземпляр хуков оригинала
// (useRecordingStart, useRecordingStop через useShadeRecording), кнопка записи
// внизу (RecordDock), горячая клавиша Cmd+Shift+R (Ctrl+Shift+R не на Mac)
// и выбор, что показывает главная во время записи: транскрипт или список.
// После «Остановить» главная сразу показывает список: новая встреча первой строкой со
// спиннером, пока идёт обработка, а на месте кнопки записи карточка, которая меняет
// состояние на месте (finish: «Дописываю реплики» → «Сохраняю» → «Встреча сохранена»).
// Раньше хуки жили на главной; на уровне каркаса они не размонтируются при
// переходах, поэтому запуск и остановка работают с любой страницы.
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useShadeRecording } from './recording';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { shadeToast } from './toasts';
import { useRecordingOutcome } from './recording-outcome';
import { t } from '@/shade/strings';

/**
 * Сочетание работает только в окне Shade: глобальному нужен плагин в ядре
 * (tauri-plugin-global-shortcut), а ядро не меняем. Подписи говорят об этом прямо.
 * Остановка тем же сочетанием не раньше чем через 3 с после старта: повторное
 * нажатие по привычке не обрывает только что начатую встречу.
 */
export const HOTKEY_STOP_GUARD_MS = 3000;

type Recording = ReturnType<typeof useShadeRecording>;

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
  /** Где работает сочетание: «в окне Shade». */
  hotkeyScope: string;
  /**
   * Что после «Остановить»: шаг обработки и встреча. null, когда карточки нет (запись
   * идёт, ничего не было или карточку закрыли). Отбракованную запись показывает notice
   * из recording-outcome.tsx, её здесь нет.
   */
  finish: FinishState | null;
  /** Закрыть «Встреча сохранена» (крестик, «Открыть», через несколько секунд). */
  dismissFinish: () => void;
}

export interface FinishState {
  stage: 'transcribing' | 'saving' | 'saved';
  /** Название встречи (как в ядре, «Meeting 13_11_26_16_28_36»), если известно. */
  title: string | null;
  /** Встреча сохранена: её id. */
  meetingId: string | null;
}

const RecordingControlsContext = createContext<Controls | null>(null);

function hotkeyLabel(): string {
  if (typeof navigator === 'undefined') return '⌘⇧R';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘⇧R' : 'Ctrl+Shift+R';
}

export function ShadeRecordingControls({ children }: { children: ReactNode }) {
  const rec = useShadeRecording();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [view, setView] = useState<'recording' | 'list'>('recording');
  const [hotkey, setHotkey] = useState('⌘⇧R');
  /** Сохранённая встреча, о которой говорит карточка; держится после сброса статуса в IDLE. */
  const [finished, setFinished] = useState<{ id: string; title: string | null } | null>(null);
  /** Встреча, карточку которой уже показали: закрытая карточка не возвращается. */
  const handled = useRef<string | null>(null);
  const { currentMeeting } = useSidebar();
  const { meetingTitle } = useTranscripts();
  // Название встречи для карточки и строки: оригинал очищает его вместе с репликами
  const titleRef = useRef<string | null>(null);
  if (meetingTitle) titleRef.current = meetingTitle;

  useEffect(() => setHotkey(hotkeyLabel()), []);

  // Новая запись (в том числе из трея) открывается на экране транскрипта; после
  // «Остановить» главная сразу показывает список встреч
  const wasRecording = useRef(rec.isRecording);
  useEffect(() => {
    if (rec.isRecording && !wasRecording.current) {
      setView('recording');
      setFinished(null);
      handled.current = null;
      titleRef.current = meetingTitle || null;
    }
    if (!rec.isRecording && wasRecording.current) setView('list');
    wasRecording.current = rec.isRecording;
    // titleRef обновляется при каждом рендере; здесь нужен только переход записи
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording]);

  // Встреча сохранена (COMPLETED): оригинальный хук уже записал её id в currentMeeting.
  // Через 2 с он сбросит статус в IDLE, карточка держится на finished
  const completedId = rec.phase === 'opening' && currentMeeting && currentMeeting.id !== 'intro-call' ? currentMeeting.id : null;
  useEffect(() => {
    if (!completedId || completedId === handled.current) return;
    handled.current = completedId;
    setFinished({ id: completedId, title: titleRef.current });
  }, [completedId]);
  const dismissFinish = useCallback(() => setFinished(null), []);

  // Проверка моделью убрала эту встречу в корзину: «Встреча сохранена» уступает место
  // карточке «Мало содержания» (notice из recording-outcome.tsx) на том же месте
  const { notice } = useRecordingOutcome();
  const lowContentId = notice?.verdict === 'low-content' ? (notice.meetingId ?? null) : null;
  useEffect(() => {
    if (!lowContentId) return;
    handled.current = lowContentId;
    setFinished((f) => (f?.id === lowContentId ? null : f));
  }, [lowContentId]);

  const finish: FinishState | null = useMemo(() => {
    if (rec.phase === 'transcribing' || rec.phase === 'saving') return { stage: rec.phase, title: titleRef.current, meetingId: null };
    if (finished) return { stage: 'saved', title: finished.title ?? titleRef.current, meetingId: finished.id };
    // Тот же кадр, что COMPLETED, до эффекта выше: без мигания кнопки записи
    if (completedId && completedId !== handled.current) return { stage: 'saved', title: titleRef.current, meetingId: completedId };
    return null;
  }, [rec.phase, finished, completedId]);

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
      shadeToast.info(t('hotkeyStopTooEarly'), { id: 'shade-hotkey-guard' });
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
    () => ({ ...rec, view, setView, startAnywhere, toggle, hotkey, hotkeyScope: t('hotkeyScope'), finish, dismissFinish }),
    [rec, view, startAnywhere, toggle, hotkey, finish, dismissFinish],
  );
  return <RecordingControlsContext.Provider value={value}>{children}</RecordingControlsContext.Provider>;
}

export function useRecordingControls(): Controls {
  const ctx = useContext(RecordingControlsContext);
  if (!ctx) throw new Error('useRecordingControls вне ShadeRecordingControls');
  return ctx;
}
