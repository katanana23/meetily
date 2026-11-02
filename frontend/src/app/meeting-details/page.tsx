'use client';

// Переключатель для страницы деталей встречи.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OriginalMeetingDetails from './page-original';
import AidMeetingDetails from '@/aid/pages/MeetingDetails';

function MeetingDetailsContent() {
  const searchParams = useSearchParams();
  const ui = process.env.NEXT_PUBLIC_UI || 'aid';

  if (ui === 'original') {
    return <OriginalMeetingDetails />;
  }

  return <AidMeetingDetails />;
}

export default function MeetingDetails() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MeetingDetailsContent />
    </Suspense>
  );
}
