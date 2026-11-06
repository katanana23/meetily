// Уведомления Aid: sonner в наших токенах и теме, справа снизу,
// крестик справа. Тосты оригинала проходят через installAidToasts.
'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Bell, Check, Warning } from '@/aid/components/icons';
import { Spinner } from '@/aid/components/ui/spinner';
import { getStoredTheme, onThemeChange, type ThemeMode } from '@/aid/lib/theme';
import { installAidToasts } from '@/aid/lib/toasts';

installAidToasts();

// Иконки уведомлений из того же набора и размера, что во всём Aid (fill, 20 px),
// ожидание тем же Spinner; встроенные иконки sonner другого начертания.
const ICONS = {
  // Без иконок со встроенной подложкой (*Circle, *Square): знак без кружка
  success: <Check weight="bold" className="size-5" />,
  info: <Bell weight="fill" className="size-5" />,
  warning: <Warning weight="fill" className="size-5" />,
  error: <Warning weight="fill" className="size-5" />,
  loading: <Spinner />,
  // Крестик закрытия остаётся тонким из sonner: залитый X в Phosphor нарисован квадратом
};

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
      icons={ICONS}
      duration={5000}
      visibleToasts={3}
      className="aid-toaster"
      toastOptions={{ closeButtonAriaLabel: 'Закрыть уведомление' }}
      containerAriaLabel="Уведомления"
    />
  );
}
