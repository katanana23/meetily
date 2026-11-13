// Только для разработки: экран обработки на заданном шаге, чтобы смотреть и снимать каждое
// состояние отдельно: ?mock=full&finish=stopped|transcribing|saving|saved, &size=short для короткой
// записи (16 с, 2 реплики, 23 слова). Реплики и сигналы речи вымышленные. В сборку не попадает (импорт по
// NODE_ENV в Home). Кнопки финала здесь ничего не открывают.
'use client';

import { FinishingScreen, type FinishStage } from '@/aid/components/FinishingScreen';
import type { Segment } from '@/aid/lib/meeting';

const LONG: Segment[] = [
  ...Array.from({ length: 40 }, (_, i): Segment => ({ id: `e${i}`, speaker: null, text: 'Обсуждали задачи спринта и сроки по каждой.', start: i * 16, clock: null })),
  { id: 'p1', speaker: 'Алина', text: 'Тогда стенд «Полынь» чиним сегодня, логи почищу до обеда.', start: 700, clock: null },
  { id: 'p2', speaker: 'Глеб', text: 'Фильтры по датам добавлю к четвергу, ревью попрошу у Тимура.', start: 724, clock: null },
  { id: 'p3', speaker: 'Тимур', text: 'Хорошо. Релиз в пятницу, созвон в понедельник в 10:30.', start: 741, clock: null },
  // Галлюцинация на тишине в конце: на экране её нет
  { id: 'p4', speaker: null, text: 'Thank you.', start: 750, clock: null },
];

// Короткая запись: 23 слова в двух репликах, 16 секунд
const SHORT: Segment[] = [
  { id: 's1', speaker: null, text: 'Проверяю запись: релиз переносим на четверг, Лада пришлёт отчёт по тестам до среды.', start: 1, clock: null },
  { id: 's2', speaker: null, text: 'Если всё зелёное, выкатываем утром, а созвон в пятницу отменяем.', start: 9, clock: null },
];

// Речь почти всю встречу, с паузами (волна на сцене «Запись остановлена»)
const SPEECH_LONG = Array.from({ length: 754 }, (_, s) => s).filter((s) => Math.sin(s / 9) + Math.sin(s / 23) > -0.6);
const SPEECH_SHORT = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15];

const noop = () => console.info('[aid] Предпросмотр: встреча не открывается');

export function FinishingPreview({ stage, short = false }: { stage: FinishStage; short?: boolean }) {
  return (
    <main className="aid-page-in aid-scroll relative block h-full min-w-0 flex-1 overflow-y-auto rounded-tile bg-card px-5">
      <FinishingScreen
        stage={stage}
        title={short ? 'Встреча 7 ноября, 14:05' : 'Дейли команды «Северный ветер»'}
        durationSec={short ? 16 : 754}
        segments={short ? SHORT : LONG}
        speechTimes={short ? SPEECH_SHORT : SPEECH_LONG}
        onOpen={stage === 'saved' ? noop : undefined}
        onSummarize={stage === 'saved' ? noop : undefined}
      />
    </main>
  );
}
