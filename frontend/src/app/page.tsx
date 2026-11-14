'use client';

// Переходник главной: shade-интерфейс или оригинальный Meetily (NEXT_PUBLIC_UI=original).
// Оригинал грузится лениво, чтобы его код не попадал в бандл shade.

import dynamic from 'next/dynamic';
import ShadeHome from '@/shade/pages/Home';

// В интерфейсе Shade условие постоянно (next.config.js env), и ветка оригинала не компилируется
const OriginalHome =
  process.env.NEXT_PUBLIC_UI === 'original' ? dynamic(() => import('./page-original'), { ssr: false }) : () => null;

export default function Home() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalHome /> : <ShadeHome />;
}
