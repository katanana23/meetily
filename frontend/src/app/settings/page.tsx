'use client';

// Переходник настроек: экран Shade или оригинальные настройки Meetily (NEXT_PUBLIC_UI=original).
// Оригинал грузится лениво, чтобы его разметка не попадала в бандл shade.

import dynamic from 'next/dynamic';
import ShadeSettings from '@/shade/pages/Settings';

// В интерфейсе Shade условие постоянно (next.config.js env), и ветка оригинала не компилируется
const OriginalSettings =
  process.env.NEXT_PUBLIC_UI === 'original' ? dynamic(() => import('./page-original'), { ssr: false }) : () => null;

export default function SettingsPage() {
  return process.env.NEXT_PUBLIC_UI === 'original' ? <OriginalSettings /> : <ShadeSettings />;
}
