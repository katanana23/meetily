// Тосты в интерфейсе Shade. Все уведомления (свои и оригинала) рисует общий
// компонент Notice (ui/notice.tsx), тот же, что у итога записи у капсулы:
// знак в круге 44 px слева, текст, крестик справа, 20 px внутри. Оригинальные
// хуки зовут toast из sonner с английским текстом; здесь методы toast
// оборачиваются один раз при загрузке Shade: текст переводится, лишние действия
// убираются, а тосты, которые Shade показывает по-своему, не всплывают. Файлы
// оригинала не меняются.
'use client';

import * as React from 'react';
import { toast, type ExternalToast } from 'sonner';
import { Bell, Check, Warning } from '@phosphor-icons/react';
import { Button } from '@/shade/components/ui/button';
import { Notice, type NoticeTone } from '@/shade/components/ui/notice';
import { Spinner } from '@/shade/components/ui/spinner';
import { t as shadeT } from '@/shade/strings';
import { translate } from './legacy-i18n';

type Message = Parameters<typeof toast>[0];
type Kind = 'success' | 'error' | 'info' | 'warning' | 'message' | 'loading';
type Method = Kind | 'custom';
type ToastFn = (m: Message, d?: ExternalToast) => string | number;

/**
 * Тосты, которые в Shade не нужны:
 * - «Recording saved successfully!»: после сохранения Shade сам открывает встречу,
 *   экран записи пишет «Встреча сохранена», а кнопка «View Meeting» вела бы туда же;
 * - «🔴 Recording Started»: напоминание предупредить участников показывается
 *   на экране записи (RecordingView), а не поверх него.
 */
const SUPPRESSED = new Set(['Recording saved successfully!', '🔴 Recording Started']);

/** Действия, которые повторяют уже сделанный переход. */
const REDUNDANT_ACTIONS = new Set(['View Meeting']);

// Знак по смыслу из того же набора, что во всём Shade (fill, 20 px; Check bold:
// залитый нарисован квадратом), ожидание тем же Spinner. Сам знак без подложки,
// круг даёт Notice.
const ICON: Record<Kind, React.ReactNode> = {
  success: <Check weight="bold" />,
  info: <Bell weight="fill" />,
  message: <Bell weight="fill" />,
  warning: <Warning weight="fill" />,
  error: <Warning weight="fill" />,
  loading: <Spinner />,
};

const TONE: Record<Kind, NoticeTone> = {
  success: 'success',
  info: 'neutral',
  message: 'neutral',
  warning: 'giants',
  error: 'error',
  loading: 'neutral',
};

function tr(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return translate(value) ?? value;
}

function adaptOptions(data?: ExternalToast): ExternalToast | undefined {
  if (!data) return data;
  const next: ExternalToast = { ...data, description: tr(data.description) as ExternalToast['description'] };
  // позиция одна для всех уведомлений: её задаёт ShadeToaster
  delete next.position;
  const action = data.action as { label?: unknown } | undefined;
  if (action && typeof action.label === 'string') {
    if (REDUNDANT_ACTIONS.has(action.label)) delete next.action;
    else next.action = { ...(data.action as object), label: tr(action.label) } as ExternalToast['action'];
  }
  return next;
}

type ActionObject = { label: React.ReactNode; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void };

function isActionObject(value: unknown): value is ActionObject {
  return typeof value === 'object' && value !== null && 'label' in value && 'onClick' in value;
}

function render(value: unknown): React.ReactNode {
  return typeof value === 'function' ? (value as () => React.ReactNode)() : (value as React.ReactNode);
}

function ShadeToast({ id, kind, title, data }: { id: string | number; kind: Kind; title: React.ReactNode; data?: ExternalToast }) {
  const action = data?.action;
  const close = () => toast.dismiss(id);
  return (
    <Notice
      role={kind === 'error' ? 'alert' : 'status'}
      className="w-full"
      icon={ICON[kind]}
      tone={TONE[kind]}
      title={title}
      hint={render(data?.description) || undefined}
      wrapHint
      actionsPlacement="below"
      actions={
        !action ? undefined : isActionObject(action) ? (
          <Button
            size="sm"
            onClick={(event) => {
              action.onClick(event);
              if (!event.defaultPrevented) close();
            }}
          >
            {action.label}
          </Button>
        ) : (
          (action as React.ReactNode)
        )
      }
      onClose={kind === 'loading' ? undefined : close}
      closeLabel={shadeT('close')}
    />
  );
}

let sonnerCustom: ToastFn | null = null;

/** Показать тост общим компонентом Notice через sonner (toast.custom). */
function show(kind: Kind, message: Message, data?: ExternalToast): string | number {
  const custom = sonnerCustom ?? (toast.custom as unknown as ToastFn);
  const title = render(message);
  const options: ExternalToast = { ...data };
  delete options.description;
  delete options.action;
  delete options.cancel;
  delete options.icon;
  const jsx = (id: string | number) => <ShadeToast id={id} kind={kind} title={title} data={data} />;
  return custom(jsx as unknown as Message, {
    ...options,
    // Ожидание не уходит само: его заменит тост с тем же id или закроет вызывающий код
    duration: kind === 'loading' ? Infinity : data?.duration,
    className: 'shade-notice-toast',
  });
}

let installed = false;

export function installShadeToasts() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const t = toast as unknown as Record<Method, ToastFn>;
  sonnerCustom = t.custom.bind(toast);
  (['success', 'error', 'info', 'warning', 'message', 'loading'] as Kind[]).forEach((kind) => {
    t[kind] = (message: Message, data?: ExternalToast) => {
      if (typeof message === 'string' && SUPPRESSED.has(message)) return '';
      return show(kind, tr(message) as Message, adaptOptions(data));
    };
  });
  // custom оригинала (прогресс загрузки моделей) остаётся его собственной разметкой
  const custom = sonnerCustom;
  t.custom = (message: Message, data?: ExternalToast) => custom(message, adaptOptions(data));

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

/** Тосты самого Shade: те же правила длительности и позиции. */
export const shadeToast = toast;
