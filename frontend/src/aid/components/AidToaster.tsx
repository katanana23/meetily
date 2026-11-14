// Уведомления Aid: sonner в наших токенах и теме. Сами тосты рисует общий компонент Notice
// (ui/notice.tsx, через installAidToasts в lib/toasts.tsx), как итог записи у капсулы.
// Место одно на все уведомления: стопка внизу по центру колонки страницы, над тем, что
// сейчас в доке записи (кнопка, капсула, карточка итога; lib/notice-stack.ts, .aid-toaster в
// globals.css). Тосты раскрыты списком через 8 px (expand, gap), а не сложены колодой друг
// под другом: непрозрачно друг на друга не ложатся. Появление и уход размытием там же.
// ICONS и крестик sonner остаются для toast.promise, если появится.
'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Bell, Check, Warning } from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { getStoredTheme, onThemeChange, type ThemeMode } from '@/aid/lib/theme';
import { installAidToasts } from '@/aid/lib/toasts';
import { STACK_GAP } from '@/aid/lib/notice-stack';

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
      position="bottom-center"
      expand
      gap={STACK_GAP}
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
