// «Пульс разговора» на экране записи: полосы активности речи за последние
// BARS × BUCKET_SEC секунд (по полосе на каждые 5 с) и счётчики под ними.
//
// Данные честные: высота полосы — сколько раз в эти 5 секунд детектор речи или
// распознавание сообщили о речи (LiveSpeech.speechTimes). Уровня звука ядро во
// время записи не отдаёт, поэтому это не громкость, а «говорили или нет».
// Текущая полоса мягко мерцает, пока идёт запись; prefers-reduced-motion выключает
// мерцание. Анимируются только transform и opacity. Полосы нейтральные (цвет
// текста темы): цветная плитка на экране одна, плитка записи Risd.
'use client';

import { useMemo } from 'react';
import type { LiveSpeech } from '@/aid/lib/recording-outcome';
import type { Segment } from '@/aid/lib/meeting';
import { countWords } from '@/aid/lib/speech';
import { formatNumber } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';

const BUCKET_SEC = 5;
const BARS = 40;
/** Сколько сигналов речи за 5 с считать полной полосой. */
const FULL = 3;

interface Props {
  live: LiveSpeech;
  duration: number;
  isPaused: boolean;
  segments: Segment[];
}

export function LivePulse({ live, duration, isPaused, segments }: Props) {
  const current = Math.floor(duration / BUCKET_SEC);
  const bars = useMemo(() => {
    const counts = new Map<number, number>();
    for (const sec of live.speechTimes) {
      const b = Math.floor(sec / BUCKET_SEC);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return Array.from({ length: BARS }, (_, i) => {
      const bucket = current - (BARS - 1) + i;
      return { bucket, value: bucket < 0 ? null : Math.min(counts.get(bucket) ?? 0, FULL) / FULL };
    });
  }, [live.speechTimes, current]);

  const words = useMemo(() => countWords(segments.map((s) => s.text).join(' ')), [segments]);
  const elapsedBuckets = Math.max(1, current + 1);
  const speechBuckets = useMemo(() => new Set(live.speechTimes.map((s) => Math.floor(s / BUCKET_SEC))).size, [live.speechTimes]);
  const speechShare = Math.min(100, Math.round((speechBuckets / elapsedBuckets) * 100));
  const since = live.lastSpeechAt === null ? null : Math.max(0, Math.round(duration - live.lastSpeechAt));

  const stats = [
    { label: t('pulseWords'), value: formatNumber(words) },
    { label: t('pulseReplies'), value: formatNumber(segments.length) },
    { label: t('pulseSpeechShare'), value: `${speechShare}%` },
    { label: t('pulseLastSpeech'), value: since === null ? '—' : since < 3 ? t('pulseNow') : `${since} с` },
  ];

  return (
    <section aria-label={t('pulseTitle')} className="rounded-tile bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold leading-7 tracking-tight">{t('pulseTitle')}</h2>
        {/* Пока окно не набрано, подпись честная: «с начала записи» */}
        <span className="text-xs text-muted-foreground">{duration >= BARS * BUCKET_SEC ? t('pulseWindow') : t('pulseSinceStart')}</span>
      </div>
      {/* Полосы: низ выровнен, высота через scaleY (только transform) */}
      {/* Полосы не шире 6 px: на широком окне они не расплываются в капли */}
      <div className="mt-3 flex h-10 items-end justify-between gap-[3px]" aria-hidden>
        {bars.map(({ bucket, value }) => {
          const now = bucket === current;
          return (
            <span
              key={bucket}
              className={cn(
                'h-full max-w-[6px] flex-1 origin-bottom rounded-full transition-transform duration-500 ease-out',
                value === null ? 'bg-foreground/5' : value > 0 ? 'bg-foreground' : 'bg-foreground/15',
                now && !isPaused && 'aid-pulse-now',
              )}
              style={{ transform: `scaleY(${value === null || value === 0 ? 0.08 : 0.25 + value * 0.75})` }}
            />
          );
        })}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="tabular text-2xl font-bold tracking-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
