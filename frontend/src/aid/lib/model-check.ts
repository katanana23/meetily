// Есть ли скачанная модель распознавания: те же команды, что проверяет
// useRecordingStart (transcription-model-readiness). null, если проверить не удалось.
'use client';

import { invoke } from '@tauri-apps/api/core';
import { getProviderCommands } from '@/lib/transcription-model-readiness';

export async function hasTranscriptionModel(): Promise<boolean | null> {
  try {
    const config = await invoke<{ provider?: string } | null>('api_get_transcript_config').catch(() => null);
    const commands = getProviderCommands(config?.provider || 'parakeet');
    if (!commands) return null;
    return await invoke<boolean>(commands.hasAvailableModels);
  } catch {
    return null;
  }
}
