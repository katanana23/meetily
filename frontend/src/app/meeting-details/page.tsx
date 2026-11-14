'use client';

// Переходник страницы встречи: shade-интерфейс или оригинальный Meetily.
// Оригинал (с BlockNote) грузится лениво, чтобы не утяжелять бандл shade.

import dynamic from 'next/dynamic';
import ShadeMeetingDetails from '@/shade/pages/MeetingDetails';

// В интерфейсе Shade условие постоянно (next.config.js env), и ветка оригинала не компилируется
const OriginalMeetingDetails =
  process.env.NEXT_PUBLIC_UI === 'original' ? dynamic(() => import('./page-original'), { ssr: false }) : () => null;

export default function MeetingDetails() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalMeetingDetails /> : <ShadeMeetingDetails />;
}
