// Поиск по содержанию встреч на главной.
//
// Команда ядра api_search_transcripts для русского текста не подходит: SQLite
// LOWER() и LIKE без ICU сравнивают регистр только у латиницы («привет» не
// находит «Привет»), а фрагмент вокруг совпадения режется по байтам и на
// кириллице может уронить команду. Ядро не меняем, поэтому ищем здесь, по
// репликам, которые список уже прочитал для подробностей строки
// (meeting-details-cache.ts): без лишних запросов к ядру.
'use client';

import { normalizeForSearch, type SearchableLine } from './meeting-details-cache';

export interface TranscriptMatch {
  /** Текст до совпадения, совпадение и после: для подсветки в строке списка. */
  before: string;
  hit: string;
  after: string;
  /** Секунда реплики от начала записи. */
  start: number | null;
  /** Сколько реплик содержат запрос. */
  hits: number;
}

const BEFORE = 48;
const AFTER = 96;

/** Первое совпадение в репликах встречи и число реплик с ним; null, если нет. */
export function findInTranscript(lines: SearchableLine[] | null, query: string): TranscriptMatch | null {
  const q = normalizeForSearch(query.trim());
  if (!lines || q.length < 2) return null;
  let first: { line: SearchableLine; at: number } | null = null;
  let hits = 0;
  for (const line of lines) {
    const at = line.norm.indexOf(q);
    if (at < 0) continue;
    hits++;
    if (!first) first = { line, at };
  }
  if (!first) return null;
  const { line, at } = first;
  // Нормализация сохраняет длину строки для кириллицы и латиницы; на всякий случай
  // режем по исходному тексту только если длины совпали
  const text = line.text.length === line.norm.length ? line.text : line.norm;
  let from = Math.max(0, at - BEFORE);
  // Начало фрагмента по границе слова
  if (from > 0) {
    const space = text.indexOf(' ', from);
    if (space !== -1 && space < at) from = space + 1;
  }
  let to = Math.min(text.length, at + q.length + AFTER);
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    if (space > at + q.length) to = space;
  }
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    hit: text.slice(at, at + q.length),
    after: text.slice(at + q.length, to) + (to < text.length ? '…' : ''),
    start: line.start,
    hits,
  };
}
