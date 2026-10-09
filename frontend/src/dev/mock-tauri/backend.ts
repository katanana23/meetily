// «Ядро» в памяти: встречи, резюме, запись, загрузки моделей.
// Состояние живёт до перезагрузки страницы (переходы через router.push его сохраняют).

import { emit } from '@tauri-apps/api/event';
import type { Scenario } from './scenarios';
import { ONBOARDING_DONE_KEY } from './scenarios';
import type { MockMeeting, MockTranscript } from './fixtures/types';
import { LIVE_LINES, LIVE_TITLE } from './fixtures/recording';
import { MOCK_ROOT } from './fixtures/settings';

const pad = (n: number) => String(n).padStart(2, '0');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockBackend {
  readonly scenario: Scenario;
  meetings: MockMeeting[];
  modelsReady: boolean;
  onboardingCompleted: boolean;
  /** Имена событий, которые «ядро» отправило (для отчёта о покрытии). */
  readonly emittedEvents = new Set<string>();

  // --- запись ---
  recording = false;
  paused = false;
  recordingTitle: string | null = null;
  private recStartedAt = 0;
  private pausedTotalMs = 0;
  private pausedAt = 0;
  private seq = 0;
  private lineIdx = 0;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();

  // --- загрузки ---
  private downloads = new Map<string, ReturnType<typeof setInterval>>();

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.meetings = scenario.meetings();
    this.modelsReady = scenario.modelsReady;
    let done = false;
    try {
      done = window.sessionStorage.getItem(ONBOARDING_DONE_KEY) === '1';
    } catch {
      /* sessionStorage недоступен — считаем, что мастер не пройден */
    }
    this.onboardingCompleted = scenario.onboardingCompleted || done;
    if (done) this.modelsReady = true;
  }

  emit(event: string, payload?: unknown) {
    this.emittedEvents.add(event);
    return emit(event, payload);
  }

  // ---------------- встречи ----------------

  find(id: string) {
    return this.meetings.find((m) => m.id === id);
  }

  addMeeting(title: string, transcripts: MockTranscript[], folderPath: string | null): string {
    const id = `mock-new-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    this.meetings.unshift({
      id,
      title,
      created_at: now,
      updated_at: now,
      folder_path: folderPath ?? `${MOCK_ROOT}/recordings/${id}`,
      transcripts: transcripts.map((t, i) => ({ ...t, id: t.id || `${id}-t${i + 1}` })),
      summary: { status: 'idle' },
    });
    return id;
  }

  /** Имитация генерации резюме: processing → completed через 3 секунды. */
  startSummary(meetingId: string, templateId: string | undefined) {
    const m = this.find(meetingId);
    if (!m) return Promise.reject(`Meeting not found: ${meetingId}`);
    const processId = `mock-process-${Date.now().toString(36)}`;
    m.summary = { status: 'processing', templateId, processId };
    setTimeout(() => {
      if (m.summary.status !== 'processing') return; // отменили
      const lines = m.transcripts.slice(0, 6).map((t) => `- ${t.text}`).join('\n');
      m.summary = {
        status: 'completed',
        templateId,
        processId,
        markdown:
          `# ${m.title}\n\n## Сводка\nРезюме сгенерировано заглушкой по шаблону «${templateId ?? 'standard_meeting'}».\n\n` +
          `## Ключевые моменты\n${lines || '- Транскрипт пуст'}\n\n## Задачи\n| **Владелец** | Задача | Срок |\n| --- | --- | --- |\n` +
          `| Команда | Проверить резюме из заглушки | ${new Date().toLocaleDateString('ru-RU')} |`,
      };
      m.updated_at = new Date().toISOString();
    }, 3000);
    return { message: 'Summary generation started (mock)', process_id: processId };
  }

  // ---------------- запись ----------------

  private elapsedSec() {
    if (!this.recording) return 0;
    const pausedNow = this.paused ? Date.now() - this.pausedAt : 0;
    return (Date.now() - this.recStartedAt - this.pausedTotalMs - pausedNow) / 1000;
  }

  recordingState() {
    const total = this.recording ? (Date.now() - this.recStartedAt) / 1000 : null;
    return {
      is_recording: this.recording,
      is_paused: this.paused,
      is_active: this.recording && !this.paused,
      recording_duration: total,
      active_duration: this.recording ? this.elapsedSec() : null,
    };
  }

  async startRecording(meetingName: string | null) {
    if (this.recording) return Promise.reject('Recording already in progress');
    this.recordingTitle = meetingName || LIVE_TITLE;
    await this.emit('recording-starting', { message: 'Recording initialization started' });
    await sleep(400);
    this.beginLive();
    await this.emit('recording-started', { message: 'Recording started', devices: [], workers: 1 });
  }

  /** Запускает «запись» без событий старта (страница открыта посреди записи). */
  beginLive() {
    this.recording = true;
    this.paused = false;
    this.recStartedAt = Date.now();
    this.pausedTotalMs = 0;
    this.seq = 0;
    this.lineIdx = 0;
    this.recordingTitle = this.recordingTitle || LIVE_TITLE;
    this.liveTimer = setInterval(() => this.tick(), 1800);
  }

  private tick() {
    if (!this.recording || this.paused) return;
    const [speaker, text] = LIVE_LINES[this.lineIdx % LIVE_LINES.length];
    this.lineIdx++;
    const end = this.elapsedSec();
    const duration = Math.min(4, Math.max(1.5, text.length / 18));
    const start = Math.max(0, end - duration);
    const now = new Date();
    this.lastActivity = Date.now();
    this.emit('speech-detected', {});
    this.emit('transcript-update', {
      text: `${speaker}: ${text}`,
      timestamp: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      source: 'mixed',
      sequence_id: ++this.seq,
      chunk_start_time: start,
      is_partial: false,
      confidence: 0.8 + ((this.seq * 7) % 19) / 100,
      audio_start_time: Math.round(start * 10) / 10,
      audio_end_time: Math.round(end * 10) / 10,
      duration: Math.round(duration * 10) / 10,
    });
  }

  async pause() {
    if (!this.recording) return Promise.reject('No recording in progress');
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = Date.now();
    }
    await this.emit('recording-paused', {});
  }

  async resume() {
    if (!this.recording) return Promise.reject('No recording in progress');
    if (this.paused) {
      this.pausedTotalMs += Date.now() - this.pausedAt;
      this.paused = false;
    }
    await this.emit('recording-resumed', {});
  }

  async stop() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
    const title = this.recordingTitle;
    const id = `rec-${Date.now().toString(36)}`;
    this.recording = false;
    this.paused = false;
    this.recordingTitle = null;
    this.lastActivity = Date.now() - 10_000;
    await this.emit('recording-stopped', {
      message: 'Recording stopped',
      folder_path: `${MOCK_ROOT}/recordings/${id}`,
      meeting_name: title,
    });
    // recording-stop-complete ядро шлёт только при остановке из трея (tray.rs);
    // при остановке из интерфейса его слать нельзя, иначе встреча сохранится дважды.
    setTimeout(() => this.emit('transcription-complete', {}), 300);
  }

  /** Остановка «из трея»: как tray.rs — stop + событие recording-stop-complete. */
  async stopFromTray() {
    await this.stop();
    setTimeout(() => this.emit('recording-stop-complete', true), 400);
  }

  transcriptionStatus() {
    return { chunks_in_queue: 0, is_processing: false, last_activity_ms: Date.now() - this.lastActivity };
  }

  // ---------------- загрузки моделей ----------------

  /** Имитирует загрузку с событиями прогресса (≈6 секунд). */
  simulateDownload(kind: 'parakeet' | 'whisper' | 'builtin' | 'ollama', modelName: string, totalMb: number) {
    if (this.downloads.has(`${kind}:${modelName}`)) {
      return Promise.reject('Download already in progress');
    }
    let progress = 0;
    const timer = setInterval(() => {
      progress = Math.min(100, progress + 8);
      const done = progress >= 100;
      const mb = Math.round((totalMb * progress) / 100);
      if (kind === 'parakeet') {
        this.emit('parakeet-model-download-progress', {
          modelName, progress, downloaded_mb: mb, total_mb: totalMb, speed_mbps: 42.5,
          status: done ? 'completed' : 'downloading',
        });
        if (done) this.emit('parakeet-model-download-complete', { modelName });
      } else if (kind === 'whisper') {
        this.emit('model-download-progress', { modelName, progress });
        if (done) this.emit('model-download-complete', { modelName });
      } else if (kind === 'ollama') {
        this.emit('ollama-model-download-progress', { modelName, progress });
        if (done) this.emit('ollama-model-download-complete', { modelName });
      } else {
        this.emit('builtin-ai-download-progress', {
          model: modelName, progress, downloaded_mb: mb, total_mb: totalMb, speed_mbps: 38.1,
          status: done ? 'completed' : 'downloading',
        });
      }
      if (done) {
        clearInterval(timer);
        this.downloads.delete(`${kind}:${modelName}`);
        this.modelsReady = true;
      }
    }, 450);
    this.downloads.set(`${kind}:${modelName}`, timer);
    return null;
  }

  // ---------------- уровень звука ----------------

  private levelsTimer: ReturnType<typeof setInterval> | null = null;

  /** Псевдо-уровни для индикатора в выборе устройств (≈10 раз в секунду). */
  startAudioLevels(deviceNames: string[]) {
    this.stopAudioLevels();
    let phase = 0;
    this.levelsTimer = setInterval(() => {
      phase += 1;
      this.emit('audio-levels', {
        timestamp: Date.now(),
        levels: deviceNames.map((device_name, i) => {
          const rms = Math.abs(Math.sin((phase + i * 5) / 4)) * 0.5;
          return { device_name, device_type: i === 0 ? 'Input' : 'Output', rms_level: rms, peak_level: Math.min(1, rms * 1.6), is_active: rms > 0.05 };
        }),
      });
    }, 100);
    return null;
  }

  stopAudioLevels() {
    if (this.levelsTimer) clearInterval(this.levelsTimer);
    this.levelsTimer = null;
    return null;
  }

  cancelDownload(kind: 'parakeet' | 'whisper' | 'builtin', modelName: string) {
    const key = `${kind}:${modelName}`;
    const timer = this.downloads.get(key);
    if (timer) clearInterval(timer);
    this.downloads.delete(key);
    if (kind === 'parakeet') {
      this.emit('parakeet-model-download-progress', { modelName, progress: 0, status: 'cancelled' });
    }
    return 'cancelled';
  }

  isDownloading(kind: string, modelName: string) {
    return this.downloads.has(`${kind}:${modelName}`);
  }
}
