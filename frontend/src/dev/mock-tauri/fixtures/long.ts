// Сценарий «long»: одна очень длинная встреча (≈3 часа, 2000+ реплик,
// огромное резюме, длинное название) и много встреч в сайдбаре.
// Генерация детерминированная: при каждой загрузке данные одинаковые.

import { buildTranscript, type Line, type MockMeeting } from './types';

const SPEAKERS = [
  'Алина Воронцова', 'Глеб Сомов', 'Тимур Ахмеров', 'Вера Лискина',
  'Нина Ряхова', 'Олег Брусникин', 'Дарья Шелест', 'Кирилл Тарханов',
];

const OPENERS = [
  'Если коротко,', 'Добавлю к сказанному:', 'Я бы предложил', 'Смотрите,', 'По данным за неделю',
  'Не уверен, но', 'Важный момент:', 'С точки зрения пользователей', 'Если вернуться к плану,', 'Честно говоря,',
];
const TOPICS = [
  'миграция хранилища заказов', 'новый экран отчётов', 'нагрузочное тестирование', 'онбординг клиентов',
  'интеграция с бухгалтерией', 'мобильные уведомления', 'тарифная сетка', 'права доступа для филиалов',
  'архивация старых записей', 'журнал аудита', 'поиск по документам', 'оффлайн-режим планшетов',
];
const TAILS = [
  'нужно закончить до конца месяца.', 'пока выглядит рискованно.', 'требует ещё одной итерации с дизайном.',
  'зависит от ответа юристов.', 'можно отдать в работу уже завтра.', 'съедает больше времени, чем мы планировали.',
  'лучше проверить на одном филиале.', 'стоит обсудить отдельно, тут мнения расходятся.',
  'даст заметный прирост скорости.', 'не влезает в текущий спринт.',
];

function longLines(count: number): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < count; i++) {
    const speaker = SPEAKERS[(i * 5 + Math.floor(i / 7)) % SPEAKERS.length];
    const text = `${OPENERS[(i * 3) % OPENERS.length]} ${TOPICS[(i * 7 + 3) % TOPICS.length]} ${TAILS[(i * 11) % TAILS.length]}`;
    // каждая 9-я реплика длинная, чтобы проверить перенос строк
    const extra = i % 9 === 0
      ? ' Тут я хочу подробнее остановиться на деталях, потому что в прошлый раз мы это обсуждали на бегу, а в итоге потеряли почти две недели на переделки и согласования с соседними командами.'
      : '';
    lines.push([speaker, text + extra]);
  }
  return lines;
}

function longSummary(): string {
  const parts: string[] = [
    '# Стратегическая сессия «Гранат-Софт» на 2027 год: продукт, инфраструктура, найм, бюджет и всё, что не успели обсудить летом',
    '',
    '## Сводка',
    'Трёхчасовая сессия руководителей направлений. Пройдены 12 тем, по каждой зафиксированы решения и владельцы. ' +
      'Ниже — подробный разбор с таблицей задач на 40 строк, чтобы проверить прокрутку и вёрстку таблиц.',
    '',
  ];
  TOPICS.forEach((topic, i) => {
    parts.push(`## ${i + 1}. ${topic[0].toUpperCase()}${topic.slice(1)}`);
    parts.push(`- Текущее состояние: ${TAILS[i % TAILS.length]}`);
    parts.push(`- Решение: назначить ответственного (${SPEAKERS[i % SPEAKERS.length]}) и вернуться через две недели.`);
    parts.push(`- Открытый вопрос: ${TAILS[(i + 3) % TAILS.length]}`);
    parts.push('');
  });
  parts.push('## Задачи');
  parts.push('| **Владелец** | Задача | Срок | Фрагмент транскрипта | Время |');
  parts.push('| --- | --- | --- | --- | --- |');
  for (let i = 0; i < 40; i++) {
    const h = Math.floor((i * 4.3) / 60);
    const m = Math.floor((i * 4.3) % 60);
    parts.push(
      `| ${SPEAKERS[i % SPEAKERS.length]} | ${TOPICS[i % TOPICS.length]}: подготовить предложение | ` +
        `${String((i % 28) + 1).padStart(2, '0')}.11.2026 | «${OPENERS[i % OPENERS.length]} ${TOPICS[i % TOPICS.length]}…» | ` +
        `0${h}:${String(m).padStart(2, '0')}:00 |`,
    );
  }
  return parts.join('\n');
}

export function createLongMeetings(): MockMeeting[] {
  const longId = 'mock-long-strategy';
  const start = '2026-10-03T09:00:00Z';
  const long: MockMeeting = {
    id: longId,
    title: 'Стратегическая сессия «Гранат-Софт» на 2027 год: продукт, инфраструктура, найм, бюджет и всё, что не успели обсудить летом',
    created_at: start,
    updated_at: '2026-10-03T12:10:00Z',
    folder_path: `/mock/Meetily/recordings/${longId}`,
    transcripts: buildTranscript(longId, start, longLines(2100), 0.4),
    summary: { status: 'completed', templateId: 'standard_meeting', markdown: longSummary() },
  };

  // 45 коротких встреч, чтобы сайдбар прокручивался
  const filler: MockMeeting[] = Array.from({ length: 45 }, (_, i) => {
    const id = `mock-long-filler-${i + 1}`;
    const day = new Date(Date.UTC(2026, 8, 30 - (i % 28), 10 + (i % 7)));
    return {
      id,
      title: i % 6 === 0
        ? `Очень длинное название встречи номер ${i + 1}, которое не помещается в сайдбар и должно аккуратно обрезаться`
        : `${TOPICS[i % TOPICS.length][0].toUpperCase()}${TOPICS[i % TOPICS.length].slice(1)} — встреча ${i + 1}`,
      created_at: day.toISOString(),
      updated_at: day.toISOString(),
      folder_path: `/mock/Meetily/recordings/${id}`,
      transcripts: buildTranscript(id, day.toISOString(), longLines(12 + (i % 10))),
      summary: { status: 'idle' },
    };
  });

  return [long, ...filler];
}
