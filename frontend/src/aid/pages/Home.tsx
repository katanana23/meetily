// Главная: список встреч и запуск записи. Во время записи на этом же месте
// показывается экран записи, чтобы хуки записи не размонтировались.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { ArrowClockwise, CaretDown, Chats, UploadSimple, FolderOpen, MagnifyingGlass, Trash, Warning } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { Page } from '@/aid/components/Page';
import { RecordButton } from '@/aid/components/RecordButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { MeetingRow, type MeetingListItem } from '@/aid/components/MeetingRow';
import { cachedDetails, loadDetails } from '@/aid/lib/meeting-details-cache';
import { deleteMeeting, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { aidToast } from '@/aid/lib/toasts';
import { RecordingView } from '@/aid/pages/Recording';
import { type StartBlocker } from '@/aid/lib/recording';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { isDiscarded, isKept, isUnrecognized, marksSnapshot, onMarksChange, purgeDiscarded, setEmptyCleanupAsked } from '@/aid/lib/recording-marks';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';
import { cn } from '@/aid/lib/utils';
import { friendlyError, type FriendlyError } from '@/aid/lib/meeting';
import { displayTitle, formatShortDate, isAutoTitle, plural, shownTitle } from '@/aid/lib/format';
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

/** Раздел внизу списка: записи без текста. Свёрнут по умолчанию. */
function UnrecognizedSection({
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
  const [open, setOpen] = useState(false);
  const [retranscribe, setRetranscribe] = useState<MeetingListItem | null>(null);
  const { betaFeatures } = useConfig();
  const canRetranscribe = Boolean(betaFeatures.importAndRetranscribe);
  return (
    <section className="mt-2 rounded-tile bg-card p-2" aria-label={t('unrecognizedSection')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-nested px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('unrecognizedSection')} · {meetings.length}
        {/* Вниз, когда свёрнуто, вверх, когда раскрыто */}
        <CaretDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="px-3 text-sm text-muted-foreground">{legacy ? t('unrecognizedLegacyHint') : t('unrecognizedHint')}</p>
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id} className="flex min-h-[64px] flex-wrap items-center gap-2 rounded-nested py-2 pl-3 pr-1 hover:bg-muted">
                <Link
                  href={`/meeting-details?id=${encodeURIComponent(m.id)}`}
                  className="min-w-0 flex-1 rounded-nested py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate text-[15px] font-medium" title={displayTitle(m.title)}>
                    {displayTitle(m.title)}
                  </span>
                  {m.created_at && !isAutoTitle(m.title) && <span className="block text-sm text-muted-foreground">{formatShortDate(m.created_at)}</span>}
                </Link>
                {canRetranscribe && m.folder_path && (
                  <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setRetranscribe(m)}>
                    <ArrowClockwise />
                    {t('retranscribe')}
                  </Button>
                )}
                <Button variant="ghost" className="h-10 rounded-full px-4 text-destructive hover:text-destructive" onClick={() => onDelete(m)}>
                  <Trash />
                  {t('delete')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-full text-muted-foreground"
                  onClick={() => onOpenFolder(m)}
                  aria-label={`${t('openRecordingFolder')}: ${displayTitle(m.title)}`}
                >
                  <FolderOpen />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
            ? 'В ней нет ни одной реплики. Файл звука останется в папке записей. Если там был разговор, нажмите «Оставить»: запись будет в разделе «Не распознано» внизу списка.'
            : 'В них нет ни одной реплики. Файлы звука останутся в папке записей. Если в какой-то был разговор, нажмите «Оставить»: такие записи будут в разделе «Не распознано» внизу списка.'}
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
  const { hotkey } = useRecordingControls();
  const { betaFeatures } = useConfig();
  const [query, setQuery] = useState('');

  // Записи без единой реплики в общий список не попадают: либо раздел «Не распознано»
  // внизу, либо (оставленные пользователем через «Вернуть») обычная строка
  const groups = useMemo(() => {
    if (state.kind !== 'ready') return { main: [], unrecognized: [], legacyEmpty: [] };
    // Помечена «не распознано» после стопа (детектор слышал речь, осмысленного текста нет)
    // или старая запись без единой реплики; возвращённые через «Вернуть» остаются в общем списке
    const aside = (m: MeetingListItem) => !isKept(m) && (isUnrecognized(m) || m.transcriptCount === 0);
    const unrecognized = state.meetings.filter(aside);
    return {
      main: state.meetings.filter((m) => !aside(m)),
      unrecognized,
      legacyEmpty: unrecognized.filter((m) => !isUnrecognized(m) && m.transcriptCount === 0),
    };
  }, [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // ищем и по названию в базе, и по тому, что видно в списке
    return q
      ? groups.main.filter((m) => m.title.toLowerCase().includes(q) || shownTitle(m.title, m.details?.contentTitle).toLowerCase().includes(q))
      : groups.main;
  }, [groups, query]);

  const askCleanup = state.kind === 'ready' && !cleanupClosed && !marksSnapshot().emptyCleanupAsked && groups.legacyEmpty.length > 0;
  const showSearch = state.kind !== 'error' && (state.kind !== 'ready' || groups.main.length > 0);

  const header = (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t('homeTitle')}</h1>
    </>
  );

  return (
    <Page header={header}>
      {/* Бенто: крупная плитка «Новая запись» (2/3), рядом малая плитка импорта */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <section
          aria-label={t('newRecording')}
          className={cn('flex min-h-[128px] items-center gap-5 rounded-tile bg-card p-4', betaFeatures.importAndRetranscribe ? 'col-span-2' : 'col-span-3')}
        >
          <RecordButton size={96} />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{t('newRecording')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('newRecordingHint')}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <kbd className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-foreground">{hotkey}</kbd>
            </p>
          </div>
        </section>
        {betaFeatures.importAndRetranscribe && (
          <section aria-label={t('importAudio')} className="flex items-center justify-center rounded-tile bg-card p-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="size-14 [&_svg]:size-5" onClick={() => openImportDialog()} aria-label={t('importAudio')}>
                  <UploadSimple />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('importAudio')}</TooltipContent>
            </Tooltip>
          </section>
        )}
      </div>
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
          {/* Плитка списка: поиск и строки встреч внутри, отступ 8 px, вложенный радиус */}
          <section aria-label={t('meetingsList')} className="rounded-tile bg-card p-2">
          {showSearch && (
            <div className="relative mb-2">
              <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchMeetings')}
                aria-label={t('searchMeetings')}
                className="bg-muted pl-12"
                disabled={state.kind !== 'ready'}
              />
            </div>
          )}
          {state.kind === 'loading' && (
            <div className="space-y-1" role="status" aria-busy="true" aria-label={t('loading')}>
              {/* Та же геометрия, что у MeetingRow: иконка 20 px, две строки, шеврон; без скачка */}
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-h-[64px] items-center gap-3 rounded-nested py-3 pl-3 pr-3">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 rounded-lg" />
                    <Skeleton className="h-3.5 w-1/3 rounded-lg" />
                  </div>
                  <span className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {state.kind === 'ready' && groups.main.length === 0 && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Chats className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="mt-3 text-xl font-semibold">{t('noMeetings')}</h2>
              <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">{t('noMeetingsHint')}</p>
            </div>
          )}

          {state.kind === 'ready' && groups.main.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <MagnifyingGlass className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold">{t('nothingFound')}</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">{t('nothingFoundHint')}</p>
            </div>
          )}

          {filtered.length > 0 && (
            <ul className="space-y-1" aria-label={t('meetingsList')}>
              {filtered.map((m) => (
                <MeetingRow
                  key={m.id}
                  meeting={m}
                  onRename={(title) => rename(m, title)}
                  onDelete={() => setToDelete(m)}
                  onOpenFolder={() => openFolder(m)}
                />
              ))}
            </ul>
          )}
          </section>

          {state.kind === 'ready' && groups.unrecognized.length > 0 && !query.trim() && (
            <UnrecognizedSection
              meetings={groups.unrecognized}
              legacy={groups.legacyEmpty.length > 0}
              onDelete={setToDelete}
              onOpenFolder={openFolder}
            />
          )}
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

export default function Home() {
  const rec = useRecordingControls();
  // Во время записи главная показывает транскрипт; «Назад» переключает на список, запись идёт дальше
  const showRecording = (rec.isRecording || rec.phase !== null) && rec.view === 'recording';

  return showRecording ? (
    <RecordingView
      isPaused={rec.isPaused}
      phase={rec.phase}
      duration={rec.duration}
      live={rec.live}
      onBack={() => rec.setView('list')}
      onStop={rec.stop}
    />
  ) : (
    <HomeView onStart={() => void rec.startAnywhere()} blocker={rec.blocker} onDismissBlocker={rec.dismissBlocker} startError={rec.startError} />
  );
}
