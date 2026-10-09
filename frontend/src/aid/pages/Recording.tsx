// Страница записи: компактная панель управления внизу, живой транскрипт.
// Gravity UI inspired: минимальный шум, чёткие индикаторы.

'use client';

import { useEffect, useState, useRef } from 'react';
import { Pause, Square, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '@/aid/components/CopyButton';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useRouter } from 'next/navigation';
import type { Transcript } from '@/types';

export default function AidRecording() {
  const router = useRouter();
  const { status, recordingDuration } = useRecordingState();
  const { transcripts } = useTranscripts();
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isRecording = status === RecordingStatus.RECORDING;
  const isStopping = status === RecordingStatus.STOPPING;

  useEffect(() => {
    if (!isRecording && status !== RecordingStatus.STOPPING) {
      router.push('/');
    }
  }, [isRecording, status, router]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const handlePause = () => {
    setIsPaused(!isPaused);
    console.log('Pause/Resume');
  };

  const handleStop = () => {
    console.log('Stop recording');
    router.push('/');
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const transcriptText = transcripts.map((t: Transcript) => t.text).join('\n');

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            <p className="font-medium">Ошибка записи</p>
            <p className="text-sm mt-1">{error}</p>
            <Button onClick={() => router.push('/')} variant="outline" size="sm" className="mt-4">
              Вернуться
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Транскрипт</h2>
            {transcripts.length > 0 && (
              <CopyButton text={transcriptText} size="sm" variant="ghost" label="Копировать" />
            )}
          </div>

          {transcripts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Ожидание речи...
            </p>
          ) : (
            <div className="space-y-3">
              {transcripts.map((segment: Transcript, idx: number) => (
                <div key={idx} className="p-4 rounded-lg bg-card border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted-foreground shrink-0 tabular w-16">
                      {segment.timestamp}
                    </span>
                    <p className="text-sm flex-1">{segment.text}</p>
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
              <span className="text-2xl font-semibold tabular">
                {formatTime(recordingDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="lg" onClick={handlePause} disabled={isStopping} className="gap-2">
                {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                {isPaused ? 'Продолжить' : 'Пауза'}
              </Button>
              <Button variant="destructive" size="lg" onClick={handleStop} disabled={isStopping} className="gap-2">
                <Square className="h-5 w-5" />
                {isStopping ? 'Остановка...' : 'Остановить'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
