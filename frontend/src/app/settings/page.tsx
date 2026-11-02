'use client';

// Настройки пока общие для обоих интерфейсов: оригинальная страница работает
// с настоящими командами ядра. В aid-оболочке она получает те же токены.

import OriginalSettings from './page-original';

export default function SettingsPage() {
  return <OriginalSettings />;
}
