// Переименование прямо на месте (строка списка и заголовок встречи).
// Поле получает полное название без многоточия. Enter сохраняет, Esc отменяет,
// клик вне поля сохраняет. Если текст не меняли или стёрли, хранимое название
// не трогается. Кнопки 40 px: «Сохранить» в акценте, «Отмена» прозрачная;
// Check и X в начертании bold: залитые в Phosphor нарисованы квадратом.
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Input } from '@/aid/components/ui/input';
import { Spinner } from '@/aid/components/ui/spinner';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

interface InlineRenameProps {
  /** Полный текст для поля (editableTitle). */
  initial: string;
  onSave: (next: string) => Promise<void>;
  onClose: () => void;
  inputClassName?: string;
  className?: string;
}

export function InlineRename({ initial, onSave, onClose, inputClassName, className }: InlineRenameProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const save = async () => {
    if (done.current || saving) return;
    const next = value.trim();
    if (!next || next === initial.trim()) {
      done.current = true;
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      done.current = true;
      onClose();
    } catch {
      /* тост уже показан, поле остаётся открытым */
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    done.current = true;
    onClose();
  };

  // Нажатие на кнопки формы не должно сначала уводить фокус и сохранять по blur
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <form
      className={cn('flex min-w-0 items-center gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        onBlur={(e) => {
          if (e.currentTarget.form?.contains(e.relatedTarget as Node)) return;
          void save();
        }}
        aria-label={t('meetingTitle')}
        className={cn('min-w-0 flex-1', inputClassName)}
        maxLength={200}
        disabled={saving}
      />
      <Button type="submit" size="icon" className="size-10 shrink-0 [&_svg]:size-5" aria-label={t('save')} disabled={saving} onMouseDown={keepFocus}>
        {saving ? <Spinner tone="inherit" /> : <Check weight="bold" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 text-muted-foreground [&_svg]:size-5"
        aria-label={t('cancel')}
        onMouseDown={keepFocus}
        onClick={cancel}
      >
        <X weight="bold" />
      </Button>
    </form>
  );
}
