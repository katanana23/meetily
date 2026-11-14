// Тесты разбора ответа модели и таймаута проверки: bun test src/aid (pnpm test).
import { describe, expect, mock, test } from 'bun:test';

// Настройки итогов без ядра: провайдер Ollama, модель условная
mock.module('@/services/configService', () => ({
  configService: { getModelConfig: async () => ({ provider: 'ollama', model: 'test-model', whisperModel: '', ollamaEndpoint: null }) },
}));
const { checkContent, contentPrompt, folderMismatch, parseAnswer } = await import('./content-check');

describe('ответ модели', () => {
  test('да и нет в разных видах', () => {
    expect(parseAnswer('Да')).toBe(true);
    expect(parseAnswer('«да».')).toBe(true);
    expect(parseAnswer('Yes')).toBe(true);
    expect(parseAnswer('Нет.')).toBe(false);
    expect(parseAnswer('  **нет**')).toBe(false);
    expect(parseAnswer('<think>счёт и алло</think>\nнет')).toBe(false);
  });
  test('ни да ни нет', () => {
    expect(parseAnswer('')).toBeNull();
    expect(parseAnswer('Возможно')).toBeNull();
    expect(parseAnswer('<think>долго думаю')).toBeNull();
  });
  test('текст записи попадает в вопрос', () => {
    expect(contentPrompt(' Маша готовит смету ')).toContain('«Маша готовит смету»');
  });
});

describe('проверка через Ollama', () => {
  const reply = (body: unknown, ok = true) =>
    (globalThis.fetch = (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch);

  test('«нет» → empty, «да» → content', async () => {
    reply({ response: 'нет' });
    expect((await checkContent('Раз два')).result).toBe('empty');
    reply({ response: 'Да.' });
    expect((await checkContent('Маша готовит смету')).result).toBe('content');
  });
  test('ошибка и непонятный ответ → unavailable', async () => {
    reply({}, false);
    expect((await checkContent('текст')).result).toBe('unavailable');
    reply({ response: 'не знаю' });
    expect((await checkContent('текст')).result).toBe('unavailable');
  });
  test('нет ответа дольше предела → unavailable в срок', async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const t0 = Date.now();
    const check = await checkContent('текст', 50);
    expect(check.result).toBe('unavailable');
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('та ли встреча уходит в корзину', () => {
  const rec = '/Users/test/Records/Meeting 14_11_26_10_02_00';
  test('папка неизвестна → не переносить', () => {
    expect(folderMismatch(null, rec)).not.toBeNull();
    expect(folderMismatch('', rec)).not.toBeNull();
    expect(folderMismatch(rec, null)).not.toBeNull();
    expect(folderMismatch(rec, undefined)).not.toBeNull();
    expect(folderMismatch(rec, '')).not.toBeNull();
  });
  test('папка другая → не переносить', () => {
    expect(folderMismatch(rec, '/Users/test/Records/Meeting 13_11_26_09_00_00')).not.toBeNull();
  });
  test('оба пути известны и равны → переносить', () => {
    expect(folderMismatch(rec, rec)).toBeNull();
  });
});
