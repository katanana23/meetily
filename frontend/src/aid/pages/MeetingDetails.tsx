// Экран «Встреча» в бенто: плитка-шапка (название, мета, действия таблетками),
// ниже плитки. Главное транскрипт, он открыт сразу одним текстовым потоком.
// Итоги вторичны: кнопка Indigo «Сделать итоги» в шапке, готовые итоги отдельной
// плиткой Indigo, свёрнутой в полосу-заголовок, пока её не раскроют.
// Встреча без реплик показывает плитку Giants «Речь не распознана» с действиями.

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  Check,
  CaretDown,
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
import { isTrashed, loadTrash, onTrashChange, restoreMeeting } from '@/aid/lib/meeting-trash';
import { Button } from '@/aid/components/ui/button';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { Page, TILE } from '@/aid/components/Page';
import { DeleteMeetingDialog } from '@/aid/components/DeleteMeetingDialog';
import { copyToClipboard } from '@/aid/lib/clipboard';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { TranscriptList } from '@/aid/components/TranscriptList';
import { deleteMeeting, toastTrashed, openMeetingFolder, renameMeeting } from '@/aid/lib/meeting-actions';
import { readStoredOutcome } from '@/aid/lib/recording-outcome';
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
import { editableTitle, formatDateTime, formatDuration, formatNumber, isAutoTitle, shownTitle as titleForDisplay } from '@/aid/lib/format';
import { InlineRename } from '@/aid/components/InlineRename';
import { countWords, isShownText, MIN_SUMMARY_WORDS } from '@/aid/lib/speech';
import { useRecordingControls } from '@/aid/lib/recording-controls';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { RetranscribeDialog } from '@/components/MeetingDetails/RetranscribeDialog';

// Колонка текста: строки реплик не длиннее 760 px, дальше читать тяжело
const MEASURE = 'max-w-[760px]';

// Кнопки на цветной плитке роли: главная тёмная таблетка (#111, белый текст),
// вторичные полупрозрачным затемнением, текст #111
const ON_ROLE_MAIN = 'bg-on-role text-white hover:bg-on-role/90';
const ON_ROLE_SOFT = 'bg-black/10 text-on-role hover:bg-black/15';

function BackLink() {
  return <BackButton label={t('back')} href="/" />;
}

function ErrorAlert({ title, error, onRetry }: { title: string; error: FriendlyError; onRetry?: () => void }) {
  return (
    // В колонке плиток ошибка тоже плитка
    <Alert variant="destructive" className="rounded-tile bg-card p-5 [&>svg]:left-5 [&>svg]:top-5">
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
    <h1 className="min-w-0 text-[36px] font-bold leading-10 tracking-tight">
      <button
        type="button"
        onClick={begin}
        title={t('renameHint')}
        aria-label={`${shown}. ${t('renameHint')}`}
        className="-mx-2 line-clamp-2 max-w-full cursor-text rounded-nested px-2 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  'mic-denied': t('silentNoMic'),
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
    // Плитка Giants: роль «Не распознано и предупреждения», текст #111 (6,1:1)
    <section className="aid-role aid-role-giants rounded-tile p-5" role="status" aria-labelledby="silent-title">
      <span className="flex size-12 items-center justify-center rounded-full bg-black/10" aria-hidden>
        <MicrophoneSlash className="size-5" />
      </span>
      <h2 id="silent-title" className="mt-4 text-[22px] font-bold leading-7 tracking-tight">
        {t('silentTitle')}
      </h2>
      <p className="mt-1 max-w-xl text-[15px] text-muted-foreground">{cause ? CAUSE[cause] : t('loading')}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {needModel ? (
          <Button asChild size="main" className={ON_ROLE_MAIN}>
            <Link href="/settings?tab=transcription">{t('downloadModel')}</Link>
          </Button>
        ) : (
          canRetranscribe && (
            <Button size="main" className={ON_ROLE_MAIN} onClick={onRetranscribe}>
              <ArrowClockwise />
              {t('retranscribe')}
            </Button>
          )
        )}
        <Button variant="ghost" size="main" className={ON_ROLE_SOFT} onClick={onOpenFolder}>
          <FolderOpen />
          {t('openRecordingFolder')}
        </Button>
        <Button variant="ghost" size="main" className={ON_ROLE_SOFT} onClick={onDelete}>
          <Trash />
          {t('delete')}
        </Button>
      </div>
    </section>
  );
}


/** Итоги над транскриптом: только когда они есть, готовятся или не получились. */
function SummaryBlock({
  summary,
  title,
  onRetry,
}: {
  summary: SummaryState;
  /** Название в шапке: заголовок итогов, который его повторяет, не показывается. */
  title: string;
  /** Нет у короткой встречи и во время записи: «Сделать заново» не показывается. */
  onRetry?: () => void;
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

  // Итоги и всё, что делает ИИ: полоса Indigo, текст #111 в обеих темах.
  // Пока итоги готовятся: та же полоса, что у готовых (та же высота, без прыжка), в круге
  // Spinner, а на месте текста итогов Skeleton на нейтральной плитке. Ни свечений, ни мигания
  if (summary.kind === 'processing') {
    return (
      <section className="flex flex-col gap-2" role="status" aria-live="polite" aria-busy="true">
        <div className="aid-role aid-role-indigo flex items-center gap-2 rounded-tile p-3">
          <div className="flex min-h-12 flex-1 items-center gap-3 pr-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-black/10" aria-hidden>
              <Spinner />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold tracking-tight">{t('summaryProcessing')}</span>
              <span className="block truncate text-sm text-muted-foreground">{t('summaryProcessingHint')}</span>
            </span>
          </div>
        </div>
        <div className={cn(TILE, 'space-y-3')} aria-hidden>
          <Skeleton className="h-5 w-1/3 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-[760px] rounded-lg" />
          <Skeleton className="h-4 w-11/12 max-w-[700px] rounded-lg" />
          <Skeleton className="h-4 w-3/4 max-w-[560px] rounded-lg" />
          <Skeleton className="mt-5 h-5 w-1/4 rounded-lg" />
          <Skeleton className="h-4 w-5/6 max-w-[640px] rounded-lg" />
          <Skeleton className="h-4 w-2/3 max-w-[500px] rounded-lg" />
        </div>
      </section>
    );
  }

  if (summary.kind === 'failed') {
    return <ErrorAlert title={t('summaryFailed')} error={summary.error} onRetry={onRetry} />;
  }

  if (summary.kind !== 'ready') return null;

  return (
    // Indigo только у полосы-заголовка; раскрытый текст на нейтральной плитке под ней,
    // чтобы длинные итоги не заливали экран сиреневым
    <section className="flex flex-col gap-2" aria-labelledby="summary-title">
      <div className="aid-role aid-role-indigo flex items-center gap-2 rounded-tile p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="summary-body"
          className="flex min-h-12 flex-1 items-center gap-3 rounded-full pr-3 text-left transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-black/10" aria-hidden>
            <Sparkle className="size-5" />
          </span>
          <span id="summary-title" className="text-lg font-bold tracking-tight">
            {t('summary')}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">{t('summaryOpenHint')}</span>
          {/* Вниз, когда свёрнуто, вверх, когда раскрыто: залитый треугольник вправо читается как «воспроизвести» */}
          <CaretDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="sr-only">{open ? t('collapse') : t('expand')}</span>
        </button>
        {onRetry && (
          <Button variant="ghost" className={cn('h-12 px-5', ON_ROLE_SOFT)} onClick={onRetry}>
            <ArrowClockwise />
            {t('summaryRedo')}
          </Button>
        )}
      </div>
      {open && (
        <article
          id="summary-body"
          className={cn(
            TILE,
            'prose prose-neutral max-w-none dark:prose-invert [&>*]:max-w-[760px] prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-base prose-h3:text-[15px] prose-p:leading-7 prose-p:text-pretty prose-li:text-pretty prose-li:my-1 prose-table:text-sm prose-th:text-left',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryForPage(summary.markdown, title)}</ReactMarkdown>
        </article>
      )}
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

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="size-14 [&_svg]:size-6"
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
      layout="bento"
      header={
        <div role="status" aria-busy="true" aria-label={t('loading')}>
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="mt-5 h-10 w-2/3 rounded-full" />
          <Skeleton className="mt-4 h-5 w-64 rounded-full" />
        </div>
      }
    >
      <div className={cn(TILE, 'space-y-5')} aria-hidden>
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

/** Встреча в корзине, открытая по адресу: что случилось и «Восстановить». */
function InTrash({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      await restoreMeeting(id);
      aidToast.success(t('restored'), { description: title });
    } catch (error) {
      aidToast.error(t('restoreFailed'), { description: String(error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page layout="bento" header={<BackLink />}>
      <div className={cn(TILE, 'py-10')}>
        <h1 className="text-balance text-[36px] font-bold leading-10 tracking-tight">{t('inTrashTitle')}</h1>
        <p className="mt-2 max-w-md text-pretty text-[15px] text-muted-foreground">{t('inTrashHint')}</p>
        <Button size="main" className="mt-6" onClick={() => void restore()} disabled={busy}>
          {busy ? <Spinner tone="inherit" /> : <ArrowCounterClockwise />}
          {t('restore')}
        </Button>
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
  const [trashed, setTrashed] = useState(() => (meetingId ? isTrashed(meetingId) : false));
  useEffect(() => {
    const sync = () => setTrashed(meetingId ? isTrashed(meetingId) : false);
    sync();
    // Кеш мог потеряться: сверить с метками на диске
    void loadTrash().then(sync);
    return onTrashChange(sync);
  }, [meetingId]);
  const [retranscribe, setRetranscribe] = useState(false);

  const meta = m.meeting.kind === 'ready' ? m.meeting.meta : null;
  // Автоматическое название показываем датой «Встреча 7 ноября, 09:40», пока итоги ИИ
  // не дали своё: из текста встречи название не берём (format.ts, shownTitle)
  const shownTitle = meta ? titleForDisplay(meta.title) : '';
  // Реплики-галлюцинации на тишине («Thank you.», «Продолжение следует...») не показываем,
  // в базе они остаются (speech.ts, isShownText)
  const visible = useMemo(() => m.segments.filter((x) => isShownText(x.text)), [m.segments]);

  // Оригинальная страница встречи по ?source=recording запускает итоги сама.
  // В Aid итоги делаются только по кнопке, поэтому метку убираем из адреса.
  // ?summarize=1: «Подвести итоги» снаружи страницы — запускаем один раз, когда
  // встреча загружена и итогов ещё нет, потом метку тоже убираем
  const summarize = params.get('summarize') === '1';
  const asked = useRef(false);
  const segmentsReady = m.meeting.kind === 'ready' && m.summary.kind !== 'loading';
  useEffect(() => {
    if (!summarize || asked.current || !segmentsReady) return;
    asked.current = true;
    if (m.summary.kind === 'empty' && countWords(m.segments.map((x) => x.text).join(' ')) >= MIN_SUMMARY_WORDS) void m.generateSummary();
  }, [summarize, segmentsReady, m]);
  useEffect(() => {
    if (!meetingId) return;
    if (params.get('source') || (summarize && asked.current)) router.replace(`/meeting-details?id=${encodeURIComponent(meetingId)}`, { scroll: false });
  }, [meetingId, params, router, summarize, segmentsReady]);

  useEffect(() => {
    if (shownTitle) document.title = `${shownTitle} · ${t('appName')}`;
    return () => {
      document.title = t('appName');
    };
  }, [shownTitle]);

  if (m.meeting.kind === 'loading') return <LoadingState />;

  if (m.meeting.kind === 'not-found') {
    return (
      <Page layout="bento" header={<BackLink />}>
        <div className={cn(TILE, 'py-10')}>
          <h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('meetingNotFound')}</h1>
          <p className="mt-2 max-w-md text-[15px] text-muted-foreground">{t('meetingNotFoundHint')}</p>
        </div>
      </Page>
    );
  }

  if (m.meeting.kind === 'error' || !meta) {
    return (
      <Page layout="bento" header={<BackLink />}>
        {m.meeting.kind === 'error' && <ErrorAlert title={t('meetingError')} error={m.meeting.error} onRetry={() => void m.retry()} />}
      </Page>
    );
  }

  // Запись с пометкой «не сохранять» (решение после стопа) по прямому адресу не открывается
  if (isDiscarded(meta)) {
    return (
      <Page layout="bento" header={<BackLink />}>
        <div className={cn(TILE, 'py-10')}>
          <h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('notSavedTitle')}</h1>
          <p className="mt-2 max-w-md text-[15px] text-muted-foreground">{t('notSavedHint')}</p>
        </div>
      </Page>
    );
  }

  // Удалена человеком: лежит в корзине 7 дней, по адресу открывается только с «Восстановить»
  if (trashed) return <InTrash id={meta.id} title={shownTitle} />;

  // Пусто и тогда, когда все реплики оказались галлюцинациями на тишине
  const empty = m.total === 0 || (!m.hasMore && visible.length === 0);
  // Дата не повторяется, если название и так «Встреча 3 ноября, 11:37»
  const date = isAutoTitle(meta.title) ? null : formatDateTime(meta.created_at);
  const duration = formatDuration(m.duration);
  // Мета подписью и значением: дата, длительность, реплики
  const facts = [
    date && { label: t('metaDate'), value: date },
    duration && { label: t('metaDuration'), value: duration },
    { label: t('metaReplies'), value: formatNumber(m.hasMore ? m.total : visible.length) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const canRetranscribe = Boolean(betaFeatures.importAndRetranscribe && meta.folder_path);
  const summaryReady = m.summary.kind === 'ready' ? m.summary.markdown : null;
  // «Подвести итоги» только когда есть из чего: запись остановлена (во время записи
  // кнопки нет) и в тексте не меньше MIN_SUMMARY_WORDS слов (speech.ts). Иначе модель
  // заполнила бы разделы заглушками «Ничего не отмечено». Итоги, сделанные раньше, видны
  // при любой длине, но «Сделать заново» у короткой встречи нет
  const { isRecording } = useRecordingControls();
  const enoughText = m.hasMore || countWords(m.segments.map((x) => x.text).join(' ')) >= MIN_SUMMARY_WORDS;
  const canSummarize = !empty && enoughText && !isRecording;
  const showSummary = !empty && (m.summary.kind === 'ready' || m.summary.kind === 'processing' || (m.summary.kind === 'failed' && canSummarize));
  // «Подвести итоги» в шапке, только пока итогов нет: ход генерации, ошибка
  // и «Сделать заново» показываются в блоке итогов над транскриптом
  const showGenerate = canSummarize && m.summary.kind === 'empty';

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
      toastTrashed(meta.id);
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
            // 56 px, Indigo: роль итогов и ИИ
            <Button variant="indigo" size="main" onClick={() => void m.generateSummary()}>
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
          <IconAction label={t('deleteMeeting')} onClick={() => setConfirmDelete(true)}>
            <Trash />
          </IconAction>
        </div>
      </div>
      <div className="mt-5 min-w-0">
        <Title shown={shownTitle} editable={editableTitle(meta.title)} onRename={rename} />
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
              <dd className="tabular text-[15px] font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );

  return (
    <Page layout="bento" header={header}>
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
          {showSummary && <SummaryBlock summary={m.summary} title={shownTitle} onRetry={canSummarize ? () => void m.generateSummary() : undefined} />}
          {/* Транскрипт отдельной плиткой одним текстовым потоком, колонка до 760 px */}
          <section aria-label={t('transcript')} className={TILE}>
            <div className={MEASURE}>
              <TranscriptList segments={visible} />
            </div>
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
