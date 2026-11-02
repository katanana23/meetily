// Главная: список встреч и запуск записи. Во время записи на этом же месте
// показывается экран записи, чтобы хуки записи не размонтировались.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, ChevronRight, FileAudio, Loader2, Mic, RotateCw, Search } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { RecordingView } from '@/aid/pages/Recording';
import { useAidRecording } from '@/aid/lib/recording';
import { friendlyError, type FriendlyError } from '@/aid/lib/meeting';
import { formatShortDate } from '@/aid/lib/format';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useConfig } from '@/contexts/ConfigContext';

interface MeetingRow {
  id: string;
  title: string;
  created_at?: string;
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; error: FriendlyError }
  | { kind: 'ready'; meetings: MeetingRow[] };

function useMeetingsList(refreshKey: unknown) {
  const [state, setState] = useState<ListState>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const list = await invoke<Array<{ id: string; title: string }>>('api_get_meetings');
      // Дату ядро отдаёт только в метаданных встречи
      const metas = await Promise.allSettled(
        list.map((m) => invoke<{ created_at?: string }>('api_get_meeting_metadata', { meetingId: m.id })),
      );
      setState({
        kind: 'ready',
        meetings: list.map((m, i) => {
          const meta = metas[i];
          return { ...m, created_at: meta.status === 'fulfilled' ? meta.value?.created_at : undefined };
        }),
      });
    } catch (error) {
      setState({ kind: 'error', error: friendlyError(error, 'Проверьте, что приложение запущено, и попробуйте ещё раз.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { state, reload: load };
}

function HomeView({ onStart, isStarting }: { onStart: () => void; isStarting: boolean }) {
  const { meetings: sidebarMeetings } = useSidebar();
  const { state, reload } = useMeetingsList(sidebarMeetings);
  const { openImportDialog } = useImportDialog();
  const { betaFeatures } = useConfig();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return q ? state.meetings.filter((m) => m.title.toLowerCase().includes(q)) : state.meetings;
  }, [state, query]);

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('homeTitle')}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{t('homeSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {betaFeatures.importAndRetranscribe && (
            <Button variant="outline" size="xl" onClick={() => openImportDialog()}>
              <FileAudio />
              {t('importAudio')}
            </Button>
          )}
          <Button size="xl" onClick={onStart} disabled={isStarting}>
            {isStarting ? <Loader2 className="animate-spin" /> : <Mic />}
            {t('startRecording')}
          </Button>
        </div>
      </header>

      {state.kind === 'error' ? (
        <Alert variant="destructive" className="mt-8">
          <AlertCircle />
          <div>
            <AlertTitle>{t('meetingsError')}</AlertTitle>
            <AlertDescription>
              <p>{state.error.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => void reload()}>
                  <RotateCw />
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
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
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
              <Card className="divide-y divide-border overflow-hidden" aria-busy="true" aria-label={t('loading')}>
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
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Mic className="size-6" />
                </div>
                <h2 className="mt-5 text-xl font-semibold">{t('noMeetings')}</h2>
                <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">{t('noMeetingsHint')}</p>
              </Card>
            )}

            {state.kind === 'ready' && state.meetings.length > 0 && filtered.length === 0 && (
              <Card className="px-8 py-12 text-center">
                <h2 className="text-lg font-semibold">{t('nothingFound')}</h2>
                <p className="mt-1 text-[15px] text-muted-foreground">{t('nothingFoundHint')}</p>
              </Card>
            )}

            {filtered.length > 0 && (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {filtered.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/meeting-details?id=${encodeURIComponent(m.id)}`}
                        className="group flex min-h-[72px] items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{m.title}</p>
                          {m.created_at && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{formatShortDate(m.created_at)}</p>
                          )}
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const rec = useAidRecording();
  const showRecording = rec.isRecording || rec.isFinishing;

  return (
    <main className="h-screen flex-1 overflow-y-auto bg-background">
      {showRecording ? (
        <RecordingView
          isPaused={rec.isPaused}
          isFinishing={rec.isFinishing}
          duration={rec.duration}
          busy={rec.busy}
          onStop={rec.stop}
          onTogglePause={rec.togglePause}
        />
      ) : (
        <HomeView onStart={() => void rec.start()} isStarting={rec.isStarting} />
      )}
    </main>
  );
}
