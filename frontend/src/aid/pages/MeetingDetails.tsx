// Экран «Встреча» в той же системе, что главная: крупный заголовок, под ним мета
// серым, транскрипт единым текстовым потоком без карточек. Итоги, если есть,
// стоят над транскриптом без рамки: их отделяет только заголовок «Итоги» 22 px
// и отступ; транскрипт после них подписан заголовком «Транскрипт».
// «Сделать итоги» в шапке, пока итогов нет. «Копировать» одним нажатием.
// Встреча без реплик показывает одно сообщение «Речь не распознана» с действиями.

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowClockwise,
  Check,
  ClipboardText,
  FolderOpen,
  MicrophoneSlash,
  Sparkle,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { BackButton } from '@/aid/components/BackButton';
import { isDiscarded } from '@/aid/lib/recording-marks';
import { Button } from '@/aid/components/ui/button';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { SectionHeading } from '@/aid/components/SectionHeading';
import { H1, H2, SUB } from '@/aid/lib/type';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { Page } from '@/aid/components/Page';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { copyToClipboard } from '@/aid/lib/clipboard';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { deleteMeeting, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { readStoredOutcome, takeStayPath } from '@/aid/lib/recording-outcome';
import {
  markdownToPlain,
  summaryForPage,
  transcriptAsText,
  useMeeting,
  type FriendlyError,
  type SummaryState,
} from '@/aid/lib/meeting';
import { checkReadyToRecord, type StartBlocker } from '@/aid/lib/recording';
import { aidToast } from '@/aid/lib/toasts';
import { editableTitle, formatDateTime, formatDuration, formatNumber, isAutoTitle, plural, shownTitle as titleForDisplay } from '@/aid/lib/format';
import { InlineRename } from '@/aid/components/InlineRename';
import { contentTitle, countWords, MIN_MEANINGFUL_WORDS } from '@/aid/lib/speech';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';

const WIDTH = 'max-w-[880px]'; // колонка текста реплик около 720 px

function BackLink() {
  return <BackButton label={t('back')} href="/" />;
}

function ErrorAlert({ title, error, onRetry }: { title: string; error: FriendlyError; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <Warning />
      <div>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onRetry && (
              <Button variant="outline" size="main" onClick={onRetry}>
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
function Title({ shown, editable, onRename }: { shown: string; editable: string; onRename: (next: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const begin = () => setEditing(true);

  if (editing) {
    return (
      <InlineRename
        initial={editable}
        onSave={async (next) => {
          try {
            await onRename(next);
          } catch (error) {
            aidToast.error(t('renameFailed'), { description: String(error) });
            throw error;
          }
        }}
        onClose={() => setEditing(false)}
        inputClassName="h-14 text-2xl font-bold"
      />
    );
  }

  // Карандаша нет: само название кликабельно. Наведение подсвечивает его подложкой
  // колодца, клик или Enter начинают переименование
  return (
    <h1 className={cn('min-w-0', H1)}>
      <button
        type="button"
        onClick={begin}
        title={t('renameHint')}
        aria-label={`${shown}. ${t('renameHint')}`}
        className="-mx-2 line-clamp-2 max-w-full cursor-text rounded-row px-2 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown}
      </button>
    </h1>
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
    <div className="py-2" role="status">
      <h2 className={cn('flex items-center gap-3', H2)}>
        <MicrophoneSlash className="size-6 text-muted-foreground" aria-hidden />
        {t('silentTitle')}
      </h2>
      <p className="mt-2 max-w-xl text-[15px] leading-6 text-muted-foreground">{cause ? CAUSE[cause] : t('loading')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {needModel ? (
          <Button asChild size="main">
            <Link href="/settings?tab=transcription">{t('downloadModel')}</Link>
          </Button>
        ) : (
          canRetranscribe && (
            <Button size="main" onClick={onRetranscribe}>
              <ArrowClockwise />
              {t('retranscribe')}
            </Button>
          )
        )}
        <Button variant="outline" size="main" onClick={onOpenFolder}>
          <FolderOpen />
          {t('openRecordingFolder')}
        </Button>
        <Button variant="ghost" size="main" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash />
          {t('delete')}
        </Button>
      </div>
    </div>
  );
}


/** Итоги над транскриптом без рамки: заголовок «Итоги» 22 px и отступ. Только когда они есть, готовятся или не получились. */
function SummaryBlock({
  summary,
  title,
  onRetry,
}: {
  summary: SummaryState;
  /** Название в шапке: заголовок итогов, который его повторяет, не показывается. */
  title: string;
  onRetry: () => void;
}) {
  if (summary.kind === 'processing') {
    return (
      <section aria-labelledby="summary-title" className="mb-10">
        <SectionHeading id="summary-title">{t('summary')}</SectionHeading>
        <div className="mt-3 flex items-center gap-3" role="status" aria-live="polite">
          <Spinner />
          <div className="min-w-0">
            <p className="text-[15px] font-medium">{t('summaryProcessing')}</p>
            <p className={SUB}>{t('summaryProcessingHint')}</p>
          </div>
        </div>
      </section>
    );
  }

  if (summary.kind === 'failed') {
    return (
      <section aria-labelledby="summary-title" className="mb-10">
        <SectionHeading id="summary-title">{t('summary')}</SectionHeading>
        <div className="mt-3">
          <ErrorAlert title={t('summaryFailed')} error={summary.error} onRetry={onRetry} />
        </div>
      </section>
    );
  }

  if (summary.kind !== 'ready') return null;

  return (
    <section className="mb-10" aria-labelledby="summary-title">
      <SectionHeading
        id="summary-title"
        action={
          <Button variant="ghost" className="h-10 px-3 text-muted-foreground hover:text-foreground" onClick={onRetry}>
            <ArrowClockwise />
            {t('summaryRedo')}
          </Button>
        }
      >
        {t('summary')}
      </SectionHeading>
      <article
        id="summary-body"
        className="prose prose-neutral mt-3 max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-[17px] prose-h3:text-[15px] prose-p:leading-7 prose-p:text-pretty prose-li:text-pretty prose-li:my-1 prose-table:text-sm prose-th:text-left prose-a:text-link"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryForPage(summary.markdown, title)}</ReactMarkdown>
      </article>
    </section>
  );
}

/** Копирование и экспорт в одном месте: транскрипт и итоги, текстом или Markdown. */
/**
 * «Копировать» одним нажатием, без меню: текстом итоги (если есть) и транскрипт
 * целиком. Отклик на самой кнопке: на 1,5 с она становится «Скопировано» с
 * галочкой, тост не нужен. То же по ⌘⇧C (Ctrl+Shift+C не на Mac) на странице встречи.
 */
function CopyButton({ disabled, getText }: { disabled: boolean; getText: () => Promise<string> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [hotkey, setHotkey] = useState('⌘⇧C');
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setHotkey('Ctrl+Shift+C');
  }, []);
  const run = useCallback(async () => {
    if (disabled) return;
    setState('busy');
    try {
      const ok = await copyToClipboard(await getText());
      if (!ok) throw new Error('copy');
      setState('done');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('idle');
      aidToast.error(t('copyFailed'));
    }
  }, [disabled, getText]);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.code !== 'KeyC') return;
      // Выделенный текст копируется как обычно, сочетание без выделения копирует всё
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      void runRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const button = (
    <Button
      variant="outline"
      size="main"
      disabled={disabled || state === 'busy'}
      onClick={() => void run()}
      aria-keyshortcuts="Meta+Shift+C Control+Shift+C"
      aria-label={disabled ? `${t('copy')}: ${t('nothingToCopy')}` : undefined}
      className="min-w-[180px]"
    >
      {state === 'busy' ? <Spinner tone="inherit" /> : state === 'done' ? <Check weight="bold" /> : <ClipboardText />}
      <span aria-live="polite">{state === 'done' ? t('copiedShort') : t('copy')}</span>
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{disabled ? t('nothingToCopy') : `${t('copyAllHint')} · ${hotkey}`}</TooltipContent>
    </Tooltip>
  );
}

function IconAction({ label, onClick, children, destructive }: { label: string; onClick: () => void; children: React.ReactNode; destructive?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-14 text-muted-foreground', destructive ? 'hover:text-destructive' : 'hover:text-foreground')}
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
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="mt-5 h-10 w-2/3 rounded-xl" />
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
  const segmentsLabel = useMemo(() => `${formatNumber(m.total)} ${plural(m.total, 'реплика', 'реплики', 'реплик')}`, [m.total]);

  // Запись тихо сохранена в «Не распознано»: оригинальный хук всё равно открыл её
  // страницу. Возвращаем пользователя туда, где он был (recording-outcome.tsx)
  const [stayPath] = useState(() => (params.get('source') === 'recording' && typeof window !== 'undefined' ? takeStayPath() : null));
  useEffect(() => {
    if (stayPath) router.replace(stayPath, { scroll: false });
  }, [stayPath, router]);

  // Оригинальная страница встречи по ?source=recording запускает итоги сама.
  // В Aid итоги делаются только по кнопке, поэтому метку убираем из адреса.
  useEffect(() => {
    if (!stayPath && meetingId && params.get('source')) router.replace(`/meeting-details?id=${encodeURIComponent(meetingId)}`, { scroll: false });
  }, [meetingId, params, router, stayPath]);

  useEffect(() => {
    if (shownTitle) document.title = `${shownTitle} · ${t('appName')}`;
    return () => {
      document.title = t('appName');
    };
  }, [shownTitle]);

  // Уходим обратно, страницу встречи не показываем даже на мгновение
  if (stayPath) return null;
  if (m.meeting.kind === 'loading') return <LoadingState />;

  if (m.meeting.kind === 'not-found') {
    return (
      <Page width={WIDTH} header={<BackLink />}>
        <h1 className={H1}>{t('meetingNotFound')}</h1>
        <p className={cn('mt-2 max-w-md', SUB)}>{t('meetingNotFoundHint')}</p>
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

  // Запись с пометкой «не сохранять» (решение после стопа) по прямому адресу не открывается
  if (isDiscarded(meta)) {
    return (
      <Page width={WIDTH} header={<BackLink />}>
        <h1 className={H1}>{t('notSavedTitle')}</h1>
        <p className={cn('mt-2 max-w-md', SUB)}>{t('notSavedHint')}</p>
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
  // Короткая запись (меньше 15 слов): итоги из неё не собрать, поэтому ни блока
  // итогов, ни «Сделать итоги», ни «Сделать заново»: модель заполнила бы разделы
  // заглушками «Ничего не отмечено»
  const tooShort = !m.hasMore && countWords(m.segments.map((x) => x.text).join(' ')) < MIN_MEANINGFUL_WORDS;
  const showSummary = !empty && !tooShort;
  // «Сделать итоги» в шапке, только пока итогов нет: ход генерации, ошибка
  // и «Сделать заново» показываются в блоке итогов над транскриптом
  const showGenerate = showSummary && m.summary.kind === 'empty';

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
            // 56 px, серая, как «Копировать»: на странице встречи главный транскрипт
            <Button variant="outline" size="main" onClick={() => void m.generateSummary()}>
              <Sparkle />
              {t('generateSummary')}
            </Button>
          )}
          <CopyButton
            disabled={empty}
            getText={async () => {
              const transcript = transcriptAsText(await m.loadAll());
              const summaryText = showSummary && summaryReady ? markdownToPlain(summaryForPage(summaryReady, shownTitle)) : null;
              return summaryText ? `${shownTitle}\n\n${t('summary')}\n${summaryText}\n\n${t('transcript')}\n${transcript}` : transcript;
            }}
          />
          <IconAction label={t('openRecordingFolder')} onClick={openFolder}>
            <FolderOpen />
          </IconAction>
          <IconAction label={t('deleteMeeting')} onClick={() => setConfirmDelete(true)} destructive>
            <Trash />
          </IconAction>
        </div>
      </div>
      <div className="mt-4 min-w-0">
        <Title shown={shownTitle} editable={editableTitle(meta.title, fromContent)} onRename={rename} />
        <p className={cn('mt-2', SUB)}>{facts}</p>
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
          {showSummary && <SummaryBlock summary={m.summary} title={shownTitle} onRetry={() => void m.generateSummary()} />}
          {/* Транскрипт единым потоком прямо на плитке: время на одной линии с названием
              и кнопкой «Назад» (16 px от края плитки). Заголовок только после блока итогов */}
          <section aria-label={t('transcript')} className="pt-1">
            {showSummary && m.summary.kind !== 'empty' && <SectionHeading className="mb-3">{t('transcript')}</SectionHeading>}
            <TranscriptList segments={m.segments} />
            {m.hasMore && (
              <div className="flex justify-center pt-6">
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
