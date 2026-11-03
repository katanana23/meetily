'use client';

// Переходник главной: aid-интерфейс или оригинальный Meetily (NEXT_PUBLIC_UI=original).
// Оригинал грузится лениво, чтобы его код не попадал в бандл aid.

import dynamic from 'next/dynamic';
import AidHome from '@/aid/pages/Home';

// В интерфейсе Aid условие постоянно (next.config.js env), и ветка оригинала не компилируется
const OriginalHome =
  process.env.NEXT_PUBLIC_UI === 'original' ? dynamic(() => import('./page-original'), { ssr: false }) : () => null;

export default function Home() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalHome /> : <AidHome />;
}
