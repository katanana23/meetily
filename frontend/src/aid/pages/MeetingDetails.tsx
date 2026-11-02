// Детали встречи Aid Meetings — shadcn/ui + Solar Icons (fill).
// Транскрипт с таймерами и цветными аватарками спикеров.

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { toast } from 'sonner';
import { formatDateTime, formatDuration } from '@/aid/lib/format';

// Solar Icons (Bold/Fill variant)
import {
  AltArrowLeftBold,
  CopyBold,
  MagniferBold
} from 'solar-icon-set';

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  time: string;
}

interface Meeting {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  duration?: number;
  summary?: string;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
}

// Цвета для аватарок спикеров
const SPEAKER_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-indigo-500',
];

// Хэш для стабильного цвета по имени спикера
function getSpeakerColor(speaker: string): string {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index];
}

// Получить инициалы спикера
function getSpeakerInitials(speaker: string): string {
  const parts = speaker.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return speaker.substring(0, 2).toUpperCase();
}

function MeetingDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = searchParams.get('id');
  const { meetings } = useSidebar();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSegments, setFilteredSegments] = useState<TranscriptSegment[]>([]);

  useEffect(() => {
    if (!meetingId) {
      router.push('/');
      return;
    }

    const found = meetings.find((m) => m.id === meetingId);
    if (found) {
      // Mock transcript segments для демонстрации
      const mockSegments: TranscriptSegment[] = [
        {
          id: '1',
          speaker: 'Алексей Иванов',
          text: 'Доброе утро всем! Давайте начнём нашу встречу. Сегодня обсудим прогресс по проекту.',
          timestamp: '00:00',
          time: '09:00'
        },
        {
          id: '2',
          speaker: 'Мария Петрова',
          text: 'Привет! Я готова поделиться результатами по дизайну интерфейса.',
          timestamp: '00:15',
          time: '09:00'
        },
        {
          id: '3',
          speaker: 'Алексей Иванов',
          text: 'Отлично, Мария. Сначала давайте послушаем обновления от команды разработки.',
          timestamp: '00:25',
          time: '09:00'
        },
        {
          id: '4',
          speaker: 'Дмитрий Сидоров',
          text: 'Мы завершили работу над API для аутентификации. Все тесты прошли успешно.',
          timestamp: '00:40',
          time: '09:01'
        },
        {
          id: '5',
          speaker: 'Мария Петрова',
          text: 'Супер! Тогда я могу начать интеграцию форм входа на следующей неделе.',
          timestamp: '01:00',
          time: '09:01'
        },
      ];

      const meetingWithSegments = {
        ...found,
        transcriptSegments: mockSegments,
      } as Meeting;

      setMeeting(meetingWithSegments);
      setFilteredSegments(mockSegments);
    }
    setIsLoading(false);
  }, [meetingId, meetings, router]);

  useEffect(() => {
    if (!meeting?.transcriptSegments) return;

    if (!searchQuery.trim()) {
      setFilteredSegments(meeting.transcriptSegments);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = meeting.transcriptSegments.filter(
      (segment) =>
        segment.text.toLowerCase().includes(query) ||
        segment.speaker.toLowerCase().includes(query)
    );
    setFilteredSegments(filtered);
  }, [searchQuery, meeting]);

  const handleBack = () => {
    router.push('/');
  };

  const handleCopySummary = () => {
    if (meeting?.summary) {
      navigator.clipboard.writeText(meeting.summary);
      toast.success('Итоги скопированы');
    }
  };

  const handleCopyTranscript = () => {
    if (!meeting?.transcriptSegments) return;

    const text = meeting.transcriptSegments
      .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.text}`)
      .join('\n\n');

    navigator.clipboard.writeText(text);
    toast.success('Транскрипт скопирован');
  };

  const handleCopySegment = (segment: TranscriptSegment) => {
    const text = `[${segment.timestamp}] ${segment.speaker}: ${segment.text}`;
    navigator.clipboard.writeText(text);
    toast.success('Реплика скопирована');
  };

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-[900px] mx-auto">
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </main>
    );
  }

  if (!meeting) {
    return (
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">Встреча не найдена</h1>
            <p className="text-sm text-muted-foreground mb-6">ID: {meetingId}</p>
            <Button onClick={handleBack} className="gap-2">
              <AltArrowLeftBold size={16} />
              На главную
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="border-b px-8 py-5 shrink-0">
        <div className="max-w-[900px] mx-auto">
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-3 gap-2">
            <AltArrowLeftBold size={16} />
            Назад
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-semibold">{meeting.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                {meeting.created_at && <span>{formatDateTime(meeting.created_at)}</span>}
                {meeting.duration && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(meeting.duration)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[900px] mx-auto">
          <Tabs defaultValue="transcript" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="transcript">Транскрипт</TabsTrigger>
              <TabsTrigger value="summary">Итоги</TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="mt-0">
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <MagniferBold size={18} className="text-muted-foreground" />
                  </div>
                  <Input
                    placeholder="Поиск по транскрипту..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-11 h-12 rounded-xl border-2"
                  />
                </div>
              </div>

              {/* Copy button */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {searchQuery ? `Результаты: "${searchQuery}"` : 'Все реплики'}
                </h2>
                {filteredSegments.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleCopyTranscript} className="gap-2">
                    <CopyBold size={16} />
                    Скопировать всё
                  </Button>
                )}
              </div>

              {/* Transcript segments */}
              {filteredSegments.length === 0 ? (
                <div className="rounded-2xl p-12 text-center bg-muted/30 border-2 border-dashed">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'Ничего не найдено' : 'Транскрипт пуст'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSegments.map((segment) => (
                    <div
                      key={segment.id}
                      className="group relative p-5 rounded-2xl bg-card border-2 border-border hover:border-primary/50 transition-all"
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${getSpeakerColor(
                            segment.speaker
                          )}`}
                        >
                          {getSpeakerInitials(segment.speaker)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold text-sm">{segment.speaker}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {segment.timestamp}
                            </span>
                          </div>
                          <p className="text-[15px] leading-relaxed">{segment.text}</p>
                        </div>

                        {/* Copy button */}
                        <button
                          onClick={() => handleCopySegment(segment)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-2 hover:bg-muted rounded-lg"
                        >
                          <CopyBold size={16} className="text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="summary" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Итоги встречи</h2>
                {meeting.summary && (
                  <Button variant="ghost" size="sm" onClick={handleCopySummary} className="gap-2">
                    <CopyBold size={16} />
                    Скопировать
                  </Button>
                )}
              </div>

              {meeting.summary ? (
                <div className="rounded-2xl p-6 bg-card border-2">
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {meeting.summary}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl p-12 text-center bg-muted/30 border-2 border-dashed">
                  <p className="text-sm text-muted-foreground mb-2">Итоги ещё не готовы</p>
                  <p className="text-xs text-muted-foreground/70">
                    Обработка может занять несколько минут
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

export default function MeetingDetails() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      }
    >
      <MeetingDetailsContent />
    </Suspense>
  );
}
