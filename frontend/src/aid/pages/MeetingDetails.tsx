// Страница встречи: шапка с действиями, бенто с итогами и транскриптом.

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, Calendar, FileText, MessageSquare, Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BentoCard } from '@/aid/components/BentoCard';
import { PrivacyChip } from '@/aid/components/PrivacyChip';
import { CopyButton } from '@/aid/components/CopyButton';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { t } from '@/aid/strings';
import { formatDuration, formatDateTime } from '@/aid/lib/format';
import { getCombinedPrivacy } from '@/aid/lib/privacy';
import { useConfig } from '@/contexts/ConfigContext';
import { invoke } from '@tauri-apps/api/core';
import type { MeetingMetadata, Transcript } from '@/types';

interface Summary {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  markdown?: string;
  error?: string;
}

export default function AidMeetingDetails() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = searchParams.get('id');

  const [metadata, setMetadata] = useState<MeetingMetadata | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [summary, setSummary] = useState<Summary>({ status: 'idle' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { modelConfig: summaryModelConfig, transcriptModelConfig } = useConfig();

  const privacyLevel = getCombinedPrivacy(
    transcriptModelConfig?.provider,
    summaryModelConfig?.provider
  );

  useEffect(() => {
    if (!meetingId) {
      router.push('/');
      return;
    }

    loadMeeting();
  }, [meetingId]);

  const loadMeeting = async () => {
    if (!meetingId) return;

    try {
      setLoading(true);
      setError(null);

      // Загрузить метаданные
      const meta = await invoke<MeetingMetadata>('api_get_meeting_metadata', { meetingId });
      setMetadata(meta);

      // Загрузить транскрипты
      const transcriptsData = await invoke<{ transcripts: Transcript[] }>(
        'api_get_meeting_transcripts',
        { meetingId, offset: 0, limit: 1000 }
      );
      setTranscripts(transcriptsData.transcripts || []);

      // Загрузить резюме
      const summaryData = await invoke<any>('api_get_summary', { meetingId });

      if (summaryData?.status === 'completed' && summaryData?.data?.markdown) {
        setSummary({
          status: 'completed',
          markdown: summaryData.data.markdown,
        });
      } else if (summaryData?.status === 'failed') {
        setSummary({
          status: 'failed',
          error: summaryData.error || 'Unknown error',
        });
      } else {
        setSummary({ status: 'idle' });
      }
    } catch (err) {
      console.error('Failed to load meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!meetingId) return;

    try {
      setSummary({ status: 'processing' });
      await invoke('api_process_transcript', { meetingId });

      // Опросить статус
      setTimeout(() => loadMeeting(), 2000);
    } catch (err) {
      console.error('Failed to generate summary:', err);
      setSummary({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to generate summary',
      });
    }
  };

  const transcriptText = transcripts.map((t) => t.text).join('\n');
  const transcriptMarkdown = transcripts
    .map((t) => `**${t.timestamp || ''}** ${t.text}`)
    .join('\n\n');

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Skeleton className="h-12 w-1/2" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
          </div>
      </main>
    );
  }

  if (error || !metadata) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            <p className="font-medium">{t('error')}</p>
            <p className="text-sm mt-1">{error || 'Meeting not found'}</p>
            <Button onClick={() => router.push('/')} className="mt-4" variant="outline">
              Вернуться
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const duration = transcripts.length > 0
    ? transcripts[transcripts.length - 1].audio_end_time || 0
    : 0;

  return (
    <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Шапка */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">{metadata.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(metadata.created_at)}
                  </div>
                  {duration > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {formatDuration(duration)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <PrivacyChip level={privacyLevel} />
              </div>
            </div>

            {/* Действия */}
            <div className="flex items-center gap-2">
              {summary.status === 'completed' && summary.markdown && (
                <CopyButton
                  text={summary.markdown}
                  label={t('copySummary')}
                  variant="outline"
                />
              )}
              <CopyButton
                text={transcriptText}
                markdown={transcriptMarkdown}
                label={t('copyTranscript')}
                variant="outline"
              />
            </div>
          </div>

          {/* Бенто: итоги, транскрипт, обработка */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Итоги */}
            <BentoCard
              title={t('summary')}
              className="lg:row-span-2"
              action={
                summary.status === 'completed' && (
                  <Button variant="ghost" size="icon" onClick={handleGenerateSummary}>
                    <Sparkles className="h-4 w-4" />
                  </Button>
                )
              }
            >
              {summary.status === 'idle' && (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center space-y-2">
                    <p className="text-muted-foreground">{t('noSummary')}</p>
                    {!summaryModelConfig?.provider ? (
                      <p className="text-sm text-muted-foreground">{t('selectModel')}</p>
                    ) : (
                      <Button onClick={handleGenerateSummary} size="lg">
                        <Sparkles className="h-5 w-5 mr-2" />
                        {t('generateSummary')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {summary.status === 'processing' && (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-muted border-t-accent" />
                  <p className="text-muted-foreground">Генерация итогов…</p>
                </div>
              )}

              {summary.status === 'failed' && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <p className="font-medium">Не удалось создать итоги</p>
                    <p className="text-sm mt-1">{summary.error}</p>
                    <Button onClick={handleGenerateSummary} variant="outline" size="sm" className="mt-3">
                      {t('retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {summary.status === 'completed' && summary.markdown && (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div dangerouslySetInnerHTML={{ __html: summary.markdown }} />
                </div>
              )}
            </BentoCard>

            {/* Транскрипт */}
            <BentoCard title={t('transcript')}>
              <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {transcripts.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет транскрипта</p>
                ) : (
                  transcripts.map((segment, idx) => (
                    <div
                      key={segment.id || idx}
                      className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors space-y-1"
                    >
                      {segment.timestamp && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {segment.timestamp}
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">{segment.text}</p>
                    </div>
                  ))
                )}
              </div>
            </BentoCard>

            {/* Как это обработано */}
            <BentoCard title={t('processing')}>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Транскрипция</p>
                    <p className="text-muted-foreground">
                      {transcriptModelConfig?.provider
                        ? `Провайдер: ${transcriptModelConfig.provider}`
                        : 'Не настроено'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Итоги</p>
                    <p className="text-muted-foreground">
                      {summaryModelConfig?.provider
                        ? `Провайдер: ${summaryModelConfig.provider}`
                        : 'Не настроено'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Приватность</p>
                    <PrivacyChip level={privacyLevel} className="mt-1" />
                  </div>
                </div>
              </div>
            </BentoCard>
          </div>
        </div>
    </main>
  );
}
