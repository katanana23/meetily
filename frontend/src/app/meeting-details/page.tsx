'use client';

// Переходник страницы встречи: aid-интерфейс или оригинальный Meetily.
// Оригинал (с BlockNote) грузится лениво, чтобы не утяжелять бандл aid.

import dynamic from 'next/dynamic';
import AidMeetingDetails from '@/aid/pages/MeetingDetails';

const OriginalMeetingDetails = dynamic(() => import('./page-original'), { ssr: false });

export default function MeetingDetails() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalMeetingDetails /> : <AidMeetingDetails />;
}
