// Главная: список встреч и запуск записи. Во время записи на этом же месте
// показывается экран записи, чтобы хуки записи не размонтировались.

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { ArrowClockwise, Chats, FolderOpen, MagnifyingGlass, Sparkle, Trash, UploadSimple, Warning } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page } from '@/aid/components/Page';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { MeetingRow, StatusThumb, type MeetingListItem } from '@/aid/components/MeetingRow';
import { Mascot } from '@/aid/components/Mascot';
import { openTrash } from '@/aid/lib/recording-trash';
import { cachedDetails, cachedLines, loadDetails, normalizeForSearch } from '@/aid/lib/meeting-details-cache';
import { findInTranscript, type TranscriptMatch } from '@/aid/lib/transcript-search';
import { MIN_MEANINGFUL_WORDS } from '@/aid/lib/speech';
import { deleteMeeting, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { warmUpRoutes } from '@/aid/lib/open-meeting';
import { aidToast } from '@/aid/lib/toasts';
import { RecordingView } from '@/aid/pages/Recording';
import MeetingDetails from '@/aid/pages/MeetingDetails';
import { type StartBlocker } from '@/aid/lib/recording';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { isDiscarded, isKept, isUnrecognized, marksSnapshot, onMarksChange, purgeDiscarded, setEmptyCleanupAsked } from '@/aid/lib/recording-marks';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';
import { cn } from '@/aid/lib/utils';
import { friendlyError, type FriendlyError } from '@/aid/lib/meeting';
import { dateGroup, displayTitle, formatShortDate, isAutoTitle, plural, shownTitle, type DateGroup } from '@/aid/lib/format';
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
      const all = await invoke<Array<{ id: string; title: string }>>('api_get_meetings');
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
      const list = meetings.filter((m) => !isDiscarded(m));
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

  // Разработка: заранее скомпилировать страницу встречи, иначе первый клик ждёт 5–7 с
  useEffect(() => warmUpRoutes(), []);

  return { state, setState, reload: () => load() };
}

const BLOCKER: Record<Exclude<StartBlocker['kind'], 'check-failed'>, { title: string; hint: string; action: string; href: string }> = {
  'no-model': { title: t('blockNoModel'), hint: t('blockNoModelHint'), action: t('downloadModel'), href: '/settings?tab=transcription' },
  'model-downloading': { title: t('blockDownloading'), hint: t('blockDownloadingHint'), action: t('showDownload'), href: '/settings?tab=transcription' },
  'no-microphone': { title: t('blockNoMic'), hint: t('blockNoMicHint'), action: t('grantAccess'), href: '' },
};

/** Почему запись не началась и как это исправить. Фокус переходит на кнопку исправления. */
function StartBlockerPanel({ blocker, onRetry, onClose }: { blocker: StartBlocker; onRetry: () => void; onClose: () => void }) {
  const actionRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  useEffect(() => actionRef.current?.focus(), [blocker]);
  if (blocker.kind === 'check-failed') return null;
  const copy = BLOCKER[blocker.kind];

  const grantMic = async () => {
    try {
      const granted = await invoke<boolean>('trigger_microphone_permission');
      if (granted) {
        onRetry();
        return;
      }
    } catch {
      /* откроем системные настройки */
    }
    await invoke('open_system_settings').catch(() => undefined);
  };

  return (
    <Alert aria-live="polite">
      <Warning />
      <div>
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          <p>{copy.hint}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {copy.href ? (
              <Button asChild size="main">
                <Link ref={actionRef} href={copy.href}>
                  {copy.action}
                </Link>
              </Button>
            ) : (
              <Button ref={actionRef} size="main" onClick={() => void grantMic()}>
                {copy.action}
              </Button>
            )}
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

/** Чип «Не распознано»: записи без текста или с парой фраз, с действиями. */
function UnrecognizedList({
  meetings,
  legacy,
  onDelete,
  onOpenFolder,
}: {
  meetings: MeetingListItem[];
  legacy: boolean;
  onDelete: (m: MeetingListItem) => void;
  onOpenFolder: (m: MeetingListItem) => void;
}) {
  const [retranscribe, setRetranscribe] = useState<MeetingListItem | null>(null);
  const { betaFeatures } = useConfig();
  const canRetranscribe = Boolean(betaFeatures.importAndRetranscribe);
  if (meetings.length === 0) {
    return <EmptyFilter title={t('noUnrecognized')} hint={t('noUnrecognizedHint')} />;
  }
  return (
    <section aria-label={t('unrecognizedSection')}>
      <p className="mb-3 text-sm text-muted-foreground">{legacy ? t('unrecognizedLegacyHint') : t('unrecognizedHint')}</p>
      {/* Одна колонка: у строки три действия, в две колонки названия обрезались бы */}
      <ul className="flex flex-col gap-1">
        {meetings.map((m) => (
          <li key={m.id} className="group flex min-h-[64px] flex-wrap items-center gap-3 rounded-nested p-2 transition-colors hover:bg-muted">
            <Link
              href={`/meeting-details?id=${encodeURIComponent(m.id)}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-nested focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatusThumb kind="silent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium" title={displayTitle(m.title)}>
                  {displayTitle(m.title)}
                </span>
                {m.created_at && !isAutoTitle(m.title) && <span className="block text-sm text-muted-foreground">{formatShortDate(m.created_at)}</span>}
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              {canRetranscribe && m.folder_path && (
                <Button variant="outline" size="sm" onClick={() => setRetranscribe(m)}>
                  <ArrowClockwise />
                  {t('retranscribe')}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(m)}>
                <Trash />
                {t('delete')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground"
                onClick={() => onOpenFolder(m)}
                aria-label={`${t('openRecordingFolder')}: ${displayTitle(m.title)}`}
              >
                <FolderOpen />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {retranscribe && (
        <RetranscribeDialog
          open
          onOpenChange={(v) => !v && setRetranscribe(null)}
          meetingId={retranscribe.id}
          meetingFolderPath={retranscribe.folder_path ?? null}
          onComplete={() => setRetranscribe(null)}
        />
      )}
    </section>
  );
}

/** Пустой результат фильтра: иконка в круге (или маскот), заголовок и подсказка, слева по краю списка. */
function EmptyFilter({
  title,
  hint,
  icon: Icon = Chats,
  mascot,
  children,
}: {
  title: string;
  hint: string;
  icon?: typeof Chats;
  /** Пустой список встреч: вместо иконки маскот, смотрит за курсором. */
  mascot?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start py-10">
      {mascot ? (
        <Mascot mood="idle" size={176} followCursor className="-mb-6 -ml-3 text-muted-foreground" />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-6" />
        </span>
      )}
      <h2 className="mt-4 text-[22px] font-bold leading-7 tracking-tight">{title}</h2>
      <p className="mt-1 max-w-md text-[15px] text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

/** Чип «Корзина»: что туда попадает и кнопка открыть папку. Сама корзина в файлах, не в базе. */
function TrashPanel() {
  const { storageLocations, loadPreferences } = useConfig();
  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);
  const root = storageLocations?.recordings ?? null;
  const open = async () => {
    if (!root) return;
    try {
      await openTrash(root);
    } catch (error) {
      aidToast.error(t('openFolderFailed'), { description: String(error) });
    }
  };
  return (
    <EmptyFilter title={t('trashPanelTitle')} hint={t('trashPanelHint')} icon={Trash}>
      <Button size="main" className="mt-5" onClick={() => void open()} disabled={!root}>
        <FolderOpen />
        {t('openTrash')}
      </Button>
    </EmptyFilter>
  );
}

type Filter = 'all' | 'summary' | 'unrecognized' | 'trash';

/** Чипы-фильтры таблетками: выбранный Mikado (роль «выделение»), счётчик серым. */
function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Partial<Record<Filter, number>> }) {
  const items: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: t('filterAll') },
    { id: 'summary', label: t('filterSummary') },
    { id: 'unrecognized', label: t('filterUnrecognized') },
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
              'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-input',
            )}
          >
            {label}
            {n !== undefined && <span className={cn('tabular', active ? 'text-primary-foreground' : 'text-muted-foreground')}>{n}</span>}
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
            ? 'В ней нет ни одной реплики. Файл звука останется в папке записей. Если там был разговор, нажмите «Оставить»: запись будет в фильтре «Не распознано».'
            : 'В них нет ни одной реплики. Файлы звука останутся в папке записей. Если в какой-то был разговор, нажмите «Оставить»: такие записи будут в фильтре «Не распознано».'}
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
  onStart: () => void;
  blocker: StartBlocker | null;
  onDismissBlocker: () => void;
  startError: string | null;
}

function HomeView({ onStart, blocker, onDismissBlocker, startError }: HomeViewProps) {
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
      aidToast.success(t('deleted'), { description: t('deletedHint') });
    } catch (error) {
      aidToast.error(t('deleteFailed'), { description: String(error) });
    }
  };

  const openFolder = (m: MeetingListItem) =>
    void openMeetingFolder(m.id).catch((error) => aidToast.error(t('openFolderFailed'), { description: String(error) }));
  const { openImportDialog } = useImportDialog();
  const { betaFeatures } = useConfig();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Записи без единой реплики в общий список не попадают: либо раздел «Не распознано»
  // внизу, либо (оставленные пользователем через «Вернуть») обычная строка
  const groups = useMemo(() => {
    if (state.kind !== 'ready') return { main: [], unrecognized: [], legacyEmpty: [] };
    // Помечена «не распознано» после стопа (детектор слышал речь, осмысленного текста нет)
    // или старая запись без единой реплики; возвращённые через «Вернуть» остаются в общем списке
    // Пара фраз (меньше 15 слов по подробностям строки) тоже уходит вниз: из неё не
    // собрать ни транскрипт для чтения, ни итоги
    const aside = (m: MeetingListItem) =>
      !isKept(m) &&
      (isUnrecognized(m) || m.transcriptCount === 0 || (m.details !== null && m.details.status !== 'unknown' && m.details.words < MIN_MEANINGFUL_WORDS));
    const unrecognized = state.meetings.filter(aside);
    return {
      main: state.meetings.filter((m) => !aside(m)),
      unrecognized,
      legacyEmpty: unrecognized.filter((m) => !isUnrecognized(m) && m.transcriptCount === 0),
    };
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

  const askCleanup = state.kind === 'ready' && !cleanupClosed && !marksSnapshot().emptyCleanupAsked && groups.legacyEmpty.length > 0;
  const listFilter = filter === 'all' || filter === 'summary';
  const showSearch = listFilter && state.kind !== 'error' && (state.kind !== 'ready' || groups.main.length > 0);
  const counts: Partial<Record<Filter, number>> =
    state.kind === 'ready'
      ? { all: groups.main.length, summary: groups.main.filter((m) => m.details?.status === 'summary').length, unrecognized: groups.unrecognized.length }
      : {};

  // Шапка плитки: заголовок 36/40 с подписью, импорт аудио иконкой, чипы-фильтры.
  // Запись в плитке записи внизу (RecordDock)
  const header = (
    <>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('homeTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('homeSubtitle')}</p>
      </div>
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
    </div>
    {state.kind !== 'error' && (
      <div className="mt-5">
        <FilterChips value={filter} onChange={setFilter} counts={counts} />
      </div>
    )}
    </>
  );

  return (
    <Page header={header}>
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
        <Alert variant="destructive" className={blocker || startError ? 'mt-2' : ''}>
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
          {/* Список прямо на плитке контента: поиск и строки встреч, без вложенных карточек.
              @container: от 1100 px ширины списка строки в две колонки */}
          <section aria-label={t('meetingsList')} className="@container">
          {filter === 'unrecognized' && state.kind === 'ready' && (
            <UnrecognizedList meetings={groups.unrecognized} legacy={groups.legacyEmpty.length > 0} onDelete={setToDelete} onOpenFolder={openFolder} />
          )}
          {filter === 'trash' && <TrashPanel />}
          {listFilter && (<>
          {showSearch && (
            <div className="relative mb-3">
              {/* Лупа контуром (bold): залитая рисуется сплошным диском и выглядит грубо */}
              <MagnifyingGlass weight="bold" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchMeetings')}
                aria-label={t('searchMeetings')}
                className="pl-12"
                disabled={state.kind !== 'ready'}
              />
            </div>
          )}
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

          {state.kind === 'ready' && groups.main.length === 0 && <EmptyFilter title={t('noMeetings')} hint={t('noMeetingsHint')} mascot />}
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
            dated.map(({ group, items }) => (
              <section key={group} aria-labelledby={`aid-group-${group}`} className="mt-5 first:mt-1">
                {/* Мелкий надзаголовок группы */}
                <h2 id={`aid-group-${group}`} className="pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {t(GROUP_LABEL[group])}
                </h2>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1 @[1100px]:grid-cols-2">
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

// Только в разработке: лист эмоций маскота по ?mascot=sheet (MascotSheet.tsx); в сборку не попадает
const MascotSheet =
  process.env.NODE_ENV === 'development' ? dynamic(() => import('@/aid/components/MascotSheet').then((m) => m.MascotSheet), { ssr: false }) : null;

function HomeContent() {
  const rec = useRecordingControls();
  const params = useSearchParams();
  // Встреча открывается здесь же, по ?id= (open-meeting.ts, in-place-router.tsx)
  const meetingId = params.get('id');
  if (MascotSheet && params.get('mascot') === 'sheet') return <MascotSheet still={params.get('still') === '1'} />;
  // Во время записи главная показывает транскрипт; «Назад» переключает на список, запись идёт дальше
  const showRecording = (rec.isRecording || rec.phase !== null) && rec.view === 'recording';

  if (showRecording) {
    return (
      <RecordingView
        isPaused={rec.isPaused}
        phase={rec.phase}
        duration={rec.duration}
        live={rec.live}
        onBack={() => rec.setView('list')}
        onStop={rec.stop}
        discardVerdict={rec.discardVerdict}
      />
    );
  }
  if (meetingId) return <MeetingDetails key={meetingId} />;
  return <HomeView onStart={() => void rec.startAnywhere()} blocker={rec.blocker} onDismissBlocker={rec.dismissBlocker} startError={rec.startError} />;
}

export default function Home() {
  // useSearchParams в статической выгрузке требует границу Suspense
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
