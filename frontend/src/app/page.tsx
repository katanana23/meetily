'use client';

// Переходник главной: aid-интерфейс или оригинальный Meetily (NEXT_PUBLIC_UI=original).
// Оригинал грузится лениво, чтобы его код не попадал в бандл aid.

import dynamic from 'next/dynamic';
import AidHome from '@/aid/pages/Home';

const OriginalHome = dynamic(() => import('./page-original'), { ssr: false });

export default function Home() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalHome /> : <AidHome />;
}
