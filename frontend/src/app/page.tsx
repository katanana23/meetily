'use client';

// Переключатель интерфейса: original или aid.
// Управляется переменной окружения NEXT_PUBLIC_UI (по умолчанию aid).

import { useSearchParams } from 'next/navigation';
import OriginalHome from './page-original';
import AidHome from '@/aid/pages/Home';
import AidRecording from '@/aid/pages/Recording';
import { useRecordingState } from '@/contexts/RecordingStateContext';

export default function Home() {
  const searchParams = useSearchParams();
  const { isRecording } = useRecordingState();

  const ui = process.env.NEXT_PUBLIC_UI || 'aid';
  const recordingParam = searchParams.get('recording');

  // Оригинальный интерфейс
  if (ui === 'original') {
    return <OriginalHome />;
  }

  // Aid интерфейс: главная или запись
  if (isRecording || recordingParam === 'true') {
    return <AidRecording />;
  }

  return <AidHome />;
}
