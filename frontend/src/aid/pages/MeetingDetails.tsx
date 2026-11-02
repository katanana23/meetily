// Экран «Встреча»: название (переименование), дата, длительность и число реплик,
// вкладки «Итоги» и «Транскрипт» с копированием в текст и Markdown,
// состояния загрузки, пустых итогов и ошибки. Пустой транскрипт не прячется:
// встреча с записью без реплик показывает вероятную причину и что сделать.

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle, ArrowLeft, Check, FolderOpen, Loader2, Pencil, RotateCw, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/aid/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { CopyActions } from '@/aid/components/CopyActions';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { TranscriptList } from '@/aid/components/TranscriptList';
import {
  markdownToPlain,
  transcriptAsMarkdown,
  transcriptAsText,
  useMeeting,
  type FriendlyError,
  type SummaryState,
} from '@/aid/lib/meeting';
import { checkReadyToRecord, type StartBlocker } from '@/aid/lib/recording';
import { aidToast } from '@/aid/lib/toasts';
import { displayTitle, formatDateTime, formatDuration, isAutoTitle, plural } from '@/aid/lib/format';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';
import Analytics from '@/lib/analytics';

function BackLink() {
  return (
    <Button variant="ghost" asChild className="-ml-3 text-muted-foreground hover:text-foreground">
      <Link href="/">
        <ArrowLeft />
        {t('back')}
      </Link>
    </Button>
  );
}

function ErrorAlert({ title, error, onRetry }: { title: string; error: FriendlyError; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <div>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <RotateCw />
                {t('retry')}
              </Button>
            )}
            <ErrorDetails raw={error.raw} />
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
}

/** Панель действий над содержимым вкладки. Заголовка нет: его роль играет вкладка. */
function Toolbar({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
      <p className="text-sm text-muted-foreground">{note}</p>
      {children}
    </div>
  );
}

function SummaryPanel({
  title,
  summary,
  empty,
  onGenerate,
}: {
  title: string;
  summary: SummaryState;
  empty: boolean;
  onGenerate: () => void;
}) {
  if (empty && summary.kind !== 'ready') {
    // В транскрипте нет текста: итогам не из чего собраться
    return (
      <Card className="p-8">
        <h2 className="text-lg font-semibold">{t('noSummaryEmpty')}</h2>
        <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">{t('noSummaryEmptyHint')}</p>
      </Card>
    );
  }

  if (summary.kind === 'loading') {
    return (
      <Card className="space-y-4 p-6" role="status" aria-busy="true" aria-label={t('loading')}>
        <Skeleton className="h-6 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
      </Card>
    );
  }

  if (summary.kind === 'processing') {
    return (
      <Card className="p-8" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">{t('summaryProcessing')}</h2>
        </div>
        <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">{t('summaryProcessingHint')}</p>
      </Card>
    );
  }

  if (summary.kind === 'failed') {
    return (
      <div className="space-y-4">
        <ErrorAlert title={t('summaryFailed')} error={summary.error} />
        <Button size="lg" onClick={onGenerate}>
          <Sparkles />
          {t('regenerateSummary')}
        </Button>
      </div>
    );
  }

  if (summary.kind === 'empty') {
    return (
      <Card className="p-8">
        <h2 className="text-lg font-semibold">{t('noSummary')}</h2>
        <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">{t('noSummaryHint')}</p>
        <Button size="lg" className="mt-6" onClick={onGenerate}>
          <Sparkles />
          {t('generateSummary')}
        </Button>
      </Card>
    );
  }

  const markdown = summary.markdown;
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <CopyActions
          subject="итоги"
          getText={() => markdownToPlain(markdown)}
          getMarkdown={() => (/^#\s/.test(markdown) ? markdown : `# ${title}\n\n${markdown}`)}
        />
      </Toolbar>
      <article className="prose prose-neutral max-w-none px-6 py-6 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base prose-p:leading-7 prose-li:my-1 prose-table:text-sm prose-th:text-left">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </Card>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-busy="true" aria-label={t('loading')}>
      <Skeleton className="h-11 w-44 rounded-2xl" />
      <Skeleton className="mt-6 h-9 w-2/3 rounded-xl" />
      <Skeleton className="mt-4 h-5 w-48 rounded-lg" />
      <Skeleton className="mt-10 h-12 w-64 rounded-2xl" />
      <Card className="mt-6 space-y-4 p-6">
        <Skeleton className="h-6 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
      </Card>
    </div>
  );
}

/** Название встречи с переименованием на месте. В базе хранится то, что ввёл человек. */
function Title({ title, onRename }: { title: string; onRename: (next: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = displayTitle(title);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    // автоматическое название предлагаем в человеческом виде
    setValue(shown);
    setEditing(true);
  };

  const save = async () => {
    const next = value.trim();
    if (!next) {
      aidToast.error(t('titleEmpty'));
      return;
    }
    if (next === shown || next === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(next);
      setEditing(false);
    } catch (error) {
      aidToast.error(t('renameFailed'), { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          aria-label={t('meetingTitle')}
          className="h-12 min-w-0 flex-1 text-xl font-semibold"
          maxLength={200}
          disabled={saving}
        />
        <Button type="submit" size="icon" aria-label={t('save')} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t('cancel')} onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-1">
      <h1 className="min-w-0 text-3xl font-semibold leading-tight tracking-tight">{shown}</h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={begin} aria-label={t('rename')}>
            <Pencil />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('rename')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function DeleteDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogTitle>{t('deleteTitle')}</DialogTitle>
        <DialogDescription>{t('deleteHint')}</DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CAUSE: Record<StartBlocker['kind'] | 'silence', string> = {
  'no-model': t('silentNoModel'),
  'model-downloading': t('silentNoModel'),
  'no-microphone': t('silentNoMic'),
  'check-failed': t('silentUnknown'),
  silence: t('silentUnknown'),
};

/**
 * Запись есть, реплик нет. Звук может быть ценен (не было модели или доступа),
 * поэтому ничего не удаляем: объясняем вероятную причину и даём действия.
 */
function SilentRecording({
  canRetranscribe,
  onRetranscribe,
  onOpenFolder,
  onDelete,
}: {
  canRetranscribe: boolean;
  onRetranscribe: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}) {
  const { checkPermissions } = usePermissionCheck();
  const [cause, setCause] = useState<StartBlocker['kind'] | 'silence' | null>(null);

  useEffect(() => {
    let alive = true;
    void checkReadyToRecord(checkPermissions).then((b) => alive && setCause(b?.kind ?? 'silence'));
    return () => {
      alive = false;
    };
    // checkPermissions из оригинального хука меняется на каждом рендере
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needModel = cause === 'no-model' || cause === 'model-downloading';

  return (
    <Card className="mt-8 p-6" role="status">
      <h2 className="text-lg font-semibold">{t('silentTitle')}</h2>
      <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{cause ? CAUSE[cause] : t('loading')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {needModel ? (
          <Button asChild>
            <Link href="/settings?tab=transcription">{t('downloadModel')}</Link>
          </Button>
        ) : (
          canRetranscribe && (
            <Button onClick={onRetranscribe}>
              <RotateCw />
              {t('retranscribe')}
            </Button>
          )
        )}
        <Button variant="outline" onClick={onOpenFolder}>
          <FolderOpen />
          {t('openRecordingFolder')}
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 />
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}

function MeetingDetailsContent() {
  const meetingId = useSearchParams().get('id');
  const router = useRouter();
  const m = useMeeting(meetingId);
  const { meetings, setMeetings, refetchMeetings } = useSidebar();
  const { betaFeatures } = useConfig();
  const [tab, setTab] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retranscribe, setRetranscribe] = useState(false);

  const meta = m.meeting.kind === 'ready' ? m.meeting.meta : null;
  const shownTitle = meta ? displayTitle(meta.title) : '';
  const segmentsLabel = useMemo(() => `${m.total} ${plural(m.total, 'реплика', 'реплики', 'реплик')}`, [m.total]);

  useEffect(() => {
    if (shownTitle) document.title = `${shownTitle} · ${t('appName')}`;
    return () => {
      document.title = t('appName');
    };
  }, [shownTitle]);

  if (m.meeting.kind === 'loading') return <LoadingState />;

  if (m.meeting.kind === 'not-found') {
    return (
      <>
        <BackLink />
        <Card className="mt-6 px-8 py-14 text-center">
          <h1 className="text-2xl font-semibold">{t('meetingNotFound')}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{t('meetingNotFoundHint')}</p>
        </Card>
      </>
    );
  }

  if (m.meeting.kind === 'error' || !meta) {
    return (
      <>
        <BackLink />
        <div className="mt-6">
          {m.meeting.kind === 'error' && (
            <ErrorAlert title={t('meetingError')} error={m.meeting.error} onRetry={() => void m.retry()} />
          )}
        </div>
      </>
    );
  }

  const empty = m.total === 0;
  // Для автоматического названия дата уже в заголовке: не повторяем её
  const date = isAutoTitle(meta.title) ? null : formatDateTime(meta.created_at);
  const duration = formatDuration(m.duration);
  const facts = [date, duration, segmentsLabel].filter(Boolean).join(' · ');
  const canRetranscribe = Boolean(betaFeatures.importAndRetranscribe && meta.folder_path);
  const activeTab = tab ?? 'summary';

  const rename = async (title: string) => {
    await m.rename(title);
    setMeetings(meetings.map((x) => (x.id === meta.id ? { ...x, title } : x)));
    aidToast.success(t('renamed'));
  };

  const remove = async () => {
    try {
      await m.remove();
      void Analytics.trackMeetingDeleted(meta.id);
      await refetchMeetings();
      setConfirmDelete(false);
      aidToast.success(t('deleted'), { description: t('deletedHint') });
      router.push('/');
    } catch (error) {
      aidToast.error(t('deleteFailed'), { description: String(error) });
    }
  };

  const openFolder = () =>
    void m.openFolder().catch((error) => aidToast.error(t('openFolderFailed'), { description: String(error) }));

  return (
    <>
      <BackLink />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Title title={meta.title} onRename={rename} />
          <p className="mt-2 text-sm text-muted-foreground">{facts}</p>
        </div>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={openFolder} aria-label={t('openRecordingFolder')}>
                <FolderOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('openRecordingFolder')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('deleteMeeting')}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('deleteMeeting')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {empty && (
        <SilentRecording
          canRetranscribe={canRetranscribe}
          onRetranscribe={() => setRetranscribe(true)}
          onOpenFolder={openFolder}
          onDelete={() => setConfirmDelete(true)}
        />
      )}

      <Tabs value={activeTab} onValueChange={setTab} className="mt-8">
        <TabsList aria-label={t('meetingSections')}>
          <TabsTrigger value="summary">{t('summary')}</TabsTrigger>
          <TabsTrigger value="transcript">{t('transcript')}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummaryPanel title={shownTitle} summary={m.summary} empty={empty} onGenerate={() => void m.generateSummary()} />
        </TabsContent>

        <TabsContent value="transcript">
          <Card className="overflow-hidden">
            <Toolbar note={empty ? t('nothingToCopy') : undefined}>
              <CopyActions
                subject="транскрипт"
                disabled={empty}
                getText={async () => transcriptAsText(await m.loadAll())}
                getMarkdown={async () => transcriptAsMarkdown(shownTitle, await m.loadAll())}
              />
            </Toolbar>
            {empty ? (
              <p className="px-6 py-12 text-center text-[15px] text-muted-foreground">{t('emptyTranscript')}</p>
            ) : (
              <div className="px-2 py-3">
                <TranscriptList segments={m.segments} />
                {m.hasMore && (
                  <div className="flex justify-center px-4 pb-3 pt-4">
                    <Button variant="outline" onClick={() => void m.loadMore()} disabled={m.loadingMore}>
                      {m.loadingMore && <Loader2 className="animate-spin" />}
                      {t('loadMore')} ({m.segments.length} из {m.total})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <DeleteDialog open={confirmDelete} onOpenChange={setConfirmDelete} onConfirm={remove} />
      {canRetranscribe && (
        <RetranscribeDialog
          open={retranscribe}
          onOpenChange={setRetranscribe}
          meetingId={meta.id}
          meetingFolderPath={meta.folder_path ?? null}
          onComplete={() => void m.retry()}
        />
      )}
    </>
  );
}

export default function MeetingDetails() {
  return (
    <main className="h-screen flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[880px] px-8 pb-16 pt-6">
        <Suspense fallback={<LoadingState />}>
          <MeetingDetailsContent />
        </Suspense>
      </div>
    </main>
  );
}
