// Экран записи Aid Meetings — shadcn/ui + Solar Icons (fill).
// Панель управления + живой транскрипт.

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { toast } from 'sonner';

// Solar Icons (Bold/Fill variant)
import {
  RecordBold,
  PauseBold,
  PlayBold,
  CopyBold
} from 'solar-icon-set';

interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  speaker?: string;
}

export default function Recording() {
  const router = useRouter();
  const { isRecording, isPaused, recordingDuration } = useRecordingState();
  const { currentMeeting } = useSidebar();

  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Автопрокрутка к последнему сегменту
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Если запись остановлена — редирект
  useEffect(() => {
    if (!isRecording && !isStopping) {
      router.push('/');
    }
  }, [isRecording, isStopping, router]);

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const recordingService = await import('@/services/recordingService').then(
        (m) => m.recordingService
      );
      await recordingService.stopRecording();
      toast.success('Запись остановлена', {
        description: 'Идёт обработка и создание итогов',
      });
      setTimeout(() => {
        if (currentMeeting?.id) {
          router.push(`/meeting-details?id=${currentMeeting.id}`);
        } else {
          router.push('/');
        }
      }, 500);
    } catch (error: any) {
      console.error('Stop error:', error);
      toast.error('Ошибка остановки записи');
      setIsStopping(false);
    }
  };

  const handlePause = () => {
    // Pause/Resume functionality
    console.log('Pause/Resume');
  };

  const handleCopyAll = () => {
    const text = transcripts.map((t) => t.text).join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Транскрипт скопирован');
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="border-b px-8 py-5 shrink-0">
        <div className="flex items-center justify-between max-w-[1600px]">
          <div>
            <h1 className="text-3xl font-semibold">Идёт запись</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
              <span className="text-base font-medium tabular-nums">
                {formatTime(recordingDuration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePause}
              disabled={isStopping}
              className="gap-2"
            >
              {isPaused ? (
                <>
                  <PlayBold size={18} />
                  Продолжить
                </>
              ) : (
                <>
                  <PauseBold size={18} />
                  Пауза
                </>
              )}
            </Button>
            <Button
              size="lg"
              onClick={handleStop}
              disabled={isStopping}
              variant="destructive"
              className="gap-2"
            >
              {isStopping ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Остановка...
                </>
              ) : (
                <>
                  <RecordBold size={18} />
                  Остановить
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Транскрипт</h2>
            {transcripts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleCopyAll} className="gap-2">
                <CopyBold size={16} />
                Скопировать всё
              </Button>
            )}
          </div>

          {transcripts.length === 0 ? (
            <div className="rounded-2xl p-12 text-center bg-muted/30 border">
              <p className="text-sm text-muted-foreground">Ожидание речи...</p>
              <p className="text-xs text-muted-foreground/70 mt-2">
                Транскрипт появится автоматически
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transcripts.map((segment) => (
                <div
                  key={segment.id}
                  className="p-5 rounded-xl bg-card border"
                >
                  <p className="text-[15px] leading-relaxed">{segment.text}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(segment.timestamp).toLocaleTimeString('ru-RU')}
                  </p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
