// Главная страница Aid Meetings — библиотека встреч.
// Gravity UI integrated: Button, TextInput, Text, Icon

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, TextInput, Text, Icon } from '@gravity-ui/uikit';
import { Magnifier, ArrowUpFromSquare, CirclePlus, Clock } from '@gravity-ui/icons';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { toast } from 'sonner';
import { formatDateTime, formatDuration } from '@/aid/lib/format';

// CurrentMeeting из SidebarProvider
interface CurrentMeeting {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  duration?: number;
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { meetings, searchTranscripts } = useSidebar();
  const { openImportDialog } = useImportDialog();
  const { status, setStatus } = useRecordingState();

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMeetings, setFilteredMeetings] = useState<CurrentMeeting[]>(meetings);

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
    try {
      const recordingService = await import('@/services/recordingService').then(
        (m) => m.recordingService
      );

      await recordingService.startRecordingWithDevices(null, null, 'Новая встреча');
      // RecordingStatus.RECORDING is set by the service
      toast.success('Запись началась');
    } catch (error: any) {
      console.error('Recording start error:', error);
      toast.error('Ошибка запуска записи', {
        description: error.message || 'Проверьте разрешения микрофона',
      });
    }
  };

  const handleOpenMeeting = (id: string) => {
    router.push(`/meeting-details?id=${id}`);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);

    // Поиск по Enter
    if (searchQuery.trim()) {
      searchTranscripts(searchQuery);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleStartRecording();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const input = document.querySelector('input[placeholder="Поиск по встречам..."]') as HTMLInputElement;
        input?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--g-color-line-generic)' }}>
        <div className="flex items-center justify-between">
          <Text variant="header-1">Встречи</Text>
          <Button view="action" size="l" onClick={handleStartRecording}>
            <Icon data={CirclePlus} size={16} />
            Новая запись
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b px-6 py-3" style={{ borderColor: 'var(--g-color-line-generic)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <TextInput
              size="l"
              placeholder="Поиск по встречам..."
              value={searchQuery}
              onUpdate={handleSearch}
              startContent={<Icon data={Magnifier} size={16} />}
            />
          </div>
          <Button view="outlined" size="l" onClick={() => openImportDialog()}>
            <Icon data={ArrowUpFromSquare} size={16} />
            Загрузить запись
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          <Text variant="subheader-3">Все встречи</Text>

          {filteredMeetings.length === 0 ? (
            <div
              className="rounded-lg p-12 text-center"
              style={{
                border: '1px solid var(--g-color-line-generic)',
                backgroundColor: 'var(--g-color-base-background)',
              }}
            >
              <Text variant="body-2" color="secondary">
                {searchQuery ? 'Ничего не найдено' : 'Пока нет ни одной записи'}
              </Text>
              {!searchQuery && (
                <Text variant="caption-2" color="hint" className="mt-2">
                  Нажмите «Новая запись» или загрузите аудиофайл
                </Text>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => handleOpenMeeting(meeting.id)}
                  className="group w-full text-left p-4 rounded-lg transition-colors flex items-center gap-4"
                  style={{
                    backgroundColor: 'var(--g-color-base-background)',
                    border: '1px solid var(--g-color-line-generic)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--g-color-base-simple-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--g-color-base-background)';
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      backgroundColor: 'var(--g-color-base-simple-hover)',
                    }}
                  >
                    <Icon data={Clock} size={20} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <Text variant="body-2" className="font-medium">
                      {meeting.title}
                    </Text>
                    <div className="flex items-center gap-3 mt-1">
                      {meeting.created_at && (
                        <Text variant="caption-2" color="secondary">
                          {formatDateTime(meeting.created_at)}
                        </Text>
                      )}
                      {meeting.duration && (
                        <Text variant="caption-2" color="secondary">
                          {formatDuration(meeting.duration)}
                        </Text>
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

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <Text variant="body-2">Загрузка...</Text>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
