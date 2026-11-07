// Только для разработки: экран обработки на заданной стадии (?mock=full&finish=stopped|
// transcribing|saving|saved|discarded), чтобы смотреть и снимать каждую сцену отдельно.
// Реплики и сигналы речи вымышленные. В сборку не попадает (импорт по NODE_ENV в Home).
'use client';

import { FinishingScreen, type FinishStage } from '@/aid/components/FinishingScreen';
import type { Segment } from '@/aid/lib/meeting';

const SEGMENTS: Segment[] = [
  { id: 'p1', speaker: 'Алина', text: 'Тогда стенд «Полынь» чиним сегодня, логи почищу до обеда.', start: 700, clock: null },
  { id: 'p2', speaker: 'Глеб', text: 'Фильтры по датам добавлю к четвергу, ревью попрошу у Тимура.', start: 724, clock: null },
  { id: 'p3', speaker: 'Тимур', text: 'Хорошо. Релиз в пятницу, созвон в понедельник в 10:30.', start: 741, clock: null },
  { id: 'p4', speaker: null, text: 'Thank you.', start: 750, clock: null },
];
const EARLIER: Segment[] = Array.from({ length: 83 }, (_, i) => ({ id: `e${i}`, speaker: null, text: 'Обсуждали задачи спринта и сроки по каждой.', start: i * 8, clock: null }));
// Речь почти всю встречу, с паузами
const SPEECH = Array.from({ length: 754 }, (_, s) => s).filter((s) => Math.sin(s / 9) + Math.sin(s / 23) > -0.6);

export function FinishingPreview({ stage }: { stage: FinishStage }) {
  return (
    <main className="aid-page-in aid-scroll relative flex h-full min-w-0 flex-1 overflow-y-auto rounded-tile bg-card px-5">
      <FinishingScreen
        stage={stage}
        title="Дейли команды «Северный ветер»"
        durationSec={754}
        segments={[...EARLIER, ...SEGMENTS]}
        speechTimes={SPEECH}
      />
    </main>
  );
}
