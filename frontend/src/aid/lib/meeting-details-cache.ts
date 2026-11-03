// Сведения для строки списка встреч: состояние итогов, длительность, число слов
// и название из содержания. Транскрипт читается одним запросом (до 5000 реплик)
// не больше чем для 2 встреч одновременно; результат кэшируется по id и числу
// реплик, чтобы возврат к списку не перечитывал всё заново. Тексты реплик
// остаются в памяти для поиска по содержанию встреч (lib/transcript-search.ts).
'use client';

import { invoke } from '@tauri-apps/api/core';
import type { Transcript } from '@/types';
import { toSegment } from './meeting';
import { contentTitle, countWords, isHallucination } from './speech';

export type MeetingStatus = 'summary' | 'summarizing' | 'transcript' | 'silent' | 'unknown';

export interface MeetingDetails {
  status: MeetingStatus;
  /** Секунды: конец последней реплики. */
  durationSec: number | null;
  words: number;
  /** Первые слова первой осмысленной реплики (для автоматических названий). */
  contentTitle: string | null;
}

const SUMMARIZING = ['processing', 'pending', 'started', 'running', 'summarizing', 'regenerating'];
/** Реплика для поиска: текст как есть и нормализованный (нижний регистр, ё → е). */
export interface SearchableLine {
  text: string;
  norm: string;
  /** Секунда от начала записи. */
  start: number | null;
}

const cache = new Map<string, { total: number; details: MeetingDetails; lines: SearchableLine[] }>();

/** Нижний регистр с кириллицей и «ё» как «е»: «Ёлка» находится по «елка». */
export function normalizeForSearch(text: string): string {
  return text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

async function load(meetingId: string): Promise<MeetingDetails> {
  const [summary, page] = await Promise.allSettled([
    invoke<{ status?: string; data?: unknown } | null>('api_get_summary', { meetingId }),
    invoke<{ transcripts?: Transcript[]; total_count?: number }>('api_get_meeting_transcripts', { meetingId, limit: 5000, offset: 0 }),
  ]);
  const st = summary.status === 'fulfilled' ? (summary.value?.status ?? '').toLowerCase() : '';
  const list = page.status === 'fulfilled' ? (page.value?.transcripts ?? []) : [];
  const total = page.status === 'fulfilled' ? (page.value?.total_count ?? list.length) : 0;
  const texts = list.map((t) => toSegment(t).text);
  const words = list.reduce((sum, t) => (isHallucination(t.text ?? '') ? sum : sum + countWords(t.text ?? '')), 0);
  const last = list[list.length - 1];
  let status: MeetingStatus = 'unknown';
  if (SUMMARIZING.includes(st)) status = 'summarizing';
  else if (st === 'completed' && summary.status === 'fulfilled' && summary.value?.data) status = 'summary';
  else if (page.status === 'fulfilled') status = total > 0 ? 'transcript' : 'silent';
  const details: MeetingDetails = {
    status,
    durationSec: typeof last?.audio_end_time === 'number' ? last.audio_end_time : null,
    words,
    contentTitle: contentTitle(texts),
  };
  const lines: SearchableLine[] = list
    .map((t, i) => ({ text: texts[i], start: typeof t.audio_start_time === 'number' ? t.audio_start_time : null }))
    .filter((l) => l.text && !isHallucination(l.text))
    .map((l) => ({ ...l, norm: normalizeForSearch(l.text) }));
  cache.set(meetingId, { total, details, lines });
  return details;
}

/** Реплики встречи для поиска; null, пока подробности не загружены. */
export function cachedLines(meetingId: string): SearchableLine[] | null {
  return cache.get(meetingId)?.lines ?? null;
}

export function cachedDetails(meetingId: string): MeetingDetails | null {
  return cache.get(meetingId)?.details ?? null;
}

/** Загружает сведения по очереди, не больше 2 запросов одновременно; onEach вызывается по готовности. */
export async function loadDetails(ids: string[], onEach: (id: string, d: MeetingDetails) => void, signal: { cancelled: boolean }) {
  const queue = [...ids];
  const worker = async () => {
    while (queue.length && !signal.cancelled) {
      const id = queue.shift()!;
      try {
        const d = await load(id);
        if (!signal.cancelled) onEach(id, d);
      } catch {
        /* строка останется без подробностей */
      }
    }
  };
  // Два запроса одновременно: подробности второстепенны, канал к ядру нужен и переходам
  await Promise.all([worker(), worker()]);
}

/** После переименования или итогов: сбросить кэш встречи. */
export function forgetDetails(meetingId: string) {
  cache.delete(meetingId);
}
