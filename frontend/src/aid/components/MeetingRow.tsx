// Строка списка встреч: состояние встречи иконкой и словами, переименование
// прямо в строке, удаление с подтверждением. Кнопки появляются при наведении
// и при фокусе с клавиатуры; те же действия есть в меню по правому клику.
'use client';

import { useEffect, useState } from 'react';
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
import { editableTitle, formatNumber, formatOffset, formatShortDate, formatTime, formatVolume, isAutoTitle, plural, shownTitle } from '@/aid/lib/format';
import type { TranscriptMatch } from '@/aid/lib/transcript-search';
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
  /** В группе «Сегодня» и «Вчера» дата в заголовке группы, в строке только время. */
  timeOnly?: boolean;
  /** Совпадение поиска в тексте встречи: фрагмент с подсветкой под названием. */
  match?: TranscriptMatch | null;
}

export function MeetingRow({ meeting, onRename, onDelete, onOpenFolder, timeOnly, match }: MeetingRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Встреча открывается: шеврон меняется на спиннер сразу после клика. Страница
  // встречи может грузиться заметное время (в разработке Next её компилирует),
  // и без отклика клик выглядел несработавшим. Через 15 с состояние сбрасывается.
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setOpening(false), 15_000);
    return () => clearTimeout(timer);
  }, [opening]);
  const d = meeting.details;
  const shown = shownTitle(meeting.title, d?.contentTitle);
  const kind = d?.status ?? 'unknown';
  const status = kind !== 'unknown' ? STATUS[kind] : null;
  // Дата не повторяется, если название и так «Встреча 3 ноября, 11:37»
  const titleIsDate = isAutoTitle(meeting.title) && !d?.contentTitle;
  const date = meeting.created_at && !titleIsDate ? (timeOnly ? formatTime(meeting.created_at) : formatShortDate(meeting.created_at)) : null;
  // Полезное вместо «Только транскрипт»: длительность и объём. «Итоги готовы» словами
  // не повторяется в каждой строке: это знак Sparkle, подпись есть у диктора
  const volume = kind === 'transcript' || kind === 'summary' || kind === 'summarizing' ? formatVolume(d?.durationSec, d?.words) : null;
  const label = kind === 'transcript' || kind === 'summary' ? null : status?.label;
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
            setOpening(true);
            openMeeting(router.push, meeting.id);
          }}
          aria-busy={opening || undefined}
          className={cn(
            'group relative flex min-h-[64px] cursor-pointer select-none items-center gap-2 rounded-nested pr-3 transition-colors hover:bg-muted has-[:focus-visible]:bg-muted data-[state=open]:bg-muted',
            opening && 'bg-muted',
          )}
        >
          <Link
            href={meetingHref(meeting.id)}
            // WebKit на macOS даёт тянуть ссылку: лёгкое движение при нажатии начинает
            // перетаскивание вместо клика (в Tauri его ещё перехватывает обработчик файлов)
            draggable={false}
            onClick={(e) => {
              // Страховка: если переход внутри приложения не случится, откроем страницу напрямую
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                setOpening(true);
                guardNavigation(meetingHref(meeting.id));
              }
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
              {/* Разделители для диктора: иначе имя ссылки читается слитно, «НазваниеСегодня, 10:00» */}
              {kind === 'summary' && <span className="sr-only">, {t('statusSummary')}</span>}
              {meta && (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  <span className="sr-only">, </span>
                  {meta}
                </span>
              )}
              {match && (
                <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground" data-aid-match>
                  <span className="sr-only">, {t('foundInText')}: </span>
                  {match.start !== null && <span className="tabular mr-1.5 text-xs">{formatOffset(match.start)}</span>}
                  {match.before}
                  <mark className="rounded-[3px] bg-primary/20 text-foreground">{match.hit}</mark>
                  {match.after}
                  {match.hits > 1 && <span className="ml-1.5 whitespace-nowrap text-xs">ещё в {formatNumber(match.hits - 1)} {plural(match.hits - 1, 'реплике', 'репликах', 'репликах')}</span>}
                </span>
              )}
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
          {/* Шеврон: исключение из правила fill (CLAUDE.md); пока встреча открывается, спиннер */}
          {opening ? (
            <Spinner size={16} label={t('opening')} />
          ) : (
            <CaretRight weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
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
