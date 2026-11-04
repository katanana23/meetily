// Верхняя полоса окна ShadeNotes: как у оригинала, но в цветах тем (белый фон
// в светлой, чёрный в тёмной). Слева кнопки окна macOS (titleBarStyle Overlay,
// trafficLightPosition x 18, y 22 в tauri.conf.json: центр полосы высотой 44 px),
// за ними маленький знак и название. Вся полоса перетаскивает окно, двойной клик
// разворачивает (drag.js Tauri: атрибут на каждом элементе, клик по вложенному
// без атрибута не тянет окно). В Windows и Linux системная полоса своя, эта не нужна.
'use client';

import { useEffect, useState } from 'react';
import { BrandMark } from './BrandMark';
import { markTitlebarOverlay } from '@/aid/lib/window-theme';
import { t } from '@/aid/strings';

function nativeTitleBar(): boolean {
  if (typeof window === 'undefined') return false;
  const inTauri = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) && !new URLSearchParams(window.location.search).has('mock');
  return inTauri && !/Mac/i.test(navigator.platform || navigator.userAgent);
}

export function TitleBar() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(nativeTitleBar());
    // Страховка к скрипту в <head> (theme.ts): класс отступа за кнопками окна
    markTitlebarOverlay();
  }, []);
  if (hidden) return null;
  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 select-none items-center gap-2 px-4 [.aid-titlebar-overlay_&]:pl-[88px]"
    >
      <span data-tauri-drag-region className="flex items-center">
        <BrandMark size={20} />
      </span>
      <span data-tauri-drag-region className="text-[13px] font-semibold tracking-tight text-foreground">
        {t('appName')}
      </span>
    </header>
  );
}
