// Экран «Встреча»: шапка (название, дата, длительность, приватность),
// вкладки «Итоги» и «Транскрипт» с копированием в текст и Markdown,
// состояния загрузки, пустых итогов и ошибки.

'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  MessagesSquare,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/aid/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/aid/components/ui/tabs';
import { CopyActions } from '@/aid/components/CopyActions';
import { ErrorDetails } from '@/aid/components/ErrorDetails';
import { PrivacyChip } from '@/aid/components/PrivacyChip';
import { TranscriptList } from '@/aid/components/TranscriptList';
import {
  markdownToPlain,
  transcriptAsMarkdown,
  transcriptAsText,
  useMeeting,
  type FriendlyError,
  type SummaryState,
} from '@/aid/lib/meeting';
import { usePrivacy } from '@/aid/lib/privacy';
import { formatDateTime, formatDuration, plural } from '@/aid/lib/format';
import { t } from '@/aid/strings';

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

function SectionHeader({ title, meta, actions }: { title: string; meta?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
      </div>
      {actions}
    </div>
  );
}

function SummaryPanel({ title, summary, onGenerate }: { title: string; summary: SummaryState; onGenerate: () => void }) {
  if (summary.kind === 'loading') {
    return (
      <Card className="space-y-4 p-6" aria-busy="true" aria-label={t('loading')}>
        <Skeleton className="h-6 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded-lg" />
      </Card>
    );
  }

  if (summary.kind === 'processing') {
    return (
      <Card className="p-8" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" />
          <h2 className="text-lg font-semibold">{t('summaryProcessing')}</h2>
        </div>
        <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">{t('summaryProcessingHint')}</p>
        <div className="mt-6 space-y-3" aria-hidden>
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5 rounded-lg" />
          <Skeleton className="h-4 w-3/5 rounded-lg" />
        </div>
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
      <Card className="flex flex-col items-start p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">{t('noSummary')}</h2>
        <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">{t('noSummaryHint')}</p>
        <Button size="xl" className="mt-6" onClick={onGenerate}>
          <Sparkles />
          {t('generateSummary')}
        </Button>
      </Card>
    );
  }

  const markdown = summary.markdown;
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        title={t('summary')}
        actions={
          <CopyActions
            subject="итоги"
            getText={() => markdownToPlain(markdown)}
            getMarkdown={() => (/^#\s/.test(markdown) ? markdown : `# ${title}\n\n${markdown}`)}
          />
        }
      />
      <article className="prose prose-neutral max-w-none px-6 py-6 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base prose-p:leading-7 prose-li:my-1 prose-table:text-sm prose-th:text-left">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </Card>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label={t('loading')}>
      <Skeleton className="h-11 w-44 rounded-2xl" />
      <Skeleton className="mt-6 h-9 w-2/3 rounded-xl" />
      <div className="mt-4 flex gap-3">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <Skeleton className="mt-10 h-12 w-64 rounded-2xl" />
      <Card className="mt-6 space-y-4 p-6">
        <Skeleton className="h-6 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded-lg" />
      </Card>
    </div>
  );
}

function MeetingDetailsContent() {
  const meetingId = useSearchParams().get('id');
  const m = useMeeting(meetingId);
  const { privacy } = usePrivacy();
  const [tab, setTab] = useState<string | null>(null);

  const fullTitle = m.meeting.kind === 'ready' ? m.meeting.meta.title : '';
  const segmentsLabel = useMemo(() => `${m.total} ${plural(m.total, 'реплика', 'реплики', 'реплик')}`, [m.total]);

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

  if (m.meeting.kind === 'error') {
    return (
      <>
        <BackLink />
        <div className="mt-6">
          <ErrorAlert title={t('meetingError')} error={m.meeting.error} onRetry={() => void m.retry()} />
        </div>
      </>
    );
  }

  const { meta } = m.meeting;
  const date = formatDateTime(meta.created_at);
  const duration = formatDuration(m.duration);
  // По умолчанию открыты итоги: там либо результат, либо кнопка «Сделать итоги»
  const activeTab = tab ?? 'summary';

  return (
    <>
      <BackLink />

      <header className="mt-4">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{meta.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
          {date && (
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden />
              <span className="sr-only">Дата: </span>
              {date}
            </span>
          )}
          {duration && (
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" aria-hidden />
              <span className="sr-only">Длительность: </span>
              {duration}
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="size-4" aria-hidden />
            {segmentsLabel}
          </span>
          <PrivacyChip privacy={privacy} />
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setTab} className="mt-8">
        <TabsList aria-label="Разделы встречи">
          <TabsTrigger value="summary">
            <Sparkles />
            {t('summary')}
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <MessagesSquare />
            {t('transcript')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummaryPanel title={meta.title} summary={m.summary} onGenerate={() => void m.generateSummary()} />
        </TabsContent>

        <TabsContent value="transcript">
          <Card className="overflow-hidden">
            <SectionHeader
              title={t('transcript')}
              meta={segmentsLabel}
              actions={
                <CopyActions
                  subject="транскрипт"
                  disabled={m.total === 0}
                  getText={async () => transcriptAsText(await m.loadAll())}
                  getMarkdown={async () => transcriptAsMarkdown(fullTitle, await m.loadAll())}
                />
              }
            />
            {m.segments.length === 0 ? (
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
