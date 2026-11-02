// Данные экрана «Встреча»: метаданные, транскрипт постранично, итоги.
// Только команды ядра, которые уже вызывает оригинальный интерфейс,
// с теми же именами и аргументами.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BlockNoteBlock, Transcript } from '@/types';
import {
  detectAndCacheSummaryLanguage,
  readCachedDetectedSummaryLanguage,
  readMeetingSummaryLanguage,
} from '@/lib/summary-language-preferences';
import { formatOffset } from './format';

// ---------- реплики ----------

export interface Segment {
  id: string;
  speaker: string | null;
  text: string;
  /** секунды от начала записи */
  start: number | null;
  /** «стеночное» время HH:MM:SS, если нет start */
  clock: string | null;
}

// В модели данных ядра у реплики нет поля спикера. Если текст начинается
// с «Имя: », считаем это подписью спикера (так приходят транскрипты с диаризацией).
const SPEAKER_PREFIX = /^([A-ZА-ЯЁ][^:\n]{0,39}):\s+([\s\S]+)$/;

export function toSegment(t: Transcript): Segment {
  const raw = (t.text ?? '').trim();
  const match = raw.match(SPEAKER_PREFIX);
  const looksLikeName = match && match[1].split(/\s+/).length <= 4 && !/[.!?]/.test(match[1]);
  return {
    id: t.id,
    speaker: looksLikeName ? match![1].trim() : null,
    text: looksLikeName ? match![2].trim() : raw,
    start: typeof t.audio_start_time === 'number' ? t.audio_start_time : null,
    clock: t.timestamp || null,
  };
}

export function segmentTime(s: Segment): string {
  return s.start != null ? formatOffset(s.start) : (s.clock ?? '');
}

export function transcriptAsText(segments: Segment[]): string {
  return segments
    .map((s) => {
      const time = segmentTime(s);
      const who = s.speaker ? `${s.speaker}: ` : '';
      return `${time ? `[${time}] ` : ''}${who}${s.text}`;
    })
    .join('\n');
}

export function transcriptAsMarkdown(title: string, segments: Segment[]): string {
  const lines = segments.map((s) => {
    const time = segmentTime(s);
    const who = s.speaker ? `**${s.speaker}:**` : '';
    const head = [time && `\`${time}\``, who].filter(Boolean).join(' ');
    return `${head ? `${head} ` : ''}${s.text}`;
  });
  return `# ${title}\n\n## Транскрипт\n\n${lines.join('\n\n')}\n`;
}

// ---------- итоги ----------

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object') {
        const node = c as { text?: unknown; content?: unknown; styles?: { bold?: boolean } };
        const text = typeof node.text === 'string' ? node.text : inlineText(node.content);
        return node.styles?.bold ? `**${text}**` : text;
      }
      return '';
    })
    .join('');
}

function blocksToMarkdown(blocks: BlockNoteBlock[], depth = 0): string {
  const out: string[] = [];
  const indent = '  '.repeat(depth);
  for (const b of blocks) {
    const text = inlineText(b.content);
    switch (b.type) {
      case 'heading': {
        const level = Math.min(Math.max(Number(b.props?.level) || 2, 1), 4);
        out.push(`${'#'.repeat(level)} ${text}`);
        break;
      }
      case 'bulletListItem':
        out.push(`${indent}- ${text}`);
        break;
      case 'numberedListItem':
        out.push(`${indent}1. ${text}`);
        break;
      case 'checkListItem':
        out.push(`${indent}- [${b.props?.checked ? 'x' : ' '}] ${text}`);
        break;
      default:
        if (text.trim()) out.push(`${indent}${text}`);
    }
    if (b.children?.length) out.push(blocksToMarkdown(b.children, depth + 1));
  }
  return out.join('\n');
}

/**
 * Приводит данные итогов из api_get_summary к Markdown.
 * Ядро хранит три формата: markdown, summary_json (блоки BlockNote) и старые секции.
 */
export function summaryToMarkdown(data: unknown): string | null {
  let value = data;
  if (typeof data === 'string') {
    try {
      value = JSON.parse(data);
    } catch {
      return data.trim() ? data : null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  if (typeof obj.markdown === 'string' && obj.markdown.trim()) return obj.markdown.trim();
  if (Array.isArray(obj.summary_json) && obj.summary_json.length) {
    const md = blocksToMarkdown(obj.summary_json as BlockNoteBlock[]).trim();
    if (md) return md;
  }

  // старый формат: { Секция: { title, blocks: [{ content }] } }
  const order = Array.isArray(obj._section_order) ? (obj._section_order as string[]) : Object.keys(obj);
  const parts: string[] = [];
  for (const key of order) {
    if (key === 'MeetingName' || key === '_section_order') continue;
    const section = obj[key] as { title?: string; blocks?: Array<{ content?: string }> } | undefined;
    const items = (section?.blocks ?? []).map((b) => b?.content?.trim()).filter(Boolean) as string[];
    if (!items.length) continue;
    parts.push(`## ${section?.title || key}\n${items.map((i) => `- ${i}`).join('\n')}`);
  }
  return parts.length ? parts.join('\n\n') : null;
}

/** Markdown → обычный текст для кнопки «Копировать». */
export function markdownToPlain(md: string): string {
  return md
    .split('\n')
    .filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line)) // разделители таблиц
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+\[( |x)\]\s+/i, (_m, c) => (c.trim() ? '✓ ' : '• '))
        .replace(/^(\s*)[-*+]\s+/, '$1• ')
        .replace(/^\s*\|(.*)\|\s*$/, (_m, row: string) => row.split('|').map((c) => c.trim()).join(' · '))
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- ошибки ----------

export interface FriendlyError {
  message: string;
  raw: string;
}

/** Переводит текст ошибки ядра в понятную фразу; исходный текст остаётся в «Подробностях». */
export function friendlyError(error: unknown, fallback: string): FriendlyError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  let message = fallback;
  if (lower.includes('database is locked')) {
    message = 'База встреч сейчас занята другим процессом. Закройте другие окна Aid Meetings и нажмите «Повторить».';
  } else if (lower.includes('no rows returned') || lower.includes('model not configured') || lower.includes('not configured')) {
    message = 'Модель для итогов не выбрана. Откройте «Настройки» и выберите модель.';
  } else if (lower.includes('connection refused') || lower.includes('ollama') || lower.includes('error sending request')) {
    message = 'Модель недоступна: не удалось подключиться. Проверьте, что Ollama запущена, или выберите другую модель в настройках.';
  } else if (lower.includes('permission denied')) {
    message = 'Нет доступа к файлам приложения. Проверьте права на папку с данными.';
  } else if (lower.includes('disk') || lower.includes('no space')) {
    message = 'Не получилось записать на диск. Проверьте свободное место.';
  }
  return { message, raw };
}

// ---------- загрузка встречи ----------

interface MeetingMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  folder_path?: string | null;
}

interface TranscriptPage {
  transcripts: Transcript[];
  total_count: number;
  has_more: boolean;
}

interface SummaryResponse {
  status: string;
  data?: unknown;
  error?: string | null;
}

export type SummaryState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'processing' }
  | { kind: 'ready'; markdown: string }
  | { kind: 'failed'; error: FriendlyError };

export type MeetingState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: FriendlyError }
  | { kind: 'ready'; meta: MeetingMetadata };

const PAGE = 200;
const PROCESSING = ['processing', 'pending', 'started', 'running', 'summarizing', 'regenerating'];

function summaryStateFrom(res: SummaryResponse | null): SummaryState {
  if (!res) return { kind: 'empty' };
  const status = (res.status || '').toLowerCase();
  if (PROCESSING.includes(status)) return { kind: 'processing' };
  if (status === 'completed') {
    const markdown = summaryToMarkdown(res.data);
    return markdown ? { kind: 'ready', markdown } : { kind: 'empty' };
  }
  if (status === 'failed' || status === 'error') {
    return { kind: 'failed', error: friendlyError(res.error, 'Модель не смогла собрать итоги. Попробуйте ещё раз.') };
  }
  // idle, cancelled и всё незнакомое: итогов нет
  const markdown = summaryToMarkdown(res.data);
  return markdown ? { kind: 'ready', markdown } : { kind: 'empty' };
}

function isNotFound(error: unknown) {
  return String(error).toLowerCase().includes('not found');
}

export function useMeeting(meetingId: string | null) {
  const [meeting, setMeeting] = useState<MeetingState>({ kind: 'loading' });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ kind: 'loading' });
  const request = useRef(0);
  const offset = useRef(0);
  const poll = useRef<ReturnType<typeof setTimeout>>();

  const stopPolling = () => clearTimeout(poll.current);

  const fetchSummary = useCallback(async (id: string, req: number) => {
    try {
      const res = await invoke<SummaryResponse | null>('api_get_summary', { meetingId: id });
      if (req !== request.current) return;
      const next = summaryStateFrom(res);
      setSummary(next);
      if (next.kind === 'processing') {
        poll.current = setTimeout(() => void fetchSummary(id, req), 2000);
      }
    } catch (error) {
      if (req !== request.current) return;
      setSummary({ kind: 'failed', error: friendlyError(error, 'Не удалось загрузить итоги.') });
    }
  }, []);

  const load = useCallback(async () => {
    if (!meetingId) {
      setMeeting({ kind: 'not-found' });
      return;
    }
    const req = ++request.current;
    stopPolling();
    offset.current = 0;
    setMeeting({ kind: 'loading' });
    setSummary({ kind: 'loading' });
    setSegments([]);
    setDuration(null);

    try {
      const [meta, page] = await Promise.all([
        invoke<MeetingMetadata>('api_get_meeting_metadata', { meetingId }),
        invoke<TranscriptPage>('api_get_meeting_transcripts', { meetingId, limit: PAGE, offset: 0 }),
      ]);
      if (req !== request.current) return;
      const list = page.transcripts ?? [];
      setSegments(list.map(toSegment));
      setTotal(page.total_count ?? list.length);
      setHasMore(Boolean(page.has_more));
      offset.current = list.length;
      setMeeting({ kind: 'ready', meta });

      // длительность: конец последней реплики; для длинных встреч дочитываем одну последнюю
      let last: Transcript | undefined = list[list.length - 1];
      if (page.has_more && page.total_count > list.length) {
        const tail = await invoke<TranscriptPage>('api_get_meeting_transcripts', {
          meetingId,
          limit: 1,
          offset: page.total_count - 1,
        }).catch(() => null);
        last = tail?.transcripts?.[0] ?? last;
      }
      if (req === request.current) setDuration(last?.audio_end_time ?? null);
    } catch (error) {
      if (req !== request.current) return;
      setMeeting(isNotFound(error) ? { kind: 'not-found' } : { kind: 'error', error: friendlyError(error, 'Не удалось открыть встречу.') });
      return;
    }

    void fetchSummary(meetingId, req);
  }, [meetingId, fetchSummary]);

  useEffect(() => {
    void load();
    return () => {
      request.current++;
      stopPolling();
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!meetingId || loadingMore || !hasMore) return;
    const req = request.current;
    setLoadingMore(true);
    try {
      const page = await invoke<TranscriptPage>('api_get_meeting_transcripts', {
        meetingId,
        limit: PAGE,
        offset: offset.current,
      });
      if (req !== request.current) return;
      const list = page.transcripts ?? [];
      offset.current += list.length;
      setSegments((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...list.map(toSegment).filter((s) => !seen.has(s.id))];
      });
      setHasMore(Boolean(page.has_more));
    } catch (error) {
      console.error('[aid] Не удалось дочитать транскрипт:', error);
      setHasMore(false);
    } finally {
      if (req === request.current) setLoadingMore(false);
    }
  }, [meetingId, loadingMore, hasMore]);

  /** Весь транскрипт целиком: для копирования и для генерации итогов. */
  const loadAll = useCallback(async (): Promise<Segment[]> => {
    if (!meetingId) return [];
    if (!hasMore) return segments;
    const all: Transcript[] = [];
    let from = 0;
    for (;;) {
      const page = await invoke<TranscriptPage>('api_get_meeting_transcripts', { meetingId, limit: 1000, offset: from });
      all.push(...(page.transcripts ?? []));
      from += page.transcripts?.length ?? 0;
      if (!page.has_more || !page.transcripts?.length) break;
    }
    return all.map(toSegment);
  }, [meetingId, hasMore, segments]);

  const generateSummary = useCallback(async () => {
    if (!meetingId) return;
    const req = request.current;
    setSummary({ kind: 'processing' });
    try {
      const all = await loadAll();
      const texts = all.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text));
      const text = texts.join('\n');
      if (!text.trim()) throw new Error('В транскрипте нет текста, итоги собирать не из чего.');

      const config = await invoke<{ provider?: string; model?: string } | null>('api_get_model_config');
      if (!config?.provider || !config?.model) throw new Error('model not configured');

      let summaryLanguage: string | null = null;
      try {
        summaryLanguage =
          (await readMeetingSummaryLanguage(meetingId)).language ??
          (await readCachedDetectedSummaryLanguage(meetingId)) ??
          (await detectAndCacheSummaryLanguage(meetingId, texts)).language ??
          null;
      } catch {
        summaryLanguage = null; // ядро выберет язык само
      }

      await invoke('api_process_transcript', {
        text,
        model: config.provider,
        modelName: config.model,
        meetingId,
        chunkSize: 40000,
        overlap: 1000,
        customPrompt: '',
        templateId: 'standard_meeting',
        summaryLanguage,
      });
      if (req !== request.current) return;
      stopPolling();
      poll.current = setTimeout(() => void fetchSummary(meetingId, req), 1500);
    } catch (error) {
      if (req !== request.current) return;
      setSummary({ kind: 'failed', error: friendlyError(error, 'Не получилось запустить сбор итогов.') });
    }
  }, [meetingId, loadAll, fetchSummary]);

  /** Новое название после переименования (команда в meeting-actions.ts). */
  const setTitle = useCallback((title: string) => {
    setMeeting((prev) => (prev.kind === 'ready' ? { kind: 'ready', meta: { ...prev.meta, title } } : prev));
  }, []);

  return {
    meeting,
    segments,
    setTitle,
    total,
    hasMore,
    loadingMore,
    loadMore,
    loadAll,
    duration,
    summary,
    generateSummary,
    retry: load,
  };
}
