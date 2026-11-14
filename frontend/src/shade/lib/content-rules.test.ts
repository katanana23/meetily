// Тесты правил значимых слов: bun test src/shade (pnpm test).
import { describe, expect, test } from 'bun:test';
import { assessContent, contentTier, meaningfulWords } from './content-rules';
import { CHECK_MAX_WORDS, EMPTY_MAX_WORDS } from './discard-policy';

const count = (...texts: string[]) => assessContent(texts).count;
const tier = (...texts: string[]) => assessContent(texts).tier;

describe('пустые записи: 0 значимых слов', () => {
  test('счёт «Раз, два… десять, а?»', () => {
    expect(count('Раз, два… десять, а?')).toBe(0);
  });
  test('проверка связи «Алло, слышно меня? Проверка»', () => {
    expect(count('Алло, слышно меня? Проверка')).toBe(0);
  });
  test('«Раз-раз, проверка связи», «Тест, тест»', () => {
    expect(count('Раз-раз, проверка связи.', 'Тест, тест.')).toBe(0);
  });
  test('«Вы меня слышите? Алло-алло»', () => {
    expect(count('Вы меня слышите? Алло-алло.')).toBe(0);
  });
  test('счёт через границу реплик', () => {
    expect(count('Один, два.', 'Три, четыре, пять.')).toBe(0);
    expect(count('1, 2, 3, 4')).toBe(0);
    expect(count('One, two, three, testing.')).toBe(0);
  });
  test('междометия и повторы одного слова', () => {
    expect(count('Эээ...', 'Ну, вот.', 'Ага, угу.', 'Um, okay, so.')).toBe(0);
    expect(count('Да. Да. Да.')).toBe(0);
    expect(count('Пять, пять, пять.')).toBe(0);
    expect(count('Спасибо, спасибо.')).toBe(0);
  });
  test('галлюцинации Whisper на тишине', () => {
    expect(count('Продолжение следует...', 'Субтитры сделал DimaTorzok', 'Thank you.', '♪♪♪')).toBe(0);
  });
  test('пустые и пробельные реплики', () => {
    expect(count('', '   ', '...')).toBe(0);
  });
});

describe('уникальные слова, числа и даты', () => {
  test('повтор слова в разных репликах считается один раз', () => {
    expect(count('Бюджет утвердили.', 'Бюджет утвердили, да.')).toBe(2);
  });
  test('числа и даты вне счёта значимы', () => {
    expect(meaningfulWords(['Встреча 15 декабря в 10 утра'])).toEqual(['встреча', '15', 'декабря', 'в', '10', 'утра']);
  });
  test('два числа подряд не счёт', () => {
    expect(meaningfulWords(['Созвон в 10 30'])).toEqual(['созвон', 'в', '10', '30']);
  });
  test('счёт вырезается, остальное остаётся', () => {
    expect(meaningfulWords(['Раз, два, три, начинаем планёрку'])).toEqual(['начинаем', 'планерку']);
  });
  test('«Да, хорошо, давай» меньше порога', () => {
    expect(count('Да, хорошо, давай.')).toBe(2);
    expect(tier('Да, хорошо, давай.')).toBe('empty');
  });
});

describe('ступени', () => {
  test('границы порогов', () => {
    expect(contentTier(0)).toBe('empty');
    expect(contentTier(EMPTY_MAX_WORDS)).toBe('empty');
    expect(contentTier(EMPTY_MAX_WORDS + 1)).toBe('check');
    expect(contentTier(CHECK_MAX_WORDS)).toBe('check');
    expect(contentTier(CHECK_MAX_WORDS + 1)).toBe('keep');
  });
  test('«Обсудили бюджет на декабрь, Маша готовит смету до пятницы» → проверка моделью', () => {
    const a = assessContent(['Обсудили бюджет на декабрь, Маша готовит смету до пятницы']);
    expect(a.count).toBe(9);
    expect(a.tier).toBe('check');
  });
  test('обычная встреча без проверки', () => {
    const a = assessContent([
      'Давайте договоримся: релиз переносим на четверг.',
      'Лада до среды пришлёт отчёт по тестам.',
      'Если всё зелёное, выкатываем утром.',
      'Возражений нет.',
    ]);
    expect(a.count).toBeGreaterThan(CHECK_MAX_WORDS);
    expect(a.tier).toBe('keep');
  });
  test('проверочные фразы вокруг содержания не мешают', () => {
    const a = assessContent(['Алло, слышно меня?', 'Обсудили бюджет на декабрь, Маша готовит смету до пятницы']);
    expect(a.count).toBe(9);
  });
});
