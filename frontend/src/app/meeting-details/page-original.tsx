'use client';

// Переключатель для страницы деталей встречи.

import { useSearchParams } from 'next/navigation';
import OriginalMeetingDetails from './page-original';
import AidMeetingDetails from '@/aid/pages/MeetingDetails';

export default function MeetingDetails() {
  const ui = process.env.NEXT_PUBLIC_UI || 'aid';

  if (ui === 'original') {
    return <OriginalMeetingDetails />;
  }

  return <AidMeetingDetails />;
}
