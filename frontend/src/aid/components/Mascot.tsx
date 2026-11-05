// Маскот ShadeNotes: многослойный SVG по рисунку public/brand/shadenotes.png (синий,
// шипы, чёрная обводка, ухмылка). Слои: шипы и голова, тень, глаза (белок, зрачок,
// веко), брови, несколько форм рта, щёчка и мелочи настроения (точки «думаю», «z»).
// Статичный файл с теми же слоями: public/brand/shadenotes.svg.
//
// Принципы взяты у маскота сайта (portfolio-site, assistant-avatar.tsx и
// use-assistant-mood.ts), код свой:
// - настроение задаёт вид через data-mood, формы глаз и рта меняются прозрачностью,
//   поза и брови пружинят переходом (globals.css, .aid-mascot);
// - каждое настроение держится не меньше MIN_SHOW_MS (useHeldMood), чтобы эмоции
//   не мелькали;
// - моргание по случайному таймеру, иногда двойное; взгляд за курсором;
// - короткие движения: lean, hop, shake, settle (на входе в настроение и изредка в покое);
// - анимации только на transform и opacity; prefers-reduced-motion выключает движение,
//   моргание и взгляд, а статичные формы глаз и рта остаются.
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
/** Моргание: пауза между морганиями, доля двойных, длина одного, мс. */
const BLINK_INTERVAL_MS: [number, number] = [2800, 6000];
const BLINK_DOUBLE_CHANCE = 0.18;
const BLINK_MS = 240;
/** В покое изредка переминается с ноги на ногу. */
const AMBIENT_INTERVAL_MS: [number, number] = [9000, 16000];
/** Взгляд за курсором: насколько далеко уходят зрачки (единицы рисунка) и на каком расстоянии от центра доходят до края, px. */
const GAZE_MAX = 4.5;
const GAZE_REACH_PX = 320;
/** Настроения, в которых глаза свободны и следят за курсором. */
const GAZE_MOODS: MascotMood[] = ['idle', 'listening', 'curious'];
/** Настроения с закрытыми глазами: не моргают. */
const CLOSED_EYES: MascotMood[] = ['happy', 'wink'];

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

// ─── Рисунок (viewBox 256 × 256) ───

const C = { body: '#03ADFA', shade: '#007CD4', line: '#01091D', cream: '#FAF6E5', cheek: '#F94E3F' };

const HEAD = 'M128 64C166 58 198 82 208 112C216 138 212 166 196 183C178 201 150 206 126 204C100 202 80 194 68 178C60 166 57 150 61 136C64 127 69 121 75 118L114 92C118 82 122 72 128 64Z';
const SPIKES = [
  'M96 44C122 46 146 54 166 68L132 104C124 100 118 95 114 91C108 73 103 58 96 44Z',
  'M60 82C82 81 102 86 116 92L104 124L75 119C72 106 67 94 60 82Z',
  'M38 126C50 120 62 117 76 118L84 152L64 172C58 153 50 137 38 126Z',
];
const SHADES = [
  'M97 46C108 68 120 88 148 112L134 114C116 98 106 76 97 46Z',
  'M61 84C69 96 73 107 77 119L88 123C82 108 73 94 61 84Z',
  'M40 124C58 136 68 156 76 174C88 190 108 198 132 201L132 230L20 230L20 124Z',
];

const EYE = {
  l: {
    white: 'M86 151C92 136 114 130 133 139C137 153 123 164 108 163C97 162 89 158 86 151Z',
    pupil: { cx: 116, cy: 148, rx: 6, ry: 9, rot: -12 },
    shine: { cx: 114, cy: 144.5, rx: 2, ry: 3 },
    lid: { rotate: 'rotate(-12 110 147)', x: 76, y: 96, w: 68, h: 38, closed: 32 },
    happy: 'M92 154C100 141 120 138 133 150',
  },
  r: {
    white: 'M154 152C164 138 182 128 195 129C199 141 193 153 181 158C171 162 161 160 154 152Z',
    pupil: { cx: 170, cy: 146, rx: 6, ry: 9.5, rot: -18 },
    shine: { cx: 168, cy: 142.5, rx: 2, ry: 3.2 },
    lid: { rotate: 'rotate(-27 176 145)', x: 140, y: 94, w: 72, h: 38, closed: 30 },
    happy: 'M155 150C165 136 184 131 196 138',
  },
} as const;

const BROW_L = 'M82 133C96 124 116 125 136 140L132 144C115 131 98 130 85 137Z';
const BROW_R = 'M148 154L196 108L200 112L160 153Z';
const WINK = 'M83 142C98 130 120 129 143 157C127 147 113 143 99 146C92 147 87 146 83 142Z';
const WINK_LASH = 'M100 150C110 145 122 147 130 152';

const GRIN = 'M82 160C102 173 142 182 199 153C199 170 185 186 160 194C136 201 108 199 96 189C86 181 82 171 82 160Z';
const GRIN_TOOTH = 'M97 177L103 188L110 181L115 192';
/** Ухмылка в покое: та же улыбка с зубами, уже и на правую сторону. */
const SMIRK = 'M102 170C130 179 166 175 197 153C197 168 185 181 164 187C143 192 119 187 102 170Z';

type EyeSide = keyof typeof EYE;

function Eye({ side, uid }: { side: EyeSide; uid: string }) {
  const e = EYE[side];
  const clip = `${uid}-eye-${side}`;
  return (
    <g className={`m-eye m-eye-${side}`}>
      <clipPath id={clip}>
        <path d={e.white} />
      </clipPath>
      <path d={e.white} fill={C.cream} />
      <g clipPath={`url(#${clip})`}>
        <g className="m-pupil">
          <ellipse cx={e.pupil.cx} cy={e.pupil.cy} rx={e.pupil.rx} ry={e.pupil.ry} fill={C.line} transform={`rotate(${e.pupil.rot} ${e.pupil.cx} ${e.pupil.cy})`} />
          <ellipse cx={e.shine.cx} cy={e.shine.cy} rx={e.shine.rx} ry={e.shine.ry} fill={C.cream} transform={`rotate(${e.pupil.rot} ${e.shine.cx} ${e.shine.cy})`} />
        </g>
        <g transform={e.lid.rotate}>
          <rect
            className={`m-lid m-lid-${side}`}
            x={e.lid.x}
            y={e.lid.y}
            width={e.lid.w}
            height={e.lid.h}
            fill={C.body}
            stroke={C.line}
            strokeWidth={3.5}
            style={{ ['--lid-closed' as string]: `${e.lid.closed}px` }}
          />
        </g>
      </g>
      <path d={e.white} fill="none" stroke={C.line} strokeWidth={4} strokeLinejoin="round" />
    </g>
  );
}

export interface MascotProps {
  mood?: MascotMood;
  /** Размер в px (квадрат). */
  size?: number;
  /** Сигнал речи: каждое изменение числа даёт короткую реакцию рта и глаз (слушает). */
  pulse?: number;
  /** Зрачки следят за курсором (в спокойных настроениях). */
  followCursor?: boolean;
  /** Точки «думаю» и «z»: только в крупном размере. */
  details?: boolean;
  /** Без движения: лист эмоций и статичный файл. */
  still?: boolean;
  /** Внешнее движение: меняйте moveKey, чтобы сыграть его ещё раз. */
  move?: MascotMove;
  moveKey?: number;
  /** Подпись для чтения с экрана; без неё рисунок декоративный. */
  label?: string;
  className?: string;
}

export function Mascot({ mood = 'idle', size = 96, pulse = 0, followCursor = false, details, still = false, move, moveKey = 0, label, className }: MascotProps) {
  const uid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const shown = useHeldMood(mood);
  const showDetails = details ?? size >= 96;

  // Короткое движение: атрибут data-move, снимается по окончании
  const play = (m: MascotMove) => {
    const el = ref.current;
    if (!el || still || reducedMotion()) return;
    el.removeAttribute('data-move');
    // перезапуск анимации: чтение размера заставляет браузер применить снятие атрибута
    void el.getBoundingClientRect();
    el.setAttribute('data-move', m);
    window.setTimeout(() => el.getAttribute('data-move') === m && el.removeAttribute('data-move'), MOVE_MS[m] + 40);
  };

  // Движение на входе в настроение; из любого настроения в покой: settle
  const prevMood = useRef<MascotMood | null>(null);
  useEffect(() => {
    const prev = prevMood.current;
    prevMood.current = shown;
    const m = ENTRY_MOVE[shown] ?? (prev && prev !== 'idle' && shown === 'idle' ? 'settle' : undefined);
    if (m) play(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    if (move && moveKey) play(move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move, moveKey]);

  // Моргание по таймеру (не в настроениях с закрытыми глазами)
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

  // В покое изредка переминается
  useEffect(() => {
    if (still || shown !== 'idle' || reducedMotion()) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') play('settle');
        schedule();
      }, rand(AMBIENT_INTERVAL_MS));
    };
    schedule();
    return () => window.clearTimeout(timer);
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
      el.style.setProperty('--gy', `${(dy * k * 0.8).toFixed(2)}px`);
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

  // Реакция на речь: рот приоткрывается, глаза чуть шире (Web Animations, только transform)
  const firstPulse = useRef(pulse);
  useEffect(() => {
    const el = ref.current;
    if (!el || pulse === firstPulse.current || still || reducedMotion()) return;
    const mouth = el.querySelector<SVGGElement>('.m-react-mouth');
    const eyes = el.querySelector<SVGGElement>('.m-react-eyes');
    mouth?.animate([{ transform: 'scale(1, 1)' }, { transform: 'scale(1.18, 1.7)', offset: 0.3 }, { transform: 'scale(1, 1)' }], {
      duration: 460,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    eyes?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
  }, [pulse, still]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      data-mood={shown}
      data-still={still ? '' : undefined}
      className={cn('aid-mascot shrink-0 overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g className="m-pose">
        <g className="m-move">
          <g className="m-loop">
            <g className="m-head">
              <clipPath id={`${uid}-sil`}>
                <path d={HEAD} />
                {SPIKES.map((d) => (
                  <path key={d} d={d} />
                ))}
              </clipPath>
              {/* Обводка: те же формы с толстым контуром под заливкой, получается общий силуэт */}
              <g className="m-outline" fill={C.line} stroke={C.line} strokeWidth={8} strokeLinejoin="round">
                {SPIKES.map((d) => (
                  <path key={d} d={d} />
                ))}
                <path d={HEAD} />
              </g>
              <g className="m-spikes" fill={C.body}>
                {SPIKES.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              <path className="m-skull" d={HEAD} fill={C.body} />
              <g className="m-shade" clipPath={`url(#${uid}-sil)`} fill={C.shade}>
                {SHADES.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              <g fill="none" stroke={C.line} strokeLinecap="round">
                <path d="M114 91C124 101 134 107 148 113" strokeWidth={3.5} />
                <path d="M75 118C80 120 84 122 89 123" strokeWidth={3} />
              </g>
              <circle className="m-cheek" cx={204} cy={144} r={3.6} fill={C.cheek} />
            </g>

            <g className="m-mouths">
              <path className="m-mouth m-mouth-smirk" d={SMIRK} fill={C.cream} stroke={C.line} strokeWidth={4.5} strokeLinejoin="round" />
              <g className="m-mouth m-mouth-grin">
                <path d={GRIN} fill={C.cream} stroke={C.line} strokeWidth={4.5} strokeLinejoin="round" />
                <path d={GRIN_TOOTH} fill="none" stroke={C.line} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              </g>
              <g className="m-mouth m-mouth-open">
                <ellipse cx={146} cy={178} rx={15} ry={12} fill={C.line} />
                <path d="M134 172C141 167 152 167 159 172L157 175C150 172 142 172 136 175Z" fill={C.cream} />
              </g>
              <path className="m-mouth m-mouth-flat" d="M120 179C134 177 150 174 166 168" fill="none" stroke={C.line} strokeWidth={5.5} strokeLinecap="round" />
              <path className="m-mouth m-mouth-wavy" d="M110 182Q117 175 124 182T138 182T152 181T166 177" fill="none" stroke={C.line} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
              <g className="m-react-mouth">
                <ellipse className="m-mouth m-mouth-small" cx={148} cy={178} rx={6.5} ry={5.5} fill={C.line} />
              </g>
            </g>

            <g className="m-react-eyes">
              <g className="m-eyes-open">
                <g className="m-eye-wrap m-eye-wrap-l">
                  <Eye side="l" uid={uid} />
                </g>
                <g className="m-eye-wrap m-eye-wrap-r">
                  <Eye side="r" uid={uid} />
                </g>
              </g>
              <g className="m-eyes-happy" fill="none" stroke={C.line} strokeWidth={5.5} strokeLinecap="round">
                <path d={EYE.l.happy} />
                <path d={EYE.r.happy} />
              </g>
              <g className="m-eye-wink">
                <path d={WINK} fill={C.line} />
                <path d={WINK_LASH} fill="none" stroke={C.line} strokeWidth={3.5} strokeLinecap="round" />
              </g>
            </g>

            <g className="m-brows" fill={C.line}>
              <path className="m-brow m-brow-l" d={BROW_L} />
              <path className="m-brow m-brow-r" d={BROW_R} />
            </g>
          </g>
        </g>
      </g>

      {showDetails && (
        <g className="m-acc" fill="currentColor" stroke="currentColor">
          <g className="m-acc-dots" stroke="none">
            <circle className="m-dot" cx={206} cy={72} r={4} />
            <circle className="m-dot" cx={219} cy={58} r={5} />
            <circle className="m-dot" cx={234} cy={42} r={6} />
          </g>
          <g className="m-acc-z" fill="none" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
            <path className="m-z" d="M204 74h13l-13 15h13" />
            <path className="m-z m-z-2" d="M224 50h9l-9 10h9" strokeWidth={3} />
          </g>
        </g>
      )}
    </svg>
  );
}
