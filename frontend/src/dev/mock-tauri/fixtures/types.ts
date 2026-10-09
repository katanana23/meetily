// Формы данных, которые отдаёт Rust-ядро. Повторяют типы из src/types и
// src-tauri/src/api, чтобы заглушки возвращали ровно то, что ждут компоненты.

export interface MockTranscript {
  id: string;
  text: string;
  timestamp: string; // «стеночное» время HH:MM:SS
  audio_start_time: number;
  audio_end_time: number;
  duration: number;
  confidence: number;
}

export type MockSummaryStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'error' | 'cancelled';

export interface MockSummary {
  status: MockSummaryStatus;
  markdown?: string;
  error?: string;
  templateId?: string;
  /** id процесса генерации: интерфейс сверяет его с полем start в api_get_summary */
  processId?: string;
}

export interface MockMeeting {
  id: string;
  title: string;
  created_at: string; // ISO
  updated_at: string;
  folder_path: string;
  transcripts: MockTranscript[];
  summary: MockSummary;
  summaryLanguage?: string | null;
}

/** Реплика сценария: спикер, текст, длительность в секундах. */
export type Line = [speaker: string, text: string, seconds?: number];

/**
 * Собирает транскрипт из реплик. Спикер в модели данных приложения
 * отдельного поля не имеет, поэтому он идёт префиксом «Имя: текст».
 */
export function buildTranscript(meetingId: string, startIso: string, lines: Line[], gap = 1.2): MockTranscript[] {
  const start = new Date(startIso);
  let t = 2;
  return lines.map(([speaker, text, seconds], i) => {
    const duration = seconds ?? Math.max(2.5, Math.min(14, text.length / 14));
    const wall = new Date(start.getTime() + t * 1000);
    const seg: MockTranscript = {
      id: `${meetingId}-t${i + 1}`,
      text: `${speaker}: ${text}`,
      timestamp: wall.toTimeString().slice(0, 8),
      audio_start_time: Math.round(t * 10) / 10,
      audio_end_time: Math.round((t + duration) * 10) / 10,
      duration: Math.round(duration * 10) / 10,
      // детерминированный разброс уверенности 0.72–0.98
      confidence: Math.round((0.72 + ((i * 37) % 27) / 100) * 100) / 100,
    };
    t += duration + gap;
    return seg;
  });
}
