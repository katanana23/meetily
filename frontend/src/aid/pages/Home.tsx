// Главная страница Aid Meetings — shadcn/ui + Solar Icons (fill).
// Минималистичная композиция: поиск, импорт, список, круглая кнопка записи.

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { toast } from 'sonner';
import { formatDateTime, formatDuration } from '@/aid/lib/format';

// Solar Icons (Bold/Fill variant)
import {
  VideocameraRecordBold,
  MusicLibrary2Bold,
  ClockCircleBold,
  MagniferBold,
  AltArrowRightBold
} from 'solar-icon-set';

interface CurrentMeeting {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  duration?: number;
}

function HomeContent() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const { openImportDialog } = useImportDialog();
  const { isRecording } = useRecordingState();

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMeetings, setFilteredMeetings] = useState<CurrentMeeting[]>(meetings);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMeetings(meetings);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = meetings.filter((m) =>
      m.title.toLowerCase().includes(query)
    );
    setFilteredMeetings(filtered);
  }, [searchQuery, meetings]);

  const handleStartRecording = async () => {
    if (isStarting || isRecording) return;

    setIsStarting(true);
    setIsRecordingActive(true);

    try {
      const recordingService = await import('@/services/recordingService').then(
        (m) => m.recordingService
      );

      await recordingService.startRecordingWithDevices(null, null, 'Новая встреча');

      setTimeout(() => {
        router.push('/?recording=true');
        setIsRecordingActive(false);
      }, 1500);

      toast.success('Запись началась');
    } catch (error: any) {
      console.error('Recording start error:', error);
      toast.error('Ошибка запуска записи', {
        description: error.message || 'Проверьте разрешения микрофона',
      });
      setIsStarting(false);
      setIsRecordingActive(false);
    }
  };

  const handleOpenMeeting = (id: string) => {
    router.push(`/meeting-details?id=${id}`);
  };

  const handleImport = () => {
    openImportDialog();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleStartRecording();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarting, isRecording]);

  // Автоматический переход при начале записи
  useEffect(() => {
    if (isRecording && !isStarting) {
      router.push('/?recording=true');
    }
  }, [isRecording, router, isStarting]);

  return (
    <main className="flex-1 h-screen overflow-y-auto bg-background pb-32">
      <div className="max-w-[900px] mx-auto px-8 py-12">
        {/* Search bar */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <MagniferBold size={20} className="text-muted-foreground" />
            </div>
            <Input
              id="search-input"
              placeholder="Поиск по встречам... (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-base rounded-2xl border-2"
            />
          </div>
        </div>

        {/* Import button */}
        <div className="mb-8">
          <Button
            variant="outline"
            size="lg"
            onClick={handleImport}
            className="w-full h-14 rounded-2xl gap-2 text-base"
          >
            <MusicLibrary2Bold size={20} />
            Загрузить аудио
          </Button>
        </div>

        {/* Meetings list */}
        <div>
          {filteredMeetings.length === 0 ? (
            <div className="rounded-2xl p-16 text-center bg-muted/30 border-2 border-dashed">
              <p className="text-sm text-muted-foreground mb-2">
                {searchQuery ? 'Ничего не найдено' : 'Пока нет записей'}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {searchQuery
                  ? 'Попробуйте изменить запрос'
                  : 'Нажмите кнопку записи внизу'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => handleOpenMeeting(meeting.id)}
                  className="group w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 bg-card border-2 border-border hover:border-primary/50 hover:bg-muted/30"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                    <ClockCircleBold size={24} className="text-muted-foreground" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium truncate mb-1">{meeting.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {meeting.created_at && (
                        <span>{formatDateTime(meeting.created_at)}</span>
                      )}
                      {meeting.duration && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(meeting.duration)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Arrow hint */}
                  <AltArrowRightBold size={20} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Circular Record Button (centered in content width) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-[900px] px-8">
        <div className="flex justify-center">
          <div className="relative">
            {/* Siri animation rings */}
            {isRecordingActive && (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.2s' }} />
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
              </>
            )}

            {/* Main button */}
            <button
              onClick={handleStartRecording}
              disabled={isStarting || isRecording}
              className="relative w-20 h-20 rounded-full bg-gradient-to-br from-red-600 to-red-700 text-white shadow-2xl transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isStarting ? (
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
              ) : (
                <VideocameraRecordBold size={24} color="white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
