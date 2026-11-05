// Только для разработки: лист эмоций маскота и сравнение с исходным рисунком.
// Открывается на главной по /?mock=full&mascot=sheet (Home.tsx, в сборку не попадает).
// ?mascot=sheet&still=1 показывает формы без движения (для скриншотов листа).
'use client';

import { useEffect, useState } from 'react';
import { Mascot, MASCOT_MOODS, type MascotMood, type MascotMove } from './Mascot';
import { Page } from './Page';
import { Button } from './ui/button';

const LABEL: Record<MascotMood, string> = {
  idle: 'Покой',
  curious: 'Любопытство',
  thinking: 'Думает',
  speaking: 'Говорит',
  happy: 'Рад',
  sleepy: 'Сонный',
  error: 'Ошибка',
  wink: 'Подмигивает',
  listening: 'Слушает',
};

export function MascotSheet({ still }: { still: boolean }) {
  const [pulse, setPulse] = useState(0);
  const [move, setMove] = useState<{ m: MascotMove; k: number }>({ m: 'hop', k: 0 });
  // «Слушает»: сигнал речи раз в 0,7 с
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setPulse((p) => p + 1), 700);
    return () => window.clearInterval(id);
  }, [still]);

  return (
    <Page>
      <div className="flex flex-col gap-8 pb-[var(--dock-space)]">
        <section aria-label="Сравнение" data-sheet="compare" className="flex flex-wrap items-center gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shadenotes.png" width={200} height={200} alt="Исходный рисунок" className="rounded-[44px]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shadenotes.svg" width={200} height={200} alt="SVG" />
          <Mascot mood="idle" size={200} followCursor still={still} />
        </section>

        <section aria-label="Эмоции" data-sheet="moods" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[...MASCOT_MOODS, 'listening' as const].map((mood) => (
            <figure key={mood} className="flex flex-col items-center gap-2 rounded-nested bg-muted p-4 text-muted-foreground">
              <Mascot mood={mood} size={160} still={still} pulse={mood === 'listening' ? pulse : 0} followCursor />
              <figcaption className="text-sm font-semibold text-foreground">{LABEL[mood]}</figcaption>
            </figure>
          ))}
        </section>

        {!still && (
          <section aria-label="Движения" className="flex flex-wrap items-center gap-2">
            <Mascot mood="idle" size={120} move={move.m} moveKey={move.k} />
            {(['lean', 'hop', 'shake', 'settle'] as MascotMove[]).map((m) => (
              <Button key={m} variant="secondary" onClick={() => setMove((v) => ({ m, k: v.k + 1 }))}>
                {m}
              </Button>
            ))}
          </section>
        )}

        <section aria-label="Размеры" className="flex items-end gap-6">
          {[28, 48, 96, 160].map((s) => (
            <Mascot key={s} mood="idle" size={s} still={still} />
          ))}
        </section>
      </div>
    </Page>
  );
}
