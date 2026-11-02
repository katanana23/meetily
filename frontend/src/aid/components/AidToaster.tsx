// Уведомления Aid: sonner в наших токенах и теме, справа снизу,
// крестик справа. Тосты оригинала проходят через installAidToasts.
'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { getStoredTheme, onThemeChange, type ThemeMode } from '@/aid/lib/theme';
import { installAidToasts } from '@/aid/lib/toasts';

installAidToasts();

export function AidToaster() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    setTheme(getStoredTheme());
    return onThemeChange(setTheme);
  }, []);

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      duration={5000}
      visibleToasts={3}
      className="aid-toaster"
      toastOptions={{ closeButtonAriaLabel: 'Закрыть уведомление' }}
      containerAriaLabel="Уведомления"
    />
  );
}
