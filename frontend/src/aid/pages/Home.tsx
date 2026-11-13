// Главная: список встреч и запуск записи. Во время записи на этом же месте
// показывается экран записи, чтобы хуки записи не размонтировались.

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { ArrowClockwise, ArrowCounterClockwise, Chats, MagnifyingGlass, Sparkle, Trash, UploadSimple, Warning, X } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page } from '@/aid/components/Page';
import AidSettings from '@/aid/pages/Settings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { MeetingRow, PendingRow, type MeetingListItem } from '@/aid/components/MeetingRow';
import { daysLeft, deleteForever, emptyTrash, isTrashed, loadTrash, onTrashChange, restoreMeeting, trashedMeetings, type TrashedMeeting } from '@/aid/lib/meeting-trash';
import { cachedDetails, cachedLines, loadDetails, normalizeForSearch } from '@/aid/lib/meeting-details-cache';
import { findInTranscript, type TranscriptMatch } from '@/aid/lib/transcript-search';
import { deleteMeeting, toastTrashed, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { warmUpRoutes } from '@/aid/lib/open-meeting';
import { aidToast } from '@/aid/lib/toasts';
import { RecordingView } from '@/aid/pages/Recording';
import MeetingDetails from '@/aid/pages/MeetingDetails';
import { type StartBlocker } from '@/aid/lib/recording';
import { useRecordingControls, type FinishState } from '@/aid/lib/recording-controls';
import { previewFinish } from '@/aid/lib/finish-preview';
import { isDiscarded, isKept, marksSnapshot, onMarksChange, purgeDiscarded, setEmptyCleanupAsked } from '@/aid/lib/recording-marks';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { cn } from '@/aid/lib/utils';
import { friendlyError, type FriendlyError } from '@/aid/lib/meeting';
import { dateGroup, displayTitle, plural, shownTitle, type DateGroup } from '@/aid/lib/format';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useConfig } from '@/contexts/ConfigContext';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; error: FriendlyError }
  | { kind: 'ready'; meetings: MeetingListItem[] };

function useMeetingsList(refreshKey: unknown) {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  // Одна загрузка за раз: новая отменяет предыдущую, уход со страницы отменяет текущую.
  // Иначе подгрузка подробностей (до 5000 реплик на встречу) копилась бы при каждом
  // перечитывании и забивала канал к ядру, в том числе запросы перехода к встрече.
  const current = useRef<{ cancelled: boolean } | null>(null);

  const load = useCallback(async () => {
    if (current.current) current.current.cancelled = true;
    const signal = { cancelled: false };
    current.current = signal;
    try {
      // Корзину сверяем с метками на диске до показа списка: удалённое не мелькнёт
      const [all] = await Promise.all([invoke<Array<{ id: string; title: string }>>('api_get_meetings'), loadTrash()]);
      // Дату и папку записи ядро отдаёт только в метаданных; число реплик берём одним
      // коротким запросом (limit 1), чтобы пустые записи не мелькнули в списке до подробностей
      const [metas, counts] = await Promise.all([
        Promise.allSettled(all.map((m) => invoke<{ created_at?: string; folder_path?: string | null }>('api_get_meeting_metadata', { meetingId: m.id }))),
        Promise.allSettled(
          all.map((m) => invoke<{ total_count?: number }>('api_get_meeting_transcripts', { meetingId: m.id, limit: 1, offset: 0 })),
        ),
      ]);
      if (signal.cancelled) return;
      const meetings: MeetingListItem[] = all.map((m, i) => {
        const meta = metas[i];
        const count = counts[i];
        return {
          ...m,
          created_at: meta.status === 'fulfilled' ? meta.value?.created_at : undefined,
          folder_path: meta.status === 'fulfilled' ? (meta.value?.folder_path ?? null) : null,
          transcriptCount: count.status === 'fulfilled' && typeof count.value?.total_count === 'number' ? count.value.total_count : null,
          details: cachedDetails(m.id),
        };
      });
      // Встречи с пометкой «не сохранять» не показываются никогда; просроченные удаляются
      if (meetings.some((m) => isDiscarded(m))) void purgeDiscarded();
      // Удалённые человеком лежат в корзине (фильтр «Корзина»), в списке их нет
      const list = meetings.filter((m) => !isDiscarded(m) && !isTrashed(m.id));
      setState({ kind: 'ready', meetings: list });
      // Состояние итогов, длительность, слова и название из содержания догружаются по очереди
      void loadDetails(
        list.map((m) => m.id),
        (id, details) =>
          setState((prev) =>
            prev.kind === 'ready' ? { kind: 'ready', meetings: prev.meetings.map((x) => (x.id === id ? { ...x, details } : x)) } : prev,
          ),
        signal,
      );
    } catch (error) {
      if (!signal.cancelled) setState({ kind: 'error', error: friendlyError(error, 'Проверьте, что приложение запущено, и попробуйте ещё раз.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(
    () => () => {
      if (current.current) current.current.cancelled = true;
    },
    [],
  );

  // «Вернуть» и решение после стопа меняют пометки: перечитать список
  useEffect(() => onMarksChange(() => void load()), [load]);
  // Удалили или вернули из корзины: перечитать список
  useEffect(() => onTrashChange(() => void load()), [load]);

  // Разработка: заранее скомпилировать страницу встречи, иначе первый клик ждёт 5–7 с
  useEffect(() => warmUpRoutes(), []);

  return { state, setState, reload: () => load() };
}

// Про микрофон (нет доступа, нет устройства) говорит карточка у кнопки записи (MicNotices),
// здесь только модель распознавания
const BLOCKER: Record<'no-model' | 'model-downloading', { title: string; hint: string; action: string; href: string }> = {
  'no-model': { title: t('blockNoModel'), hint: t('blockNoModelHint'), action: t('downloadModel'), href: '/settings?tab=transcription' },
  'model-downloading': { title: t('blockDownloading'), hint: t('blockDownloadingHint'), action: t('showDownload'), href: '/settings?tab=transcription' },
};

/** Почему запись не началась и как это исправить. Фокус переходит на кнопку исправления. */
function StartBlockerPanel({ blocker, onRetry, onClose }: { blocker: StartBlocker; onRetry: () => void; onClose: () => void }) {
  const actionRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  useEffect(() => actionRef.current?.focus(), [blocker]);
  if (blocker.kind !== 'no-model' && blocker.kind !== 'model-downloading') return null;
  const copy = BLOCKER[blocker.kind];

  return (
    <Alert aria-live="polite">
      <Warning />
      <div>
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          <p>{copy.hint}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild size="main">
              <Link ref={actionRef} href={copy.href}>
                {copy.action}
              </Link>
            </Button>
            {blocker.kind !== 'no-model' && (
              <Button variant="outline" size="main" onClick={onRetry}>
                <ArrowClockwise />
                {t('checkAgain')}
              </Button>
            )}
            <Button variant="ghost" size="main" onClick={onClose}>
              {t('later')}
            </Button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
}

/** Пустой результат фильтра: иконка в круге, заголовок и подсказка, слева по краю списка. */
function EmptyFilter({
  title,
  hint,
  icon: Icon = Chats,
  children,
}: {
  title: string;
  hint: string;
  icon?: typeof Chats;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start py-10">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-6" />
      </span>
      <h2 className="mt-4 text-[22px] font-bold leading-7 tracking-tight">{title}</h2>
      <p className="mt-1 max-w-md text-[15px] text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

/** Встречи в корзине: удалённые человеком, 7 дней можно вернуть (meeting-trash.ts). */
function useTrashed(): TrashedMeeting[] {
  const [list, setList] = useState<TrashedMeeting[]>(() => trashedMeetings());
  useEffect(() => {
    setList(trashedMeetings());
    return onTrashChange(() => setList(trashedMeetings()));
  }, []);
  return list;
}

/** Подтверждение окончательного удаления: одна встреча или вся корзина. */
function EraseDialog({ title, hint, onConfirm, onClose }: { title: string; hint: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{hint}</DialogDescription>
        <DialogFooter>
          <Button variant="outline" size="main" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" size="main" onClick={() => void confirm()} disabled={busy}>
            {busy ? <Spinner tone="inherit" /> : <Trash />}
            {t('deleteForever')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Фильтр «Корзина»: удалённые встречи, срок, «Восстановить» и «Удалить насовсем»; сверху «Очистить корзину». */
function TrashPanel({ items, onRestored }: { items: TrashedMeeting[]; onRestored: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [erase, setErase] = useState<TrashedMeeting | 'all' | null>(null);
  const restore = async (m: TrashedMeeting) => {
    setBusy(m.id);
    try {
      await restoreMeeting(m.id);
      onRestored();
      aidToast.success(t('restored'), { description: displayTitle(m.title) });
    } catch (error) {
      aidToast.error(t('restoreFailed'), { description: String(error) });
    } finally {
      setBusy(null);
    }
  };
  const eraseOne = async (m: TrashedMeeting) => {
    try {
      await deleteForever(m.id);
      aidToast.success(t('deletedForever'), { description: displayTitle(m.title) });
    } catch (error) {
      aidToast.error(t('deleteFailed'), { description: String(error) });
      throw error;
    }
  };
  const eraseAll = async () => {
    const n = await emptyTrash();
    aidToast.success(t('trashEmptied'), { description: n ? `${n} ${plural(n, 'запись', 'записи', 'записей')}` : undefined });
  };
  if (items.length === 0) {
    return (
      <EmptyFilter title={t('trashEmpty')} hint={t('trashPanelHint')} icon={Trash} />
    );
  }
  return (
    <section aria-label={t('filterTrash')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t('trashPanelHint')}</p>
        <Button variant="ghost" className="-mr-2 shrink-0 text-muted-foreground hover:text-destructive-ink" onClick={() => setErase('all')}>
          <Trash />
          {t('emptyTrash')}
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((m) => {
          const days = daysLeft(m);
          return (
            <li key={m.id} className="flex min-h-[64px] items-center gap-3 rounded-nested p-2">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                <Trash className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium" title={displayTitle(m.title)}>
                  {displayTitle(m.title)}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {m.trashedFolder === null && `${t('trashFileStayed')} · `}
                  {t('trashDaysLeft')} {days} {plural(days, 'день', 'дня', 'дней')}
                </span>
              </span>
              <Button variant="secondary" className="shrink-0" onClick={() => void restore(m)} disabled={busy !== null}>
                {busy === m.id ? <Spinner tone="inherit" /> : <ArrowCounterClockwise />}
                {t('restore')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-12 shrink-0 rounded-full text-muted-foreground"
                    onClick={() => setErase(m)}
                    disabled={busy !== null}
                    aria-label={`${t('deleteForever')}: ${displayTitle(m.title)}`}
                  >
                    <Trash />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('deleteForever')}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {erase === 'all' && (
        <EraseDialog title={t('emptyTrashTitle')} hint={t('emptyTrashHint')} onConfirm={eraseAll} onClose={() => setErase(null)} />
      )}
      {erase && erase !== 'all' && (
        <EraseDialog
          title={t('deleteForeverTitle')}
          hint={`«${displayTitle(erase.title)}». ${t('deleteForeverHint')}`}
          onConfirm={() => eraseOne(erase)}
          onClose={() => setErase(null)}
        />
      )}
    </section>
  );
}

type Filter = 'all' | 'summary' | 'trash';

/** Чипы-фильтры таблетками: выбранный Mikado (роль «выделение»), счётчик серым. */
function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Partial<Record<Filter, number>> }) {
  const items: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: t('filterAll') },
    { id: 'summary', label: t('filterSummary') },
    { id: 'trash', label: t('filterTrash') },
  ];
  return (
    <div role="radiogroup" aria-label={t('filtersLabel')} className="flex flex-wrap gap-2">
      {items.map(({ id, label }) => {
        const active = value === id;
        const n = counts[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={cn(
              // Рамка 2 px у всех чипов (у невыбранных прозрачная): при выборе размер не прыгает
              'flex h-10 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              // Выбранный фильтр: рамка Mikado 2 px и лёгкое стекло внутри (.aid-chip-on), без сплошной заливки:
              // это выбор, а не главное действие
              active ? 'aid-chip-on border-primary text-foreground' : 'border-transparent bg-muted text-foreground hover:bg-input',
            )}
          >
            {label}
            {n !== undefined && <span className={cn('tabular', 'text-muted-foreground')}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Однократный вопрос при первом запуске новой версии: удалить старые пустые записи. */
function EmptyCleanupDialog({ meetings, onDone }: { meetings: MeetingListItem[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const n = meetings.length;
  const remove = async () => {
    setBusy(true);
    let failed = 0;
    for (const m of meetings) {
      try {
        await deleteMeeting(m.id);
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setEmptyCleanupAsked();
    if (failed) aidToast.error(t('deleteFailed'), { description: `${failed} ${plural(failed, 'запись', 'записи', 'записей')} не удалось удалить` });
    onDone();
  };
  const keep = () => {
    setEmptyCleanupAsked();
    onDone();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && keep()}>
      <DialogContent>
        <DialogTitle>
          Удалить {n} {plural(n, 'пустую запись', 'пустые записи', 'пустых записей')}?
        </DialogTitle>
        <DialogDescription>
          {n === 1
            ? 'В ней нет ни одной реплики. Она 7 дней полежит в корзине, оттуда её можно вернуть. Если там был разговор, нажмите «Оставить».'
            : 'В них нет ни одной реплики. Они 7 дней полежат в корзине, оттуда их можно вернуть. Если в какой-то был разговор, нажмите «Оставить».'}
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" size="main" onClick={keep} disabled={busy}>
            {t('emptyCleanupKeep')}
          </Button>
          <Button variant="destructive" size="main" onClick={() => void remove()} disabled={busy}>
            {busy ? <Spinner tone="inherit" /> : <Trash />}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GROUP_LABEL = { today: 'groupToday', yesterday: 'groupYesterday', week: 'groupWeek', earlier: 'groupEarlier' } as const;

interface HomeViewProps {
  /** Обработка после «Остановить»: строка новой встречи со спиннером (recording-controls.tsx). */
  finish: FinishState | null;
  onStart: () => void;
  blocker: StartBlocker | null;
  onDismissBlocker: () => void;
  startError: string | null;
}

function HomeView({ finish, onStart, blocker, onDismissBlocker, startError }: HomeViewProps) {
  const { meetings: sidebarMeetings, setMeetings } = useSidebar();
  const { state, setState, reload } = useMeetingsList(sidebarMeetings);
  const [toDelete, setToDelete] = useState<MeetingListItem | null>(null);
  const [cleanupClosed, setCleanupClosed] = useState(false);

  const patch = (fn: (list: MeetingListItem[]) => MeetingListItem[]) =>
    setState((prev) => (prev.kind === 'ready' ? { kind: 'ready', meetings: fn(prev.meetings) } : prev));

  const rename = async (m: MeetingListItem, title: string) => {
    try {
      await renameMeeting(m.id, title);
      patch((list) => list.map((x) => (x.id === m.id ? { ...x, title } : x)));
      setMeetings(sidebarMeetings.map((x) => (x.id === m.id ? { ...x, title } : x)));
      aidToast.success(t('renamed'));
    } catch (error) {
      aidToast.error(t('renameFailed'), { description: String(error) });
      throw error;
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteMeeting(toDelete.id);
      patch((list) => list.filter((x) => x.id !== toDelete.id));
      setMeetings(sidebarMeetings.filter((x) => x.id !== toDelete.id));
      setToDelete(null);
      toastTrashed(toDelete.id);
    } catch (error) {
      aidToast.error(t('deleteFailed'), { description: String(error) });
    }
  };

  const openFolder = (m: MeetingListItem) =>
    void openMeetingFolder(m.id).catch((error) => aidToast.error(t('openFolderFailed'), { description: String(error) }));
  const { openImportDialog } = useImportDialog();
  const { betaFeatures } = useConfig();
  const [query, setQuery] = useState('');
  // Поиск кнопкой с лупой в шапке: по нажатию поле выезжает влево, лупа становится крестиком
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);
  const closeSearch = () => {
    // Снимаем фокус: иначе свёрнутая кнопка осталась бы с обводкой фокуса
    inputRef.current?.blur();
    setSearchOpen(false);
    setQuery('');
  };
  const [filter, setFilter] = useState<Filter>('all');
  const trashed = useTrashed();

  // Раздела «Не распознано» нет: встреча без текста не создаётся (recording-outcome.tsx),
  // все встречи в одном списке. Старые записи без единой реплики тоже в списке; про них
  // один раз спрашиваем «Удалить пустые записи?» (в корзину)
  const groups = useMemo(() => {
    if (state.kind !== 'ready') return { main: [], legacyEmpty: [] };
    return { main: state.meetings, legacyEmpty: state.meetings.filter((m) => !isKept(m) && m.transcriptCount === 0) };
  }, [state]);

  // Поиск: по названию в базе, по тому, что видно в списке, и по тексту реплик.
  // Тексты уже прочитаны для подробностей строк; пока читаются, ищем по тому, что есть
  const search = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return null;
    const matches = new Map<string, TranscriptMatch>();
    const found = groups.main.filter((m) => {
      const inTitle = normalizeForSearch(m.title).includes(q) || normalizeForSearch(shownTitle(m.title, m.details?.contentTitle)).includes(q);
      const inText = findInTranscript(cachedLines(m.id), query);
      if (inText) matches.set(m.id, inText);
      return inTitle || inText !== null;
    });
    const pending = groups.main.filter((m) => !m.details).length;
    return { found, matches, pending, total: groups.main.length };
  }, [groups, query]);
  const withSummary = (m: MeetingListItem) => m.details?.status === 'summary';
  const filtered = (search ? search.found : groups.main).filter((m) => filter !== 'summary' || withSummary(m));

  // Без поиска список по группам дат: сегодня, вчера, на этой неделе, раньше
  const dated = useMemo(() => {
    const order: DateGroup[] = ['today', 'yesterday', 'week', 'earlier'];
    const time = (m: MeetingListItem) => (m.created_at ? new Date(m.created_at).getTime() || 0 : 0);
    const sorted = [...groups.main].filter((m) => filter !== 'summary' || m.details?.status === 'summary').sort((a, b) => time(b) - time(a));
    return order
      .map((g) => ({ group: g, items: sorted.filter((m) => dateGroup(m.created_at) === g) }))
      .filter((x) => x.items.length > 0);
  }, [groups, filter]);

  // Встреча ещё обрабатывается: строка со спиннером первой в «Сегодня», пока в списке нет
  // сохранённой встречи. Отбракованная запись строки не получает (карточка у кнопки записи)
  const listIds = state.kind === 'ready' ? state.meetings : [];
  const pending =
    finish && !search && filter === 'all' && (finish.stage !== 'saved' || (finish.meetingId !== null && !listIds.some((m) => m.id === finish.meetingId)))
      ? { title: finish.title ? displayTitle(finish.title) : t('recording'), stage: finish.stage === 'saving' ? t('finishSaving') : finish.stage === 'saved' ? t('finishSaved') : t('finishTranscribing') }
      : null;
  const shownGroups = pending && !dated.some((g) => g.group === 'today') ? [{ group: 'today' as DateGroup, items: [] as MeetingListItem[] }, ...dated] : dated;

  const askCleanup = state.kind === 'ready' && !cleanupClosed && !marksSnapshot().emptyCleanupAsked && groups.legacyEmpty.length > 0;
  const listFilter = filter === 'all' || filter === 'summary';
  const showSearch = listFilter && state.kind !== 'error' && (state.kind !== 'ready' || groups.main.length > 0);
  const counts: Partial<Record<Filter, number>> =
    state.kind === 'ready'
      ? {
          all: groups.main.length,
          summary: groups.main.filter((m) => m.details?.status === 'summary').length,
          trash: trashed.length,
        }
      : {};

  // Шапка в плитке списка (как в Я.Музыке): заголовок 36/40 с подписью, справа поиск и импорт круглыми
  // кнопками, ниже чипы-фильтры. Поле поиска выезжает влево, лупа становится крестиком, чипы на месте;
  // Esc и крестик сворачивают и очищают, пустое поле сворачивается при потере фокуса. Запись в капсуле внизу (RecordDock)
  // Шапка как large title: в полосе поиск и импорт, большой заголовок с подписью и чипы-фильтры
  // прокручиваются со списком; при прокрутке в полосе остаётся «Встречи» (Page)
  const actions = (
    <>
        {showSearch && (
          // Поиск: поле выезжает влево отдельной таблеткой, а сама кнопка остаётся на месте,
          // и лупа в ней превращается в крестик «Закрыть поиск» (как в Finder и Музыке на macOS).
          // Анимируется ширина поля, остальное не двигается. Обводка фокуса внутри поля:
          // снаружи её срезала бы шапка
          <>
            <div className={cn('aid-search-field h-14 overflow-hidden rounded-full bg-secondary', searchOpen && 'is-open')}>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                onBlur={() => !query && setSearchOpen(false)}
                placeholder={t('searchShort')}
                aria-label={t('searchMeetings')}
                tabIndex={searchOpen ? 0 : -1}
                disabled={state.kind !== 'ready'}
                className="h-full w-full bg-transparent px-5 text-[15px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn('aid-search-toggle relative size-14 [&_svg]:size-6', searchOpen && 'is-open', query && !searchOpen && 'has-query')}
                  // Не отдаём фокус при нажатии: иначе пустое поле свернётся раньше клика
                  onMouseDown={(e) => searchOpen && e.preventDefault()}
                  onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                  aria-label={searchOpen ? t('closeSearch') : t('searchMeetings')}
                  aria-expanded={searchOpen}
                >
                  {/* Лупа контуром (bold): залитая рисуется сплошным диском; X bold: залитый нарисован квадратом */}
                  <MagnifyingGlass weight="bold" className="aid-search-icon-find absolute" />
                  <X weight="bold" className="aid-search-icon-close absolute" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{searchOpen ? t('closeSearch') : t('searchMeetings')}</TooltipContent>
            </Tooltip>
          </>
        )}
        {betaFeatures.importAndRetranscribe && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="size-14 [&_svg]:size-6" onClick={() => openImportDialog()} aria-label={t('importAudio')}>
                <UploadSimple />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('importAudio')}</TooltipContent>
          </Tooltip>
        )}
    </>
  );
  const hero = (
    <>
      <h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('homeTitle')}</h1>
      <p className="mt-1 truncate text-sm text-muted-foreground">{t('homeSubtitle')}</p>
    {state.kind !== 'error' && (
      <div className="mt-5">
        <FilterChips value={filter} onChange={setFilter} counts={counts} />
      </div>
    )}
    </>
  );

  return (
    <Page title={t('homeTitle')} actions={actions} hero={hero}>
      {blocker && <StartBlockerPanel blocker={blocker} onRetry={onStart} onClose={onDismissBlocker} />}
      {!blocker && startError && (
        <Alert variant="destructive">
          <Warning />
          <div>
            <AlertTitle>{t('startFailed')}</AlertTitle>
            <AlertDescription>
              <p>{friendlyError(startError, t('startFailedHint')).message}</p>
              <ErrorDetails raw={startError} />
            </AlertDescription>
          </div>
        </Alert>
      )}

      {state.kind === 'error' ? (
        <Alert variant="destructive">
          <Warning />
          <div>
            <AlertTitle>{t('meetingsError')}</AlertTitle>
            <AlertDescription>
              <p>{state.error.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" size="main" onClick={() => void reload()}>
                  <ArrowClockwise />
                  {t('retry')}
                </Button>
                <ErrorDetails raw={state.error.raw} />
              </div>
            </AlertDescription>
          </div>
        </Alert>
      ) : (
        <div className={blocker || startError ? 'mt-2' : ''}>
          {/* Список в той же плитке под шапкой: строки встреч без вложенных карточек.
              @container: от 1100 px ширины списка строки в две колонки */}
          <section aria-label={t('meetingsList')} className="@container">
          {filter === 'trash' && <TrashPanel items={trashed} onRestored={() => void reload()} />}
          {listFilter && (<>
          {state.kind === 'loading' && (
            <div className="space-y-1" role="status" aria-busy="true" aria-label={t('loading')}>
              {/* Та же геометрия, что у MeetingRow: иконка 20 px, две строки, шеврон; без скачка.
                  Строки загораются волной сверху вниз (.aid-skeleton-wave) */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aid-skeleton-wave flex min-h-[64px] items-center gap-3 rounded-nested p-2"
                  style={{ ['--wave-delay' as string]: `${i * 0.18}s` }}
                >
                  <Skeleton className="size-12 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 rounded-lg" />
                    <Skeleton className="h-3.5 w-1/3 rounded-lg" />
                  </div>
                  <span className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {state.kind === 'ready' && groups.main.length === 0 && !pending && <EmptyFilter title={t('noMeetings')} hint={t('noMeetingsHint')} />}
          {state.kind === 'ready' && filter === 'summary' && !search && groups.main.length > 0 && dated.length === 0 && (
            <EmptyFilter title={t('noSummaries')} hint={t('noSummariesHint')} icon={Sparkle} />
          )}

          {state.kind === 'ready' && search && groups.main.length > 0 && filtered.length === 0 && search.pending === 0 && (
            <div className="flex flex-col items-start py-10">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                <MagnifyingGlass weight="bold" className="size-6" />
              </span>
              <h2 className="mt-4 text-[22px] font-bold leading-7 tracking-tight">{t('nothingFound')}</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">{t('nothingFoundHint')}</p>
            </div>
          )}

          {search && search.pending > 0 && (
            <p className="pb-2 text-sm text-muted-foreground" role="status">
              <Spinner size={16} className="mr-2 inline-block align-[-3px]" />
              {t('searchProgress')} {search.total - search.pending} из {search.total}
            </p>
          )}

          {search && filtered.length > 0 && (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 @[1100px]:grid-cols-2" aria-label={t('meetingsList')}>
              {filtered.map((m) => (
                <MeetingRow
                  key={m.id}
                  meeting={m}
                  match={search.matches.get(m.id) ?? null}
                  onRename={(title) => rename(m, title)}
                  onDelete={() => setToDelete(m)}
                  onOpenFolder={() => openFolder(m)}
                />
              ))}
            </ul>
          )}

          {!search &&
            (state.kind === 'ready' ? shownGroups : []).map(({ group, items }) => (
              <section key={group} aria-labelledby={`aid-group-${group}`} className="mt-5 first:mt-1">
                {/* Мелкий надзаголовок группы */}
                <h2 id={`aid-group-${group}`} className="pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {t(GROUP_LABEL[group])}
                </h2>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1 @[1100px]:grid-cols-2">
                  {group === 'today' && pending && <PendingRow title={pending.title} stage={pending.stage} done={finish?.stage === 'saved'} />}
                  {items.map((m) => (
                    <MeetingRow
                      key={m.id}
                      meeting={m}
                      timeOnly={group === 'today' || group === 'yesterday'}
                      onRename={(title) => rename(m, title)}
                      onDelete={() => setToDelete(m)}
                      onOpenFolder={() => openFolder(m)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>)}
          </section>
        </div>
      )}
      <DeleteMeetingDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? shownTitle(toDelete.title, toDelete.details?.contentTitle) : undefined}
        onConfirm={remove}
      />
      {askCleanup && (
        <EmptyCleanupDialog
          meetings={groups.legacyEmpty}
          onDone={() => {
            setCleanupClosed(true);
            void reload();
          }}
        />
      )}
    </Page>
  );
}

function HomeContent() {
  const rec = useRecordingControls();
  const params = useSearchParams();
  // Встреча открывается здесь же, по ?id= (open-meeting.ts, in-place-router.tsx)
  const meetingId = params.get('id');
  // Во время записи главная показывает транскрипт; «Назад» переключает на список, запись идёт дальше.
  // После «Остановить» сразу список: экрана обработки нет, шаг показывают строка и карточка
  if (rec.isRecording && rec.view === 'recording') {
    return (
      <RecordingView
        isPaused={rec.isPaused}
        duration={rec.duration}
        live={rec.live}
        onBack={() => rec.setView('list')}
        onStop={rec.stop}
      />
    );
  }
  if (meetingId) return <MeetingDetails key={meetingId} />;
  // Настройки тоже здесь, по ?view=settings (in-place-router.tsx): отдельная страница в Tauri зависала
  if (params.get('view') === 'settings') return <AidSettings />;
  return <HomeView finish={previewFinish(params) ?? rec.finish} onStart={() => void rec.startAnywhere()} blocker={rec.blocker} onDismissBlocker={rec.dismissBlocker} startError={rec.startError} />;
}

export default function Home() {
  // useSearchParams в статической выгрузке требует границу Suspense
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
