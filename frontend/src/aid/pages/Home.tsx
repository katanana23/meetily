// Главная страница Aid: бенто-сетка 12 колонок, крупная плитка записи, импорт, поиск, список встреч.

'use client';

import { useEffect, useState } from 'react';
import { Mic, Upload, Search } from 'lucide-react';
import { t } from '@/aid/strings';
import { formatDate } from '@/aid/lib/format';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useRouter } from 'next/navigation';

export default function AidHome() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const { isRecording } = useRecordingState();
  const [isLoading] = useState(false);

  const recentMeetings = meetings.slice(0, 6);

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

  const handleSearch = () => {
    router.push('/search');
  };

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1200px] mx-auto space-y-8">
        {/* Бенто-сетка: 12 колонок, gap 16 */}
        <div className="grid grid-cols-12 gap-4">
          {/* Начать запись: 7 колонок, высота 240, сплошной акцент */}
          <button
            onClick={handleStartRecording}
            className="col-span-7 h-[240px] rounded-[24px] bg-accent text-accent-foreground p-8 flex flex-col justify-between items-start hover:opacity-90 transition-opacity"
          >
            {/* Круг с микрофоном вверху слева */}
            <div className="w-[72px] h-[72px] rounded-full bg-accent-foreground/10 flex items-center justify-center">
              <Mic className="w-8 h-8" strokeWidth={1.75} />
            </div>

            {/* Заголовок и подпись внизу слева */}
            <div className="text-left">
              <h2 className="text-[28px] leading-[32px] font-semibold mb-2">
                {t('startRecording')}
              </h2>
              <p className="text-[15px] leading-[22px] opacity-80">
                Расшифровка и итоги после остановки
              </p>
            </div>
          </button>

          {/* Импорт аудио: 5 колонок */}
          <button
            onClick={handleImportAudio}
            className="col-span-5 h-[240px] rounded-[24px] bg-card border border-border p-8 flex flex-col justify-between items-start hover:bg-muted/50 transition-colors"
          >
            <div className="w-[56px] h-[56px] rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-left">
              {t('importAudio')}
            </h3>
          </button>

          {/* Найти встречу: 5 колонок */}
          <button
            onClick={handleSearch}
            className="col-span-5 h-[240px] rounded-[24px] bg-card border border-border p-8 flex flex-col justify-between items-start hover:bg-muted/50 transition-colors"
          >
            <div className="w-[56px] h-[56px] rounded-full bg-muted flex items-center justify-center">
              <Search className="w-6 h-6 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-left">
              {t('searchMeetings')}
            </h3>
          </button>

          {/* Заглушка справа: 7 колонок */}
          <div className="col-span-7 h-[240px] rounded-[24px] bg-card border border-border"></div>
        </div>

        {/* Список встреч */}
        <div className="space-y-4">
          <h2 className="text-page-title">{t('recentMeetings')}</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-[24px]" />
              ))}
            </div>
          ) : recentMeetings.length === 0 ? (
            <div className="rounded-[24px] bg-card border border-border p-12 text-center">
              <p className="text-body text-muted-foreground">{t('noMeetings')}</p>
              <p className="text-meta mt-2">{t('noMeetingsHint')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                  className="rounded-[24px] bg-card border border-border p-6 hover:bg-muted/50 transition-colors text-left"
                >
                  <h3 className="text-body font-medium line-clamp-2 mb-2">{meeting.title}</h3>
                  <p className="text-meta">
                    {formatDate((meeting as any).created_at || '')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
