// Главная: список встреч и запуск записи. Во время записи на этом же месте
// показывается экран записи, чтобы хуки записи не размонтировались.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { ArrowClockwise, ChatsCircle, CircleNotch, FileAudio, MagnifyingGlass, Microphone, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { MeetingRow, type MeetingListItem, type MeetingStatus } from '@/aid/components/MeetingRow';
import { deleteMeeting, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { aidToast } from '@/aid/lib/toasts';
import { RecordingView } from '@/aid/pages/Recording';
import { useAidRecording, type StartBlocker } from '@/aid/lib/recording';
import { friendlyError, type FriendlyError } from '@/aid/lib/meeting';
import { displayTitle } from '@/aid/lib/format';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useConfig } from '@/contexts/ConfigContext';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; error: FriendlyError }
  | { kind: 'ready'; meetings: MeetingListItem[] };

const SUMMARIZING = ['processing', 'pending', 'started', 'running', 'summarizing', 'regenerating'];

/** Состояние встречи для строки списка: итоги, только транскрипт, речь не распознана. */
async function loadStatus(meetingId: string): Promise<MeetingStatus> {
  const [summary, page] = await Promise.allSettled([
    invoke<{ status?: string; data?: unknown } | null>('api_get_summary', { meetingId }),
    invoke<{ total_count?: number }>('api_get_meeting_transcripts', { meetingId, limit: 1, offset: 0 }),
  ]);
  const st = summary.status === 'fulfilled' ? (summary.value?.status ?? '').toLowerCase() : '';
  if (SUMMARIZING.includes(st)) return 'summarizing';
  if (st === 'completed' && summary.status === 'fulfilled' && summary.value?.data) return 'summary';
  if (page.status !== 'fulfilled') return 'unknown';
  return (page.value?.total_count ?? 0) > 0 ? 'transcript' : 'silent';
}

function useMeetingsList(refreshKey: unknown) {
  const [state, setState] = useState<ListState>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const list = await invoke<Array<{ id: string; title: string }>>('api_get_meetings');
      // Дату ядро отдаёт только в метаданных встречи, состояние собираем из итогов и транскрипта
      const [metas, statuses] = await Promise.all([
        Promise.allSettled(list.map((m) => invoke<{ created_at?: string }>('api_get_meeting_metadata', { meetingId: m.id }))),
        Promise.all(list.map((m) => loadStatus(m.id).catch((): MeetingStatus => 'unknown'))),
      ]);
      setState({
        kind: 'ready',
        meetings: list.map((m, i) => {
          const meta = metas[i];
          return { ...m, created_at: meta.status === 'fulfilled' ? meta.value?.created_at : undefined, status: statuses[i] };
        }),
      });
    } catch (error) {
      setState({ kind: 'error', error: friendlyError(error, 'Проверьте, что приложение запущено, и попробуйте ещё раз.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { state, setState, reload: load };
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
    <Alert className="mt-8" aria-live="polite">
      <WarningCircle weight="fill" />
      <div>
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          <p>{copy.hint}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {copy.href ? (
              <Button asChild>
                <Link ref={actionRef} href={copy.href}>
                  {copy.action}
                </Link>
              </Button>
            ) : (
              <Button ref={actionRef} onClick={() => void grantMic()}>
                {copy.action}
              </Button>
            )}
            {blocker.kind !== 'no-model' && (
              <Button variant="outline" onClick={onRetry}>
                <ArrowClockwise />
                {t('checkAgain')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('later')}
            </Button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
}

interface HomeViewProps {
  onStart: () => void;
  isStarting: boolean;
  blocker: StartBlocker | null;
  onDismissBlocker: () => void;
  startError: string | null;
}

function HomeView({ onStart, isStarting, blocker, onDismissBlocker, startError }: HomeViewProps) {
  const { meetings: sidebarMeetings, setMeetings } = useSidebar();
  const { state, setState, reload } = useMeetingsList(sidebarMeetings);
  const [toDelete, setToDelete] = useState<MeetingListItem | null>(null);

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

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const q = query.trim().toLowerCase();
    // ищем и по названию в базе, и по тому, что видно в списке
    return q
      ? state.meetings.filter((m) => m.title.toLowerCase().includes(q) || displayTitle(m.title).toLowerCase().includes(q))
      : state.meetings;
  }, [state, query]);

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('homeTitle')}</h1>
        <div className="flex flex-wrap gap-3">
          {betaFeatures.importAndRetranscribe && (
            <Button variant="outline" size="xl" onClick={() => openImportDialog()}>
              <FileAudio />
              {t('importAudio')}
            </Button>
          )}
          <Button size="xl" onClick={onStart} disabled={isStarting}>
            {isStarting ? <CircleNotch className="animate-spin" /> : <Microphone weight="fill" />}
            {t('startRecording')}
          </Button>
        </div>
      </header>

      {blocker && <StartBlockerPanel blocker={blocker} onRetry={onStart} onClose={onDismissBlocker} />}
      {!blocker && startError && (
        <Alert variant="destructive" className="mt-8">
          <WarningCircle weight="fill" />
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
        <Alert variant="destructive" className="mt-8">
          <WarningCircle weight="fill" />
          <div>
            <AlertTitle>{t('meetingsError')}</AlertTitle>
            <AlertDescription>
              <p>{state.error.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => void reload()}>
                  <ArrowClockwise />
                  {t('retry')}
                </Button>
                <ErrorDetails raw={state.error.raw} />
              </div>
            </AlertDescription>
          </div>
        </Alert>
      ) : (
        <>
          {(state.kind !== 'ready' || state.meetings.length > 0) && (
          <div className="relative mt-8">
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
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

          <div className={state.kind === 'ready' && state.meetings.length === 0 ? 'mt-8' : 'mt-4'}>
            {state.kind === 'loading' && (
              <Card className="divide-y divide-border overflow-hidden" role="status" aria-busy="true" aria-label={t('loading')}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-5">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3 rounded-lg" />
                      <Skeleton className="h-3 w-1/4 rounded-lg" />
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {state.kind === 'ready' && state.meetings.length === 0 && (
              <Card className="flex flex-col items-center px-8 py-16 text-center">
                <ChatsCircle className="size-5 text-muted-foreground" aria-hidden />
                <h2 className="mt-3 text-xl font-semibold">{t('noMeetings')}</h2>
                <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">{t('noMeetingsHint')}</p>
              </Card>
            )}

            {state.kind === 'ready' && state.meetings.length > 0 && filtered.length === 0 && (
              <Card className="flex flex-col items-center px-8 py-12 text-center">
                <MagnifyingGlass className="size-5 text-muted-foreground" aria-hidden />
                <h2 className="mt-3 text-lg font-semibold">{t('nothingFound')}</h2>
                <p className="mt-1 text-[15px] text-muted-foreground">{t('nothingFoundHint')}</p>
              </Card>
            )}

            {filtered.length > 0 && (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border" aria-label={t('meetingsList')}>
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
              </Card>
            )}
          </div>
        </>
      )}
      <DeleteMeetingDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? displayTitle(toDelete.title) : undefined}
        onConfirm={remove}
      />
    </div>
  );
}

export default function Home() {
  const rec = useAidRecording();
  const showRecording = rec.isRecording || rec.phase !== null;

  return (
    <main className="h-screen flex-1 overflow-y-auto bg-background">
      {showRecording ? (
        <RecordingView
          isPaused={rec.isPaused}
          phase={rec.phase}
          duration={rec.duration}
          busy={rec.busy}
          live={rec.live}
          onStop={rec.stop}
          onTogglePause={rec.togglePause}
        />
      ) : (
        <HomeView
          onStart={() => void rec.start()}
          isStarting={rec.isStarting}
          blocker={rec.blocker}
          onDismissBlocker={rec.dismissBlocker}
          startError={rec.startError}
        />
      )}
    </main>
  );
}
