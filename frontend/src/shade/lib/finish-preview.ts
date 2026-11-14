// Только в разработке: карточка после «Остановить» и строка обрабатываемой встречи на
// заданном шаге без записи, чтобы смотреть и снимать каждое состояние:
// ?mock=full&finish=transcribing|saving|saved. Отбракованная запись: ?finish=discarded
// («Пустая запись - не сохранена») и ?notice=empty|no-speech|unrecognized|low-content
// (recording-outcome.tsx). В сборке всегда null. Таймеров у предпросмотра нет: карточка
// стоит, пока адрес тот же.
'use client';

import type { FinishState } from './recording-controls';

const STAGES = ['transcribing', 'saving', 'saved'] as const;

/** Название вымышленной встречи: как у ядра, «Meeting ДД_ММ_ГГ_ЧЧ_ММ_СС» сегодня. */
function mockTitle(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Meeting ${p(d.getDate())}_${p(d.getMonth() + 1)}_${String(d.getFullYear()).slice(2)}_${p(d.getHours())}_${p(d.getMinutes())}_00`;
}

export function previewFinish(params: URLSearchParams | null): FinishState | null {
  if (process.env.NODE_ENV !== 'development' || !params) return null;
  const stage = STAGES.find((x) => x === params.get('finish'));
  if (!stage) return null;
  return { stage, title: mockTitle(), meetingId: stage === 'saved' ? 'preview-saved' : null };
}
