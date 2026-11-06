// Тосты оригинала в интерфейсе Aid. Оригинальные хуки зовут toast из sonner
// с английским текстом; здесь методы toast оборачиваются один раз при загрузке
// Aid: текст переводится, лишние действия убираются, а тосты, которые Aid
// показывает по-своему, не всплывают. Файлы оригинала не меняются.
'use client';

import { toast, type ExternalToast } from 'sonner';
import { translate } from './legacy-i18n';

type Message = Parameters<typeof toast>[0];
type Method = 'success' | 'error' | 'info' | 'warning' | 'message' | 'loading' | 'custom';

/**
 * Тосты, которые в Aid не нужны:
 * - «Recording saved successfully!»: после сохранения Aid сам открывает встречу,
 *   экран записи пишет «Встреча сохранена», а кнопка «View Meeting» вела бы туда же;
 * - «🔴 Recording Started»: напоминание предупредить участников показывается
 *   на экране записи (RecordingView), а не поверх него.
 */
const SUPPRESSED = new Set(['Recording saved successfully!', '🔴 Recording Started']);

/** Действия, которые повторяют уже сделанный переход. */
const REDUNDANT_ACTIONS = new Set(['View Meeting']);

function tr(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return translate(value) ?? value;
}

function adaptOptions(data?: ExternalToast): ExternalToast | undefined {
  if (!data) return data;
  const next: ExternalToast = { ...data, description: tr(data.description) as ExternalToast['description'] };
  // позиция одна для всех уведомлений: её задаёт AidToaster
  delete next.position;
  const action = data.action as { label?: unknown } | undefined;
  if (action && typeof action.label === 'string') {
    if (REDUNDANT_ACTIONS.has(action.label)) delete next.action;
    else next.action = { ...(data.action as object), label: tr(action.label) } as ExternalToast['action'];
  }
  return next;
}

let installed = false;

export function installAidToasts() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const t = toast as unknown as Record<Method, (m: Message, d?: ExternalToast) => string | number>;
  (['success', 'error', 'info', 'warning', 'message', 'loading', 'custom'] as Method[]).forEach((method) => {
    const original = t[method].bind(toast);
    t[method] = (message: Message, data?: ExternalToast) => {
      if (typeof message === 'string' && SUPPRESSED.has(message)) return '';
      return original(tr(message) as Message, adaptOptions(data));
    };
  });

  // useRecordingStart при старте из трея показывает нативный alert на английском.
  // Только эту строку переводим в наш тост, остальные alert не трогаем.
  const nativeAlert = window.alert.bind(window);
  window.alert = (message?: unknown) => {
    const text = String(message ?? '');
    const prefix = 'Failed to start recording.';
    if (text.startsWith(prefix)) {
      toast.error('Запись не началась', { description: text.slice(prefix.length).trim() || undefined });
      return;
    }
    nativeAlert(message);
  };
}

/** Тосты самого Aid: те же правила длительности и позиции. */
export const aidToast = toast;
