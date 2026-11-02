// Пара кнопок: «Копировать» (обычный текст) и «Как Markdown».
// После нажатия кнопка две секунды показывает «Скопировано».
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, FileMd } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/aid/components/ui/button';
import { t } from '@/aid/strings';

type Format = 'text' | 'markdown';

interface CopyActionsProps {
  /** Что копируем: «итоги», «транскрипт»; попадает в подписи для экранного диктора */
  subject: string;
  getText: () => string | Promise<string>;
  getMarkdown: () => string | Promise<string>;
  disabled?: boolean;
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // запасной путь для окружений без Clipboard API
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyActions({ subject, getText, getMarkdown, disabled }: CopyActionsProps) {
  const [copied, setCopied] = useState<Format | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (format: Format) => {
    let value: string;
    try {
      value = await (format === 'markdown' ? getMarkdown() : getText());
    } catch (error) {
      console.error('[aid] Не удалось подготовить текст для копирования:', error);
      toast.error(t('copyFailed'));
      return;
    }
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast.error(t('copyFailed'));
      return;
    }
    setCopied(format);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => copy('text')} disabled={disabled} aria-label={`${t('copy')} ${subject}`}>
        {copied === 'text' ? <Check /> : <Copy />}
        {copied === 'text' ? t('copied') : t('copy')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => copy('markdown')}
        disabled={disabled}
        aria-label={`${t('copyAsMarkdown')}: ${subject}`}
      >
        {copied === 'markdown' ? <Check /> : <FileMd />}
        {copied === 'markdown' ? t('copied') : t('copyAsMarkdown')}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? t('copied') : ''}
      </span>
    </div>
  );
}
