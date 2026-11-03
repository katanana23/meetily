// Строка списка встреч: состояние встречи иконкой и словами, переименование
// прямо в строке, удаление с подтверждением. Кнопки появляются при наведении
// и при фокусе с клавиатуры; те же действия есть в меню по правому клику.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CaretRight,
  ChatText,
  Check,
  SpinnerGap,
  FolderOpen,
  MicrophoneSlash,
  PencilSimple,
  Sparkle,
  Trash,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Input } from '@/aid/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/aid/components/ui/context-menu';
import { displayTitle, formatShortDate, isAutoTitle } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

export type MeetingStatus = 'summary' | 'summarizing' | 'transcript' | 'silent' | 'unknown';

export interface MeetingListItem {
  id: string;
  title: string;
  created_at?: string;
  status: MeetingStatus;
}

const STATUS: Record<Exclude<MeetingStatus, 'unknown'>, { icon: Icon; label: string; className: string }> = {
  summary: { icon: Sparkle, label: t('statusSummary'), className: 'text-primary' },
  summarizing: { icon: SpinnerGap, label: t('statusSummarizing'), className: 'animate-spin text-primary' },
  transcript: { icon: ChatText, label: t('statusTranscript'), className: 'text-muted-foreground' },
  silent: { icon: MicrophoneSlash, label: t('statusSilent'), className: 'text-destructive' },
};

function IconAction({
  label,
  ariaLabel,
  onClick,
  children,
  destructive,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-9 rounded-xl text-muted-foreground [&_svg]:size-4', destructive ? 'hover:text-destructive' : 'hover:text-foreground')}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface MeetingRowProps {
  meeting: MeetingListItem;
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
  onOpenFolder: () => void;
}

export function MeetingRow({ meeting, onRename, onDelete, onOpenFolder }: MeetingRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = displayTitle(meeting.title);
  const status = meeting.status !== 'unknown' ? STATUS[meeting.status] : null;
  const date = meeting.created_at && !isAutoTitle(meeting.title) ? formatShortDate(meeting.created_at) : null;
  const meta = [date, status?.label].filter(Boolean).join(' · ');

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    setValue(shown);
    setEditing(true);
  };

  const save = async () => {
    const next = value.trim();
    if (!next || next === shown || next === meeting.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(next);
      setEditing(false);
    } catch {
      /* тост уже показан, поле остаётся открытым */
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            onBlur={(e) => {
              // уход фокуса на кнопки формы не отменяет правку
              if (!e.currentTarget.form?.contains(e.relatedTarget as Node)) setEditing(false);
            }}
            aria-label={t('meetingTitle')}
            className="h-11 flex-1 text-[15px] font-medium"
            maxLength={200}
            disabled={saving}
          />
          <Button type="submit" size="icon" aria-label={t('save')} disabled={saving}>
            {saving ? <SpinnerGap className="animate-spin" /> : <Check />}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={t('cancel')} onClick={() => setEditing(false)}>
            <X />
          </Button>
        </form>
      </li>
    );
  }

  const StatusIcon = status?.icon;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li className="group relative flex min-h-[72px] items-center gap-2 pr-4 transition-colors hover:bg-muted/60 focus-within:bg-muted/60 data-[state=open]:bg-muted/60">
          <Link
            href={`/meeting-details?id=${encodeURIComponent(meeting.id)}`}
            className="flex min-w-0 flex-1 items-center gap-4 self-stretch rounded-2xl py-4 pl-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {StatusIcon ? (
              <StatusIcon className={cn('size-5 shrink-0', status.className)} aria-hidden />
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{shown}</span>
              {meta && <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>}
            </span>
          </Link>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
            <IconAction label={t('rename')} ariaLabel={`${t('rename')}: ${shown}`} onClick={begin}>
              <PencilSimple />
            </IconAction>
            <IconAction label={t('delete')} ariaLabel={`${t('delete')}: ${shown}`} onClick={onDelete} destructive>
              <Trash />
            </IconAction>
          </div>
          <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={begin}>
          <PencilSimple />
          {t('rename')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpenFolder}>
          <FolderOpen />
          {t('openRecordingFolder')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={onDelete}>
          <Trash />
          {t('delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
