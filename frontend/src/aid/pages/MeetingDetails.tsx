// Детали встречи: компактный header, tabs для content areas.
// Gravity UI inspired: системный, читаемый, функциональный.

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrivacyChip } from '@/aid/components/PrivacyChip';
import { CopyButton } from '@/aid/components/CopyButton';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '@/aid/lib/format';
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

      const meta = await invoke<MeetingMetadata>('api_get_meeting_metadata', { meetingId });
      setMetadata(meta);

      const transcriptsData = await invoke<{ transcripts: Transcript[] }>(
        'api_get_meeting_transcripts',
        { meetingId, offset: 0, limit: 1000 }
      );
      setTranscripts(transcriptsData.transcripts || []);

      const summaryData = await invoke<any>('api_get_summary', { meetingId });

      if (summaryData?.status === 'completed' && summaryData?.data?.markdown) {
        setSummary({
          status: 'completed',
          markdown: summaryData.data.markdown,
        });
      } else if (summaryData?.status === 'failed') {
        setSummary({
          status: 'failed',
          error: summaryData.error || 'Не удалось создать итоги',
        });
      } else {
        setSummary({ status: 'idle' });
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load meeting:', err);
      setError(err?.message || 'Не удалось загрузить встречу');
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!meetingId) return;

    try {
      setSummary({ status: 'processing' });
      await invoke('api_process_transcript', { meetingId });
      await loadMeeting();
    } catch (err: any) {
      setSummary({
        status: 'failed',
        error: err?.message || 'Ошибка генерации итогов',
      });
    }
  };

  const transcriptText = transcripts.map((t: Transcript) => t.text).join('\n');
  const summaryMarkdown = summary.markdown || '';

  if (!meetingId) return null;

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {loading ? (
                <Skeleton className="h-7 w-64" />
              ) : (
                <h1 className="text-2xl font-semibold">{metadata?.title || 'Встреча'}</h1>
              )}
              <div className="flex items-center gap-3 mt-1">
                {loading ? (
                  <Skeleton className="h-4 w-32" />
                ) : metadata?.created_at ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {formatDateTime(metadata.created_at)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <PrivacyChip level={privacyLevel} />
            {summary.status === 'completed' && (
              <CopyButton text={summaryMarkdown} markdown={summaryMarkdown} variant="outline" size="sm" label="Копировать итоги" />
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="summary" className="h-full flex flex-col">
            <div className="border-b border-border px-6">
              <TabsList className="bg-transparent h-auto p-0">
                <TabsTrigger value="summary" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none px-4 py-3">
                  Итоги
                </TabsTrigger>
                <TabsTrigger value="transcript" className="data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none px-4 py-3">
                  Транскрипт
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="summary" className="p-6 mt-0">
                {summary.status === 'processing' ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : summary.status === 'failed' ? (
                  <Alert variant="destructive">
                    <AlertDescription>{summary.error}</AlertDescription>
                  </Alert>
                ) : summary.status === 'completed' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: summaryMarkdown }} />
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground mb-4">Итоги ещё не созданы</p>
                    <Button onClick={handleGenerateSummary}>Создать итоги</Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="transcript" className="p-6 mt-0">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Транскрипт отсутствует</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Транскрипт</h3>
                      <CopyButton text={transcriptText} size="sm" variant="outline" label="Копировать" />
                    </div>
                    <div className="space-y-3">
                      {transcripts.map((segment: Transcript, idx: number) => (
                        <div key={idx} className="group flex gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                          <span className="text-xs text-muted-foreground shrink-0 tabular w-16">
                            {segment.timestamp || '00:00'}
                          </span>
                          <p className="text-sm flex-1">{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </main>
  );
}
