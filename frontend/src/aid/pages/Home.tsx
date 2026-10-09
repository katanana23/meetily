// Главная страница Aid: desktop productivity workspace для встреч.
// Header с CTA, toolbar с поиском, компактный список встреч.

'use client';

import { useEffect, useState } from 'react';
import { Plus, Upload, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/aid/strings';
import { formatDate, formatDuration } from '@/aid/lib/format';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useRouter } from 'next/navigation';

export default function AidHome() {
  const router = useRouter();
  const { meetings, searchTranscripts } = useSidebar();
  const { isRecording } = useRecordingState();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isRecording) {
      router.push('/?recording=true');
    }
  }, [isRecording, router]);

  const handleStartRecording = () => {
    router.push('/?recording=true');
  };

  const handleImportAudio = () => {
    console.log('Import audio');
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
          <Button onClick={handleStartRecording} size="default" className="gap-2">
            <Plus className="h-4 w-4" />
            Новая запись
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Поиск */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
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
          <Button onClick={handleImportAudio} variant="outline" size="default" className="gap-2">
            <Upload className="h-4 w-4" />
            Импортировать
          </Button>
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
                  {t('noMeetingsHint')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {displayedMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">
                      {meeting.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground tabular">
                        {formatDate((meeting as any).created_at || '')}
                      </span>
                      {(meeting as any).duration && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground tabular">
                            {formatDuration((meeting as any).duration)}
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
