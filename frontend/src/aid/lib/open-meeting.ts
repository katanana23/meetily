// Открыть встречу. Обычно это переход внутри приложения (Next router).
//
// Страховка (guardNavigation): если адрес за SOFT_MS не сменился, встреча
// открывается обычной загрузкой страницы. В собранном приложении (tauri://,
// статическая выгрузка) это сразу файл meeting-details.html; в разработке
// (pnpm tauri:dev) тот же адрес с dev-сервера. В разработке ждём дольше:
// Next может компилировать страницу при первом переходе (её прогревает
// warmUpRoutes), а перезагрузка посреди компиляции начинала бы всё заново.
// В окне Tauri на macOS переход внутри приложения бывает зависает совсем,
// поэтому без запасного пути строка крутила бы спиннер бесконечно.
//
// Если не помогла и загрузка страницы, вызывается onFail: строка снимает
// спиннер, а пользователь видит уведомление с кнопкой «Скопировать журнал»
// (что было нажато, куда переходили, что вернул журнал nav-debug).
'use client';

import { aidToast } from './toasts';
import { copyToClipboard } from './clipboard';
import { t } from '@/aid/strings';

const DEV = process.env.NODE_ENV === 'development';
/** Сколько ждать перехода внутри приложения до обычной загрузки страницы. */
const SOFT_MS = DEV ? 8000 : 1500;
/** Сколько ждать после обычной загрузки, прежде чем признать, что встреча не открылась. */
const HARD_MS = 8000;

export function meetingHref(id: string): string {
  return `/meeting-details?id=${encodeURIComponent(id)}`;
}

/** Адрес для обычной загрузки: в собранном приложении явный файл статической выгрузки. */
function hardHref(href: string): string {
  const packaged = window.location.protocol === 'tauri:' || window.location.hostname === 'tauri.localhost';
  return packaged ? href.replace(/^\/meeting-details(?=\?|$)/, '/meeting-details.html') : href;
}

function navReport(href: string): string {
  const log = (window as unknown as { __aidNavLog?: unknown[] }).__aidNavLog ?? [];
  return JSON.stringify(
    { href, at: window.location.href, protocol: window.location.protocol, dev: DEV, ua: navigator.userAgent, log: log.slice(-20) },
    null,
    2,
  );
}

function reportFailure(href: string) {
  console.warn(`[aid] Встреча не открылась: ${href}`);
  aidToast.error(t('openMeetingFailed'), {
    description: t('openMeetingFailedHint'),
    duration: 15000,
    action: {
      label: t('copyLog'),
      onClick: () => void copyToClipboard(navReport(href)).then((ok) => ok && aidToast.success(t('copied'))),
    },
  });
}

/** Страховка после клика по ссылке Next: вызвать из onClick ссылки. */
export function guardNavigation(href: string, onFail?: () => void) {
  const started = window.location.href;
  const t0 = Date.now();
  let hard = false;
  const timer = setInterval(() => {
    if (window.location.href !== started) {
      clearInterval(timer); // переход случился
      return;
    }
    const elapsed = Date.now() - t0;
    if (!hard && elapsed >= SOFT_MS) {
      hard = true;
      const target = hardHref(href);
      console.warn(`[aid] Переход к встрече не случился за ${SOFT_MS} мс, открываем страницу напрямую: ${target}`);
      window.location.assign(target);
      return;
    }
    if (hard && elapsed >= SOFT_MS + HARD_MS) {
      clearInterval(timer);
      onFail?.();
      reportFailure(href);
    }
  }, 100);
}

/** Программное открытие встречи (клик по строке мимо ссылки). */
export function openMeeting(push: (href: string) => void, id: string, onFail?: () => void) {
  const href = meetingHref(id);
  push(href);
  guardNavigation(href, onFail);
}

let warmed = false;

/**
 * Только в разработке: заранее скомпилировать страницы встречи и настроек, чтобы
 * первый клик по встрече открывал её сразу. В сборке ничего не делает.
 */
export function warmUpRoutes() {
  if (!DEV || warmed || typeof window === 'undefined') return;
  warmed = true;
  const run = () => {
    for (const path of ['/meeting-details', '/settings']) {
      void fetch(path, { cache: 'no-store' }).catch(() => undefined);
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}
