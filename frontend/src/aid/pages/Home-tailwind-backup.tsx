// Главная страница Aid: desktop productivity workspace для встреч.
// Header с CTA, toolbar с поиском, компактный список встреч.

'use client';

import { useEffect, useState } from 'react';
import { Plus, Upload, Search, X, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/aid/strings';
import { formatDate, formatDuration } from '@/aid/lib/format';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useRouter } from 'next/navigation';
import { recordingService } from '@/services/recordingService';
import { toast } from 'sonner';
import { useImportDialog } from '@/contexts/ImportDialogContext';

export default function AidHome() {
  const router = useRouter();
  const { meetings, searchTranscripts, refetchMeetings } = useSidebar();
  const { status, setStatus } = useRecordingState();
  const { openImportDialog } = useImportDialog();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const isRecording = status === RecordingStatus.RECORDING || status === RecordingStatus.STARTING;

  useEffect(() => {
    if (isRecording) {
      router.push('/?recording=true');
    }
  }, [isRecording, router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N: New recording
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleStartRecording();
      }
      // Cmd/Ctrl + F: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('meetings-search')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartRecording = async () => {
    try {
      setStatus(RecordingStatus.STARTING, 'Запуск записи...');

      // Start recording with default devices and generated meeting name
      const meetingName = `Встреча ${new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })}`;

      await recordingService.startRecordingWithDevices(null, null, meetingName);

      setStatus(RecordingStatus.RECORDING);
      toast.success('Запись началась');
      router.push('/?recording=true');
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      setStatus(RecordingStatus.ERROR, error?.message || 'Не удалось начать запись');

      // Show user-friendly error
      if (error?.message?.includes('permission')) {
        toast.error('Нет доступа к микрофону. Разрешите доступ в настройках системы.');
      } else if (error?.message?.includes('device')) {
        toast.error('Микрофон не найден. Подключите устройство.');
      } else {
        toast.error(error?.message || 'Не удалось начать запись');
      }
    }
  };

  const handleImportAudio = () => {
    openImportDialog();
  };

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setIsSearching(true);
      await searchTranscripts(value);
      setIsSearching(false);
    } else {
      await searchTranscripts('');
    }
  };

  const handleClearSearch = async () => {
    setSearchQuery('');
    await searchTranscripts('');
  };

  const displayedMeetings = meetings;
  const isEmpty = displayedMeetings.length === 0;

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Встречи</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleStartRecording}
                  size="default"
                  className="gap-2"
                  disabled={isRecording}
                >
                  <Plus className="h-4 w-4" />
                  Новая запись
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cmd+N</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Поиск */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="meetings-search"
              type="text"
              placeholder="Поиск по встречам..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Импорт */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleImportAudio} variant="outline" size="default" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Загрузить запись
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Загрузите аудиозапись встречи для обработки</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          <h2 className="text-base font-semibold">
            {searchQuery ? 'Результаты поиска' : 'Все встречи'}
          </h2>

          {isSearching ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Ничего не найдено' : t('noMeetings')}
              </p>
              {!searchQuery && (
                <p className="text-xs text-muted-foreground mt-2">
                  Нажмите «Новая запись» или загрузите аудиофайл
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {displayedMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-lg hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors text-left group"
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                    <Clock className="h-5 w-5 text-accent" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">
                      {meeting.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {meeting.created_at && (
                        <span className="flex items-center gap-1 tabular">
                          <Calendar className="h-3 w-3" />
                          {formatDate(meeting.created_at)}
                        </span>
                      )}
                      {meeting.duration && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 tabular">
                            <Clock className="h-3 w-3" />
                            {formatDuration(meeting.duration)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
