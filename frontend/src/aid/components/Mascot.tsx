// Маскот ShadeNotes: чёрный силуэт с шипами, белые глаза-листики и лаймовая искра,
// на лаймовой плитке (как иконка приложения). Рисунок обведён по исходной картинке
// в вектор, слои: плитка, тело, искра, глаза. Статичный файл: public/brand/shadenotes.svg.
//
// Рта нет, поэтому эмоции несут глаза, искра и поза:
// - глаза: моргают, сжимаясь к своему плоскому низу; верхнее веко цвета тела опускается
//   и наклоняется (сонный, думает, грусть); снизу поднимается «щека» и оставляет
//   полумесяц (рад, подмигивает); глаза целиком смотрят за курсором;
// - искра: огонёк внимания. В покое изредка мерцает (поворот на четверть, как блик),
//   у «думает» медленно вращается, у «сонного» гаснет, у «рад» вспыхивает;
// - поза и короткие движения (lean, hop, shake, settle) внутри плитки.
//
// Принципы взяты у маскота сайта (portfolio-site, assistant-avatar.tsx и
// use-assistant-mood.ts), код свой: настроение в data-mood, минимальное время показа
// эмоции (useHeldMood), случайные таймеры моргания и мерцания, только transform и
// opacity, prefers-reduced-motion выключает движение, а формы глаз остаются.
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/aid/lib/utils';

export type MascotMood = 'idle' | 'curious' | 'thinking' | 'speaking' | 'happy' | 'sleepy' | 'error' | 'wink' | 'listening';
export type MascotMove = 'lean' | 'hop' | 'shake' | 'settle';

/** Восемь эмоций для листа и проверки; «слушаю» (listening) только во время записи. */
export const MASCOT_MOODS: MascotMood[] = ['idle', 'curious', 'thinking', 'speaking', 'happy', 'sleepy', 'error', 'wink'];

/** Сколько минимум держится показанное настроение, мс: короче эмоция не читается. */
const MIN_SHOW_MS: Partial<Record<MascotMood, number>> = { happy: 1400, error: 1600, wink: 900, curious: 900 };
const MIN_SHOW_DEFAULT_MS = 600;
/** Движение на входе в настроение. */
const ENTRY_MOVE: Partial<Record<MascotMood, MascotMove>> = { happy: 'hop', error: 'shake', curious: 'lean' };
const MOVE_MS: Record<MascotMove, number> = { lean: 900, hop: 700, shake: 620, settle: 900 };
/** Настроения, на входе в которые искра вспыхивает. */
const ENTRY_TWINKLE: MascotMood[] = ['happy', 'wink', 'curious'];
/** Моргание: пауза между морганиями, доля двойных, длина одного, мс. */
const BLINK_INTERVAL_MS: [number, number] = [2800, 6000];
const BLINK_DOUBLE_CHANCE = 0.18;
const BLINK_MS = 200;
/** Мерцание искры в покое и при записи: редко, чтобы не стать мигалкой. */
const TWINKLE_INTERVAL_MS: [number, number] = [7000, 14000];
const TWINKLE_MS = 700;
/** В покое изредка переминается. */
const AMBIENT_INTERVAL_MS: [number, number] = [9000, 16000];
/** Взгляд за курсором: насколько далеко уходят глаза (единицы рисунка) и на каком расстоянии от центра доходят до края, px. */
const GAZE_MAX = 5;
const GAZE_REACH_PX = 320;
/** Настроения, в которых глаза свободны и следят за курсором. */
const GAZE_MOODS: MascotMood[] = ['idle', 'listening', 'curious'];
/** Настроения с глазами-полумесяцами: не моргают. */
const CLOSED_EYES: MascotMood[] = ['happy', 'wink'];
const TWINKLE_MOODS: MascotMood[] = ['idle', 'listening'];

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Держит показанное настроение не меньше минимального времени; последнее желаемое побеждает. */
export function useHeldMood(target: MascotMood): MascotMood {
  const [shown, setShown] = useState(target);
  const since = useRef(0);
  useEffect(() => {
    if (since.current === 0) since.current = performance.now();
  }, []);
  useEffect(() => {
    if (target === shown) return;
    const hold = (MIN_SHOW_MS[shown] ?? MIN_SHOW_DEFAULT_MS) - (performance.now() - since.current);
    const apply = () => {
      since.current = performance.now();
      setShown(target);
    };
    if (hold <= 0) {
      apply();
      return;
    }
    const id = window.setTimeout(apply, hold);
    return () => window.clearTimeout(id);
  }, [target, shown]);
  return shown;
}

// ─── Рисунок (viewBox 256 × 256, плитка во весь квадрат) ───

export const MASCOT_COLORS = { tile: '#E2FB6F', body: '#0A0A0A', eye: '#FFFFFF' } as const;
const TILE_RADIUS = 57.6;

const BODY =
  'M127.7 236.1C97.4 234.4 72.6 221.5 56.7 199.4C50.7 191 46.2 180.6 44.1 170.3C43.3 166.4 42.9 163.3 42.5 157.8C42.3 155 42 151.7 41.8 150.4C40.4 140.4 35.7 131.5 27.1 122.2C24.6 119.5 24 118.6 24 117C24 115.5 24.8 114.2 26.8 112.5C35.8 104.8 49 101.6 62.9 104C64.3 104.3 66.1 104.6 66.8 104.8C67.5 105 68.2 105.1 68.3 105C68.7 104.6 66.4 99.6 63.6 94.7C58.8 86.6 55.4 81.7 48.1 72.5C45.2 68.9 44.8 68 44.9 66.5C45.1 64.5 46.2 63.8 50.7 63.2C54.4 62.7 66.4 62.6 70.1 63.1C85.7 65.1 100.4 69.5 113.1 76.3L116.3 77.9L116.2 77.2C115.7 74.8 114.1 71 111.6 66C105.2 53.3 99.8 45 89.7 32C87.1 28.7 86.6 27.7 86.6 26.3C86.6 24.9 87 24.2 87.9 23.6C90.5 22 107.4 24.3 123.1 28.4C149.8 35.5 166.7 44 184.4 59.2C213.4 84.4 232.3 123.8 230.5 155.6C229.4 175.9 221.3 193.9 206.9 208.3C195.2 220 180.3 228.2 162.5 232.7C151.6 235.5 138.6 236.8 127.7 236.1Z';
const SPARK =
  'M199.1 104.4C190.1 98.9 175.1 90.5 173.2 89.7C170.8 88.8 168.8 88.5 166.9 88.8C164.2 89.3 162.3 90.5 156.9 95.4C154.9 97.3 154 97.9 154 97.4C154 97.3 154.5 95.9 155.1 94.4C158.2 86.4 157.9 82 153.8 77.6C152.4 76.1 143.5 67.7 134.1 58.9C130.3 55.4 129.4 54.5 130.1 54.5C130.4 54.5 132.7 55.8 141.5 61C156.1 69.7 159.1 71.2 162.8 71.2C166 71.2 168 70.1 173.4 65.2C176.2 62.7 177 62.2 177 62.7C177 62.8 176.6 64 176.1 65.2C172.9 73.1 173 77.4 176.6 81.7C177.6 82.9 185 89.9 196 100.1C198.6 102.5 200.8 104.7 200.8 104.8C200.9 105.3 200.4 105.2 199.1 104.4Z';

/** Глаза: форма, рамка (x, y, w, h) для век и щёк. Низ у обоих плоский, внешний угол поднят. */
const EYES = {
  l: {
    d: 'M108 177.5C94.1 175.8 83.5 169.5 76.4 158.8C74 155.1 71.2 148.7 70.7 145.5L70.5 144.6L71.6 144.6C73.9 144.6 80.5 146.1 85.6 147.8C103.1 153.4 116.1 163.1 122.4 175C123.3 176.8 123.4 177.3 122.7 177.5C121.7 177.9 110.5 177.9 108 177.5Z',
    box: [70.5, 144.4, 52.9, 33.5],
  },
  r: {
    d: 'M150.7 176.5C151.2 173.8 153.9 167.3 156.2 163.6C160.9 156 169.6 148.1 180.7 141.4C187.3 137.4 197.3 133.1 202.1 132.3L202.9 132.1L202.8 133.7C202.2 139.5 199.5 147.8 196.3 153.3C192.6 159.9 186.9 165.7 180.3 169.6C172.9 174 163.3 176.8 153.4 177.3L150.6 177.5L150.7 176.5Z',
    box: [150.4, 132.1, 52.5, 45.3],
  },
} as const;

type EyeSide = keyof typeof EYES;

function Eye({ side, uid }: { side: EyeSide; uid: string }) {
  const { d, box } = EYES[side];
  const [x, y, w, h] = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const clip = `${uid}-eye-${side}`;
  return (
    <g className={`m-eye-wrap m-eye-wrap-${side}`}>
      <g className="m-blink">
        {/* Маска для века и щеки чуть больше глаза: перекрывает сглаженный край, без белой каймы */}
        <clipPath id={clip}>
          <path d={d} transform={`translate(${cx} ${cy}) scale(1.08) translate(${-cx} ${-cy})`} />
        </clipPath>
        <path d={d} fill="var(--m-eye)" />
        <g clipPath={`url(#${clip})`} fill="var(--m-body)">
          {/* Верхнее веко: нижний край по верху глаза, опускается и наклоняется */}
          <rect className={`m-lid m-lid-${side}`} x={x - 16} y={y - 64} width={w + 32} height={64} />
          {/* Щека: поднимается снизу и оставляет полумесяц */}
          <ellipse className={`m-cheek m-cheek-${side}`} cx={cx} cy={y + h + h} rx={w * 0.6} ry={h} />
        </g>
      </g>
    </g>
  );
}

export interface MascotProps {
  mood?: MascotMood;
  /** Размер в px (квадрат). */
  size?: number;
  /** Сигнал речи: каждое изменение числа даёт короткую реакцию глаз и искры (слушает). */
  pulse?: number;
  /** Глаза следят за курсором (в спокойных настроениях). */
  followCursor?: boolean;
  /** Оставлено для совместимости: у этого маскота нет отдельных значков настроения. */
  details?: boolean;
  /** Без движения: лист эмоций и статичный файл. */
  still?: boolean;
  /** Внешнее движение: меняйте moveKey, чтобы сыграть его ещё раз. */
  move?: MascotMove;
  moveKey?: number;
  /** Без плитки: только персонаж. Тело цвета currentColor, глаза и искра цвета подложки
   *  (дырки, как в иконке: --m-hole, по умолчанию цвет плитки --card). */
  bare?: boolean;
  /** Подпись для чтения с экрана; без неё рисунок декоративный. */
  label?: string;
  className?: string;
}

export function Mascot({ mood = 'idle', size = 96, pulse = 0, followCursor = false, still = false, move, moveKey = 0, bare = false, label, className }: MascotProps) {
  const uid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const shown = useHeldMood(mood);

  // Короткое состояние через атрибут: снимается по окончании, повтор перезапускает анимацию
  const flash = (attr: string, value: string, ms: number) => {
    const el = ref.current;
    if (!el || still || reducedMotion()) return;
    el.removeAttribute(attr);
    // чтение размера заставляет браузер применить снятие атрибута
    void el.getBoundingClientRect();
    el.setAttribute(attr, value);
    window.setTimeout(() => el.getAttribute(attr) === value && el.removeAttribute(attr), ms + 40);
  };
  const play = (m: MascotMove) => flash('data-move', m, MOVE_MS[m]);
  const twinkle = () => flash('data-twinkle', '', TWINKLE_MS);

  // Движение на входе в настроение; из любого настроения в покой: settle
  const prevMood = useRef<MascotMood | null>(null);
  useEffect(() => {
    const prev = prevMood.current;
    prevMood.current = shown;
    const m = ENTRY_MOVE[shown] ?? (prev && prev !== 'idle' && shown === 'idle' ? 'settle' : undefined);
    if (m) play(m);
    if (prev && ENTRY_TWINKLE.includes(shown)) twinkle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    if (move && moveKey) play(move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move, moveKey]);

  // Моргание по таймеру (не в настроениях с глазами-полумесяцами)
  useEffect(() => {
    if (still || reducedMotion()) return;
    let timer = 0;
    const blink = (then?: () => void) => {
      const el = ref.current;
      if (!el) return;
      el.setAttribute('data-blink', '');
      window.setTimeout(() => {
        el.removeAttribute('data-blink');
        then?.();
      }, BLINK_MS);
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!CLOSED_EYES.includes(shown) && document.visibilityState === 'visible') {
          if (Math.random() < BLINK_DOUBLE_CHANCE) blink(() => window.setTimeout(() => blink(), 90));
          else blink();
        }
        schedule();
      }, rand(BLINK_INTERVAL_MS));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [shown, still]);

  // В покое изредка переминается, искра изредка мерцает
  useEffect(() => {
    if (still || reducedMotion()) return;
    const timers: number[] = [];
    const loop = (range: [number, number], fn: () => void) => {
      const tick = () => {
        timers.push(
          window.setTimeout(() => {
            if (document.visibilityState === 'visible') fn();
            tick();
          }, rand(range)),
        );
      };
      tick();
    };
    if (shown === 'idle') loop(AMBIENT_INTERVAL_MS, () => play('settle'));
    if (TWINKLE_MOODS.includes(shown)) loop(TWINKLE_INTERVAL_MS, twinkle);
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, still]);

  // Взгляд за курсором: переменные --gx и --gy, кадр не чаще requestAnimationFrame
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reset = () => {
      el.style.setProperty('--gx', '0px');
      el.style.setProperty('--gy', '0px');
    };
    if (!followCursor || still || !GAZE_MOODS.includes(shown) || reducedMotion()) {
      reset();
      return;
    }
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      if (!last) return;
      const r = el.getBoundingClientRect();
      const dx = last.clientX - (r.left + r.width / 2);
      const dy = last.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k = (GAZE_MAX * Math.min(1, dist / GAZE_REACH_PX)) / dist;
      el.style.setProperty('--gx', `${(dx * k).toFixed(2)}px`);
      el.style.setProperty('--gy', `${(dy * k * 0.7).toFixed(2)}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
      reset();
    };
  }, [followCursor, shown, still]);

  // Реакция на речь: глаза на миг шире, искра подсвечивается (Web Animations, только transform и opacity)
  const firstPulse = useRef(pulse);
  useEffect(() => {
    const el = ref.current;
    if (!el || pulse === firstPulse.current || still || reducedMotion()) return;
    const eyes = el.querySelector<SVGGElement>('.m-react-eyes');
    const spark = el.querySelector<SVGPathElement>('.m-spark');
    eyes?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
    spark?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.3 }, { transform: 'scale(1)' }], {
      duration: 460,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  }, [pulse, still]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      data-mood={shown}
      data-still={still ? '' : undefined}
      data-bare={bare ? '' : undefined}
      className={cn('aid-mascot shrink-0', bare && 'overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {!bare && (
        <>
          <clipPath id={`${uid}-tile`}>
            <rect width={256} height={256} rx={TILE_RADIUS} />
          </clipPath>
          <rect width={256} height={256} rx={TILE_RADIUS} fill={MASCOT_COLORS.tile} />
        </>
      )}
      <g clipPath={bare ? undefined : `url(#${uid}-tile)`}>
        <g className="m-pose">
          <g className="m-move">
            <g className="m-loop">
              <path className="m-body" d={BODY} fill="var(--m-body)" />
              <path className="m-spark" d={SPARK} fill="var(--m-spark)" />
              <g className="m-gaze">
                <g className="m-react-eyes">
                  <Eye side="l" uid={uid} />
                  <Eye side="r" uid={uid} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
