// Экран «Встреча»: главное здесь транскрипт, он открыт сразу.
// Итоги вторичны: кнопка «Сделать итоги» в шапке, а готовые итоги показываются
// сворачиваемым блоком над транскриптом. Пока итогов нет, блоков про них нет.
// Копирование текста и Markdown собрано в одном меню «Копировать».
// Встреча без реплик показывает одно сообщение «Речь не распознана» с действиями.

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowClockwise,
  ArrowLeft,
  CaretDown,
  Check,
  Copy,
  FileMd,
  FolderOpen,
  MicrophoneSlash,
  PencilSimple,
  Sparkle,
  TextAlignLeft,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Input } from '@/aid/components/ui/input';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/aid/components/ui/dropdown-menu';
import { Page } from '@/aid/components/Page';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { copyToClipboard } from '@/aid/lib/clipboard';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { deleteMeeting, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { readStoredOutcome } from '@/aid/lib/recording-outcome';
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
import { formatDateTime, formatDuration, isAutoTitle, plural, shownTitle as titleForDisplay } from '@/aid/lib/format';
import { contentTitle } from '@/aid/lib/speech';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';

const WIDTH = 'max-w-[840px]'; // колонка текста реплик около 700 px

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
      <WarningCircle />
      <div>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <ArrowClockwise />
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

/** Название встречи с переименованием на месте. В базе хранится то, что ввёл человек. */
function Title({ title, shown, onRename }: { title: string; shown: string; onRename: (next: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
          {saving ? <Spinner tone="inherit" /> : <Check />}
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t('cancel')} onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-1">
      <h1 className="line-clamp-2 min-w-0 text-2xl font-semibold leading-tight tracking-tight" title={shown}>
        {shown}
      </h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={begin} aria-label={t('rename')}>
            <PencilSimple />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('rename')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

type Cause = StartBlocker['kind'] | 'silence' | 'heard-no-text';

const CAUSE: Record<Cause, string> = {
  'no-model': t('silentNoModel'),
  'model-downloading': t('silentNoModel'),
  'no-microphone': t('silentNoMic'),
  'check-failed': t('silentUnknown'),
  silence: t('silentUnknown'),
  'heard-no-text': t('silentHeard'),
};

/**
 * Запись есть, реплик нет. Звук может быть ценен (не было модели или доступа),
 * поэтому ничего не удаляем: объясняем вероятную причину и даём действия.
 */
function SilentRecording({
  folder,
  canRetranscribe,
  onRetranscribe,
  onOpenFolder,
  onDelete,
}: {
  folder: string | null;
  canRetranscribe: boolean;
  onRetranscribe: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}) {
  const { checkPermissions } = usePermissionCheck();
  const [cause, setCause] = useState<Cause | null>(null);

  useEffect(() => {
    let alive = true;
    // Свежая запись: Aid знает, что детектор речи слышал голос, а текста не было
    const outcome = readStoredOutcome(folder);
    void checkReadyToRecord(checkPermissions).then((b) => {
      if (!alive) return;
      if (b) setCause(b.kind);
      else setCause(outcome?.verdict === 'unrecognized' && outcome.vadSegments > 0 ? 'heard-no-text' : 'silence');
    });
    return () => {
      alive = false;
    };
    // checkPermissions из оригинального хука меняется на каждом рендере
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needModel = cause === 'no-model' || cause === 'model-downloading';

  return (
    <Card className="p-6" role="status">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MicrophoneSlash className="size-5 text-destructive" aria-hidden />
        {t('silentTitle')}
      </h2>
      <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{cause ? CAUSE[cause] : t('loading')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {needModel ? (
          <Button asChild>
            <Link href="/settings?tab=transcription">{t('downloadModel')}</Link>
          </Button>
        ) : (
          canRetranscribe && (
            <Button onClick={onRetranscribe}>
              <ArrowClockwise />
              {t('retranscribe')}
            </Button>
          )
        )}
        <Button variant="outline" onClick={onOpenFolder}>
          <FolderOpen />
          {t('openRecordingFolder')}
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash />
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}


/** Итоги над транскриптом: только когда они есть, готовятся или не получились. */
function SummaryBlock({
  summary,
  onRetry,
}: {
  summary: SummaryState;
  onRetry: () => void;
}) {
  // Свёрнуты по умолчанию: главное на странице транскрипт. Раскрываются сами,
  // когда итоги только что сделаны на этой странице.
  const [open, setOpen] = useState(false);
  const wasProcessing = useRef(false);
  useEffect(() => {
    if (summary.kind === 'processing') wasProcessing.current = true;
    else if (summary.kind === 'ready' && wasProcessing.current) {
      wasProcessing.current = false;
      setOpen(true);
    }
  }, [summary.kind]);

  if (summary.kind === 'processing') {
    return (
      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4" role="status" aria-live="polite">
        <Spinner />
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('summaryProcessing')}</p>
          <p className="text-sm text-muted-foreground">{t('summaryProcessingHint')}</p>
        </div>
      </div>
    );
  }

  if (summary.kind === 'failed') {
    return (
      <div className="mb-8">
        <ErrorAlert title={t('summaryFailed')} error={summary.error} onRetry={onRetry} />
      </div>
    );
  }

  if (summary.kind !== 'ready') return null;

  return (
    <section className="mb-8 rounded-3xl border border-border bg-card" aria-labelledby="summary-title">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="summary-body"
          className="flex h-11 flex-1 items-center gap-3 rounded-2xl px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkle className="size-5 text-primary" aria-hidden />
          <span id="summary-title" className="text-base font-semibold">
            {t('summary')}
          </span>
          {/* Вниз, когда свёрнуто, вверх, когда раскрыто: залитый треугольник вправо читается как «воспроизвести» */}
          <CaretDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="sr-only">{open ? t('collapse') : t('expand')}</span>
        </button>
        <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={onRetry}>
          <ArrowClockwise />
          {t('summaryRedo')}
        </Button>
      </div>
      {open && (
        <article
          id="summary-body"
          className="prose prose-neutral max-w-none border-t border-border px-6 pb-6 pt-5 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-base prose-h3:text-[15px] prose-p:leading-7 prose-li:my-1 prose-table:text-sm prose-th:text-left"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.markdown}</ReactMarkdown>
        </article>
      )}
    </section>
  );
}

/** Копирование и экспорт в одном месте: транскрипт и итоги, текстом или Markdown. */
function CopyMenu({
  disabled,
  getTranscriptText,
  getTranscriptMarkdown,
  summary,
  title,
}: {
  disabled: boolean;
  getTranscriptText: () => Promise<string>;
  getTranscriptMarkdown: () => Promise<string>;
  summary: string | null;
  title: string;
}) {
  const run = async (get: () => string | Promise<string>) => {
    try {
      const ok = await copyToClipboard(await get());
      if (ok) aidToast.success(t('copied'));
      else aidToast.error(t('copyFailed'));
    } catch {
      aidToast.error(t('copyFailed'));
    }
  };

  const trigger = (
    <Button variant="outline" disabled={disabled} aria-label={disabled ? `${t('copy')}: ${t('nothingToCopy')}` : undefined}>
      <Copy />
      {t('copy')}
      <CaretDown className="!size-4 text-muted-foreground" aria-hidden />
    </Button>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {trigger}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('nothingToCopy')}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('transcript')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void run(getTranscriptText)}>
          <TextAlignLeft />
          {t('copyAsText')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run(getTranscriptMarkdown)}>
          <FileMd />
          {t('copyAsMarkdown')}
        </DropdownMenuItem>
        {summary && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('summary')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void run(() => markdownToPlain(summary))}>
              <TextAlignLeft />
              {t('copyAsText')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void run(() => (/^#\s/.test(summary) ? summary : `# ${title}\n\n${summary}`))}>
              <FileMd />
              {t('copyAsMarkdown')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconAction({ label, onClick, children, destructive }: { label: string; onClick: () => void; children: React.ReactNode; destructive?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground', destructive ? 'hover:text-destructive' : 'hover:text-foreground')}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function LoadingState() {
  return (
    <Page
      width={WIDTH}
      header={
        <div role="status" aria-busy="true" aria-label={t('loading')}>
          <Skeleton className="h-11 w-44 rounded-2xl" />
          <Skeleton className="mt-4 h-9 w-2/3 rounded-xl" />
          <Skeleton className="mt-3 h-5 w-48 rounded-lg" />
        </div>
      }
    >
      <div className="space-y-5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-x-4">
            <Skeleton className="ml-auto h-4 w-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

function MeetingDetailsContent() {
  const params = useSearchParams();
  const meetingId = params.get('id');
  const router = useRouter();
  const m = useMeeting(meetingId);
  const { meetings, setMeetings, refetchMeetings } = useSidebar();
  const { betaFeatures } = useConfig();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retranscribe, setRetranscribe] = useState(false);

  const meta = m.meeting.kind === 'ready' ? m.meeting.meta : null;
  // Автоматическое название показываем началом первой осмысленной реплики
  const fromContent = useMemo(() => contentTitle(m.segments.map((x) => x.text)), [m.segments]);
  const shownTitle = meta ? titleForDisplay(meta.title, fromContent) : '';
  const segmentsLabel = useMemo(() => `${m.total} ${plural(m.total, 'реплика', 'реплики', 'реплик')}`, [m.total]);

  // Оригинальная страница встречи по ?source=recording запускает итоги сама.
  // В Aid итоги делаются только по кнопке, поэтому метку убираем из адреса.
  useEffect(() => {
    if (meetingId && params.get('source')) router.replace(`/meeting-details?id=${encodeURIComponent(meetingId)}`, { scroll: false });
  }, [meetingId, params, router]);

  useEffect(() => {
    if (shownTitle) document.title = `${shownTitle} · ${t('appName')}`;
    return () => {
      document.title = t('appName');
    };
  }, [shownTitle]);

  if (m.meeting.kind === 'loading') return <LoadingState />;

  if (m.meeting.kind === 'not-found') {
    return (
      <Page width={WIDTH} header={<BackLink />}>
        <Card className="px-8 py-14 text-center">
          <h1 className="text-2xl font-semibold">{t('meetingNotFound')}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{t('meetingNotFoundHint')}</p>
        </Card>
      </Page>
    );
  }

  if (m.meeting.kind === 'error' || !meta) {
    return (
      <Page width={WIDTH} header={<BackLink />}>
        {m.meeting.kind === 'error' && <ErrorAlert title={t('meetingError')} error={m.meeting.error} onRetry={() => void m.retry()} />}
      </Page>
    );
  }

  const empty = m.total === 0;
  // Дата не повторяется, если название и так «Встреча 3 ноября, 11:37»
  const date = isAutoTitle(meta.title) && !fromContent ? null : formatDateTime(meta.created_at);
  const duration = formatDuration(m.duration);
  const facts = [date, duration, segmentsLabel].filter(Boolean).join(' · ');
  const canRetranscribe = Boolean(betaFeatures.importAndRetranscribe && meta.folder_path);
  const summaryReady = m.summary.kind === 'ready' ? m.summary.markdown : null;
  // «Сделать итоги» в шапке, только пока итогов нет: ход генерации, ошибка
  // и «Сделать заново» показываются в блоке итогов над транскриптом
  const showGenerate = !empty && m.summary.kind === 'empty';

  const rename = async (title: string) => {
    await renameMeeting(meta.id, title);
    m.setTitle(title);
    setMeetings(meetings.map((x) => (x.id === meta.id ? { ...x, title } : x)));
    aidToast.success(t('renamed'));
  };

  const remove = async () => {
    try {
      await deleteMeeting(meta.id);
      await refetchMeetings();
      setConfirmDelete(false);
      aidToast.success(t('deleted'), { description: t('deletedHint') });
      router.push('/');
    } catch (error) {
      aidToast.error(t('deleteFailed'), { description: String(error) });
    }
  };

  const openFolder = () =>
    void openMeetingFolder(meta.id).catch((error) => aidToast.error(t('openFolderFailed'), { description: String(error) }));

  const header = (
    <>
      {/* Действия в одной строке с «Ко всем встречам», чтобы название занимало всю ширину */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          {showGenerate && (
            <Button variant="outline" onClick={() => void m.generateSummary()}>
              <Sparkle className="text-primary" />
              {t('generateSummary')}
            </Button>
          )}
          <CopyMenu
            disabled={empty}
            title={shownTitle}
            summary={summaryReady}
            getTranscriptText={async () => transcriptAsText(await m.loadAll())}
            getTranscriptMarkdown={async () => transcriptAsMarkdown(shownTitle, await m.loadAll())}
          />
          <IconAction label={t('openRecordingFolder')} onClick={openFolder}>
            <FolderOpen />
          </IconAction>
          <IconAction label={t('deleteMeeting')} onClick={() => setConfirmDelete(true)} destructive>
            <Trash />
          </IconAction>
        </div>
      </div>
      <div className="mt-3 min-w-0">
        <Title title={meta.title} shown={shownTitle} onRename={rename} />
        <p className="mt-1 text-sm text-muted-foreground">{facts}</p>
      </div>
    </>
  );

  return (
    <Page width={WIDTH} header={header}>
      {empty ? (
        <SilentRecording
          folder={meta.folder_path ?? null}
          canRetranscribe={canRetranscribe}
          onRetranscribe={() => setRetranscribe(true)}
          onOpenFolder={openFolder}
          onDelete={() => setConfirmDelete(true)}
        />
      ) : (
        <>
          <SummaryBlock summary={m.summary} onRetry={() => void m.generateSummary()} />
          <section aria-label={t('transcript')}>
            <TranscriptList segments={m.segments} />
            {m.hasMore && (
              <div className="flex justify-center pt-8">
                <Button variant="outline" onClick={() => void m.loadMore()} disabled={m.loadingMore}>
                  {m.loadingMore && <Spinner tone="inherit" />}
                  {t('loadMore')} ({m.segments.length} из {m.total})
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      <DeleteMeetingDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={shownTitle} onConfirm={remove} />
      {canRetranscribe && (
        <RetranscribeDialog
          open={retranscribe}
          onOpenChange={setRetranscribe}
          meetingId={meta.id}
          meetingFolderPath={meta.folder_path ?? null}
          onComplete={() => void m.retry()}
        />
      )}
    </Page>
  );
}

export default function MeetingDetails() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MeetingDetailsContent />
    </Suspense>
  );
}
