// Страница записи: плавающая панель (стекло) внизу, живой транскрипт, состояния ошибки.

'use client';

import { useEffect, useState } from 'react';
import { Square, Pause, Play, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BentoCard } from '@/aid/components/BentoCard';
import { CopyButton } from '@/aid/components/CopyButton';
import { t } from '@/aid/strings';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { formatDuration } from '@/aid/lib/format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function AidRecording() {
  const { status, isRecording, isPaused, recordingDuration } = useRecordingState();
  const { transcripts } = useTranscripts();
  const [autoScroll, setAutoScroll] = useState(true);

  // Автопрокрутка при новом транскрипте
  useEffect(() => {
    if (autoScroll && transcripts.length > 0) {
      const container = document.getElementById('transcript-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [transcripts, autoScroll]);

  const handleStop = () => {
    // TODO: вызвать остановку через контекст
    console.log('Stop recording');
  };

  const handlePause = () => {
    // TODO: вызвать паузу через контекст
    console.log('Pause recording');
  };

  const handleResume = () => {
    // TODO: возобновить через контекст
    console.log('Resume recording');
  };

  const handleCopySegment = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const allText = transcripts.map((t) => t.text).join('\n');

  // Состояние ошибки
  if (status === RecordingStatus.ERROR) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="max-w-md w-full space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="ml-2">
              <p className="font-medium">{t('recordingError')}</p>
              <p className="text-sm mt-1">{t('recordingErrorHint')}</p>
            </AlertDescription>
          </Alert>
          <Button onClick={() => window.location.reload()} className="w-full" size="lg">
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
        {/* Транскрипт */}
        <div className="flex-1 overflow-y-auto p-8" id="transcript-container">
          <div className="max-w-4xl mx-auto">
            <BentoCard
              title={t('liveTranscript')}
              action={
                transcripts.length > 0 && (
                  <CopyButton text={allText} label={t('copyAll')} size="sm" />
                )
              }
            >
              {transcripts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Ожидание речи…</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transcripts.map((segment, idx) => (
                    <div
                      key={segment.id || idx}
                      className="group relative p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          {segment.timestamp && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {segment.timestamp}
                            </div>
                          )}
                          <p className="leading-relaxed">{segment.text}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleCopySegment(segment.text)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </BentoCard>
          </div>
        </div>

        {/* Плавающая панель записи (стекло) */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="glass rounded-[2rem] shadow-2xl px-8 py-6 flex items-center gap-6">
            {/* Таймер */}
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-2xl font-semibold min-w-[5rem]">
                {formatDuration(recordingDuration || 0)}
              </span>
            </div>

            {/* Визуализация (заглушка — можно подключить реальные уровни) */}
            <div className="flex items-center gap-1 h-10">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-accent rounded-full animate-pulse"
                  style={{
                    height: `${20 + Math.random() * 40}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>

            {/* Кнопки */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="lg"
                onClick={isPaused ? handleResume : handlePause}
                className="h-14"
              >
                {isPaused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
              </Button>

              <Button
                variant="destructive"
                size="lg"
                onClick={handleStop}
                className="h-14 px-8 text-base"
              >
                <Square className="h-6 w-6 mr-2" />
                {t('stopRecording')}
              </Button>
            </div>
          </div>
        </div>
    </main>
  );
}
