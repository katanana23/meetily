// Определение уровня приватности по провайдерам транскрипции и резюме.

export type PrivacyLevel = 'local' | 'cloud' | 'unknown';

const LOCAL_PROVIDERS = ['ollama', 'builtin-ai', 'builtin_ai', 'whisper', 'parakeet'];
const CLOUD_PROVIDERS = ['claude', 'anthropic', 'groq', 'openrouter', 'openai', 'custom-openai'];

export function getPrivacyLevel(provider: string | null | undefined): PrivacyLevel {
  if (!provider) return 'unknown';

  const normalized = provider.toLowerCase().trim();

  if (LOCAL_PROVIDERS.includes(normalized)) return 'local';
  if (CLOUD_PROVIDERS.includes(normalized)) return 'cloud';

  // Если начинается с http:// или https:// — скорее всего облачный адрес
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    // Localhost и локальные адреса — локальные
    if (
      normalized.includes('localhost') ||
      normalized.includes('127.0.0.1') ||
      normalized.includes('0.0.0.0') ||
      normalized.match(/192\.168\.\d+\.\d+/)
    ) {
      return 'local';
    }
    return 'cloud';
  }

  return 'unknown';
}

export function getCombinedPrivacy(transcriptProvider: string | null | undefined, summaryProvider: string | null | undefined): PrivacyLevel {
  const t = getPrivacyLevel(transcriptProvider);
  const s = getPrivacyLevel(summaryProvider);

  // Если хотя бы один облачный — весь поток облачный
  if (t === 'cloud' || s === 'cloud') return 'cloud';

  // Если оба локальные — локально
  if (t === 'local' && s === 'local') return 'local';

  // Если хотя бы один неизвестен — неизвестно
  return 'unknown';
}
