'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OriginalSettings from '../_components/SettingsModal';
import AidSettings from '@/aid/pages/Settings';

function SettingsPageContent() {
  const ui = process.env.NEXT_PUBLIC_UI || 'aid';

  if (ui === 'original') {
    // Возвращаем просто контент без обёртки, т.к. SettingsModal - это страница
    return (
      <div className="h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            {/* Оригинальные настройки */}
          </div>
        </div>
      </div>
    );
  }

  return <AidSettings />;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
