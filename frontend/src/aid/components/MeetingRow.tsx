// Строка списка встреч: состояние встречи иконкой и словами, переименование
// прямо в строке, удаление с подтверждением. Кнопки появляются при наведении
// и при фокусе с клавиатуры; те же действия есть в меню по правому клику.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { guardNavigation, meetingHref, openMeeting } from '@/aid/lib/open-meeting';
import {
  CaretRight,
  ChatText,
  FolderOpen,
  MicrophoneSlash,
  PencilSimple,
  Sparkle,
  Trash,
  type Icon,
} from '@phosphor-icons/react';
import { Spinner } from '@/aid/components/ui/spinner';
import { Button } from '@/aid/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/aid/components/ui/context-menu';
import { editableTitle, formatShortDate, formatVolume, isAutoTitle, shownTitle } from '@/aid/lib/format';
import { InlineRename } from '@/aid/components/InlineRename';
import type { MeetingDetails, MeetingStatus } from '@/aid/lib/meeting-details-cache';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

export interface MeetingListItem {
  id: string;
  title: string;
  created_at?: string;
  /** Папка записи из метаданных: по ней узнаются пометки Aid (recording-marks.ts). */
  folder_path?: string | null;
  /** Число реплик; null, если не удалось узнать. 0: запись без текста. */
  transcriptCount?: number | null;
  /** Догружается после списка; null, пока не пришло. */
  details: MeetingDetails | null;
}

const STATUS: Record<Exclude<MeetingStatus, 'unknown'>, { icon: Icon | null; label: string; className: string }> = {
  summary: { icon: Sparkle, label: t('statusSummary'), className: 'text-primary-ink' },
  // Итоги в работе: общий Spinner вместо иконки (см. ниже)
  summarizing: { icon: null, label: t('statusSummarizing'), className: '' },
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
          className={cn('size-9 rounded-full text-muted-foreground hover:bg-input [&_svg]:size-4', destructive ? 'hover:text-destructive' : 'hover:text-foreground')}
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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const d = meeting.details;
  const shown = shownTitle(meeting.title, d?.contentTitle);
  const kind = d?.status ?? 'unknown';
  const status = kind !== 'unknown' ? STATUS[kind] : null;
  // Дата не повторяется, если название и так «Встреча 3 ноября, 11:37»
  const titleIsDate = isAutoTitle(meeting.title) && !d?.contentTitle;
  const date = meeting.created_at && !titleIsDate ? formatShortDate(meeting.created_at) : null;
  // Полезное вместо «Только транскрипт»: длительность и объём; у итогов ещё «Итоги готовы»
  const volume = kind === 'transcript' || kind === 'summary' || kind === 'summarizing' ? formatVolume(d?.durationSec, d?.words) : null;
  const label = kind === 'transcript' ? null : status?.label;
  const meta = [date, volume, label].filter(Boolean).join(' · ');

  const begin = () => setEditing(true);

  if (editing) {
    return (
      <li className="rounded-nested bg-muted p-1">
        <InlineRename
          initial={editableTitle(meeting.title, d?.contentTitle)}
          onSave={onRename}
          onClose={() => setEditing(false)}
          inputClassName="h-11 text-[15px] font-medium"
        />
      </li>
    );
  }

  const StatusIcon = status?.icon;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          // Вся строка открывает встречу: клик по шеврону и полям мимо ссылки тоже.
          // Кнопки действий и поле переименования не открывают (свои обработчики).
          onClick={(e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if ((e.target as HTMLElement).closest('a, button, input, [role="menuitem"]')) return;
            openMeeting(router.push, meeting.id);
          }}
          className="group relative flex min-h-[64px] cursor-pointer select-none items-center gap-2 rounded-nested pr-3 transition-colors hover:bg-muted has-[:focus-visible]:bg-muted data-[state=open]:bg-muted"
        >
          <Link
            href={meetingHref(meeting.id)}
            // WebKit на macOS даёт тянуть ссылку: лёгкое движение при нажатии начинает
            // перетаскивание вместо клика (в Tauri его ещё перехватывает обработчик файлов)
            draggable={false}
            onClick={(e) => {
              // Страховка: если переход внутри приложения не случится, откроем страницу напрямую
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) guardNavigation(meetingHref(meeting.id));
            }}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-nested py-3 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {kind === 'summarizing' ? (
              <Spinner />
            ) : StatusIcon ? (
              <StatusIcon className={cn('size-5 shrink-0', status?.className)} aria-hidden />
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium" title={shown}>{shown}</span>
              {meta && <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>}
            </span>
          </Link>
          {/* Только у строки под курсором или с фокусом от клавиатуры: после клика не залипают */}
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
            <IconAction label={t('rename')} ariaLabel={`${t('rename')}: ${shown}`} onClick={begin}>
              <PencilSimple />
            </IconAction>
            <IconAction label={t('delete')} ariaLabel={`${t('delete')}: ${shown}`} onClick={onDelete} destructive>
              <Trash />
            </IconAction>
          </div>
          {/* Шеврон: единственное исключение из правила fill (CLAUDE.md) */}
          <CaretRight weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
