// Главная страница Aid: бенто-сетка с большой кнопкой записи, импортом и списком встреч.

'use client';

import { useEffect, useState } from 'react';
import { Mic, Upload, Search, Play } from 'lucide-react';
import { BentoCard } from '@/aid/components/BentoCard';
import { PrivacyChip } from '@/aid/components/PrivacyChip';
import { t } from '@/aid/strings';
import { formatDate, formatDuration } from '@/aid/lib/format';
import { getCombinedPrivacy } from '@/aid/lib/privacy';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useRouter } from 'next/navigation';

export default function AidHome() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const { modelConfig: summaryModelConfig, transcriptModelConfig } = useConfig();
  const { isRecording } = useRecordingState();
  const [isLoading] = useState(false);

  const privacyLevel = getCombinedPrivacy(
    transcriptModelConfig?.provider,
    summaryModelConfig?.provider
  );

  const recentMeetings = meetings.slice(0, 6);

  useEffect(() => {
    // Если идёт запись, перейти на страницу записи
    if (isRecording) {
      router.push('/?recording=true');
    }
  }, [isRecording, router]);

  const handleStartRecording = () => {
    // Логика старта записи через существующий контекст
    router.push('/?recording=true');
  };

  const handleImportAudio = () => {
    // TODO: открыть диалог импорта
    console.log('Import audio');
  };

  const handleSearch = () => {
    // TODO: открыть панель поиска
    console.log('Search');
  };

  return (
    <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Шапка */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight">{t('homeTitle')}</h1>
            <PrivacyChip level={privacyLevel} />
          </div>

          {/* Бенто-сетка */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Главная кнопка: Начать запись */}
            <BentoCard
              className="md:col-span-2 lg:row-span-2 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20"
              interactive
              onClick={handleStartRecording}
            >
              <div className="flex flex-col items-center justify-center h-full min-h-[320px] space-y-6">
                <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center">
                  <Mic className="w-12 h-12 text-accent" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-semibold">{t('startRecording')}</h2>
                  <p className="text-muted-foreground max-w-sm">
                    Зафиксируйте встречу с автоматической расшифровкой и итогами
                  </p>
                </div>
              </div>
            </BentoCard>

            {/* Импорт аудио */}
            <BentoCard interactive onClick={handleImportAudio}>
              <div className="flex flex-col items-center justify-center h-full min-h-[150px] space-y-4">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <h3 className="text-lg font-medium">{t('importAudio')}</h3>
              </div>
            </BentoCard>

            {/* Поиск */}
            <BentoCard interactive onClick={handleSearch}>
              <div className="flex flex-col items-center justify-center h-full min-h-[150px] space-y-4">
                <Search className="w-10 h-10 text-muted-foreground" />
                <h3 className="text-lg font-medium">{t('searchMeetings')}</h3>
              </div>
            </BentoCard>
          </div>

          {/* Последние встречи */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{t('recentMeetings')}</h2>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 bg-muted/50 animate-pulse rounded-[1.25rem]" />
                ))}
              </div>
            ) : recentMeetings.length === 0 ? (
              <BentoCard>
                <div className="text-center py-12 space-y-2">
                  <p className="text-muted-foreground">{t('noMeetings')}</p>
                  <p className="text-sm text-muted-foreground">{t('noMeetingsHint')}</p>
                </div>
              </BentoCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentMeetings.map((meeting) => (
                  <BentoCard
                    key={meeting.id}
                    interactive
                    onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                    className="hover:border-accent/30"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Play className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <h3 className="font-medium line-clamp-2 leading-snug">{meeting.title}</h3>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatDate((meeting as any).created_at || '')}</span>
                        {(meeting as any).duration && <span>{formatDuration((meeting as any).duration)}</span>}
                      </div>
                    </div>
                  </BentoCard>
                ))}
              </div>
            )}
          </div>
        </div>
    </main>
  );
}
