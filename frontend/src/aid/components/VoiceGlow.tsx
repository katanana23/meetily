// Свечение голоса (VoiceGlow): эффект ИИ-момента по нижнему краю плитки транскрипта,
// за капсулой записи. Перенос прототипа docs/prototypes/voice-glow.html на свой WebGL.
//
// Режимы:
// - listen: запись, свечение поднимается от края вместе с голосом (уровень из ядра,
//   lib/recording-level.ts; быстрая атака 45 мс, медленный спад 260 мс);
// - paused: гаснет до тонкой линии по краю;
// - think: ИИ готовит итоги, мягкий холм ходит из стороны в сторону;
// - off: уходит за 0,4 с, потом цикл стоит и холст пустой.
//
// Расход: один requestAnimationFrame, кадры только пока свечение видно на экране и окно
// активно (в фокусе и не свёрнуто), холст в 1× (свечение мягкое, Retina не нужна) и
// только высотой зоны свечения (--glow-h). При prefers-reduced-motion, prefers-reduced-transparency и без WebGL
// вместо холста статичная мягкая полоса (.aid-glow-static).
//
// Размещение: первым ребёнком плитки с классом relative isolate. Слой во всю плитку,
// обрезан по её скруглению (overflow: clip, не hidden: hidden сделал бы его областью
// прокрутки и сломал sticky); внутри холст прилипает к нижнему краю видимой области,
// поэтому свечение у капсулы, даже когда плитка длиннее экрана. Слой под текстом
// (-z-10 внутри isolate), последняя реплика выше зоны: у плитки снизу запас --glow-h.
'use client';

import { useEffect, useRef, useState } from 'react';
import { onRecordingLevel, readRecordingLevel, voiceAmount } from '@/aid/lib/recording-level';
import { cn } from '@/aid/lib/utils';

export type VoiceGlowMode = 'listen' | 'paused' | 'think' | 'off';

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';

// По мотивам прототипа: цвет течёт вдоль края, холмы растут с голосом, мягкая кромка
// по краю и скруглениям. Отличия: холмы из трёх бегущих синусоид (плавные волны без
// столбов шума), ядро с широким ореолом (граница уходит в фон), размеры в CSS-пикселях
// (одинаковые волны на любой ширине плитки), скругление только снизу, uAmp для ухода,
// uLine для паузы (тонкая линия), верх холста всегда пустой: там последняя реплика.
const FS = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime, uLevel, uThink, uSweep, uRadius, uDark, uAmp, uLine, uPx;

float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
vec3 apal(float t){
  t = fract(t);
  // Розовый, персиковый, сиреневый, барвинок: соседние цвета смешиваются без серого
  vec3 c0 = vec3(1., .40, .50), c1 = vec3(1., .72, .45), c2 = vec3(.76, .50, .98), c3 = vec3(.52, .60, 1.);
  float s = t * 4.;
  return s < 1. ? mix(c0, c1, s) : s < 2. ? mix(c1, c2, s - 1.) : s < 3. ? mix(c2, c3, s - 2.) : mix(c3, c0, s - 3.);
}

void main(){
  vec2 px = gl_FragCoord.xy;
  float W = uRes.x, H = uRes.y;
  // Плитка уходит вверх за холст: скругление и кромка только у нижнего края
  float sd = sdRoundBox(px - vec2(W * .5, H * 2.), vec2(W * .5, H * 2.), uRadius);
  float inside = 1. - smoothstep(-1., 1., sd);
  if (inside <= 0. || uAmp <= 0.) { gl_FragColor = vec4(0.); return; }
  // Всё в CSS-пикселях: волны одного размера на любой ширине плитки
  float X = px.x / uPx;
  float y = px.y / uPx;
  float top = H / uPx;
  float x = px.x / W;
  float t = uTime;
  float L = uLevel;

  // Цвет медленно течёт вдоль края: один слой гладкого шума, без ряби
  float flow = vnoise(vec2(X / 420. - t * .1, t * .05));
  vec3 hue = apal(X / 1100. + flow * .55 + t * .04);

  // Волны: три бегущие синусоиды разной длины, сумма даёт плавные холмы без столбов
  float w = sin(X / 83. + t * .9) * .5
          + sin(X / 49. - t * 1.25 + 1.7) * .32
          + sin(X / 31. + t * 1.7 + 4.1) * .18;
  w = smoothstep(-.9, .9, w);
  // Холмы то выше, то ниже: медленный шум по длине волны
  float swell = .55 + .45 * vnoise(vec2(X / 520. + t * .18, t * .12));
  float h = 14. + L * (26. + 120. * w * swell);
  // Думает: мягкий холм ходит из стороны в сторону
  float lump = exp(-pow((x - uSweep) / .22, 2.));
  h = mix(h, 16. + 96. * lump * (.75 + .25 * w), uThink);
  // Пауза: тонкая линия по краю
  h = mix(h, 3., uLine);

  // Ядро и широкий тихий ореол: граница уходит в фон, а не обрывается
  float g = exp(-pow(y / max(h, 1.), 1.5));
  float halo = exp(-pow(y / max(h * 2.2, 1.), 1.3));
  vec3 col = hue * (g * (.5 + .8 * L + .45 * uThink) + halo * (.16 + .2 * L));

  // Кромка по краю и скруглениям: широкая и тихая
  float rim = exp(sd / (10. * uPx)) * smoothstep(60., 0., y);
  col += mix(hue, vec3(1.), .3) * rim * (.2 + .35 * L + .2 * uThink);
  col += vec3(1.) * pow(g, 5.) * (.05 + .2 * L + .1 * uThink);

  // Верх холста пустой и сходит на нет плавно: последняя реплика над свечением
  col *= smoothstep(top, top * .35, y);

  col = 1. - exp(-col * 1.1);
  col *= mix(.9, 1., uDark) * mix(1., .6, uLine) * uAmp;
  float a = clamp(max(col.r, max(col.g, col.b)) * mix(1.1, 1., uDark), 0., 1.) * inside;
  gl_FragColor = vec4(col * inside, a);
}`;

const UNIFORMS = ['uRes', 'uTime', 'uLevel', 'uThink', 'uSweep', 'uRadius', 'uDark', 'uAmp', 'uLine', 'uPx'] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

/** Радиус плитки, px (--tile-radius). */
const TILE_RADIUS = 24;
/** Масштаб холста: 1 CSS px на пиксель холста, не DPR экрана. */
const RENDER_SCALE = 1;
// Уровень свечения в тишине при записи (0..1)
const LISTEN_FLOOR = 0.15;
/** Уход после «Остановить», мс. */
const FADE_OUT_MS = 400;

/**
 * Свечение, которое пропадает с экрана, сначала уходит (off, 0,4 с) и только потом
 * размонтируется. mode null: свечения нет. Возвращает режим для VoiceGlow или null.
 */
export function useGlowPresence(mode: VoiceGlowMode | null): VoiceGlowMode | null {
  const [leaving, setLeaving] = useState(false);
  const wasOn = useRef(mode !== null);
  useEffect(() => {
    if (mode !== null) {
      wasOn.current = true;
      setLeaving(false);
      return;
    }
    if (!wasOn.current) return;
    wasOn.current = false;
    setLeaving(true);
    const id = window.setTimeout(() => setLeaving(false), FADE_OUT_MS + 50);
    return () => window.clearTimeout(id);
  }, [mode]);
  return mode ?? (leaving ? 'off' : null);
}

function useStaticGlow(): boolean {
  const [isStatic, setStatic] = useState(false);
  useEffect(() => {
    const queries = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)'].map((q) => window.matchMedia(q));
    const update = () => setStatic(queries.some((q) => q.matches));
    update();
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return isStatic;
}

function createProgram(gl: WebGLRenderingContext): Uniforms | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[aid] VoiceGlow: шейдер не собрался', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  const pr = gl.createProgram();
  if (!vs || !fs || !pr) return null;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // Один треугольник на весь холст
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(pr, n)])) as Uniforms;
}

export function VoiceGlow({ mode, className }: { mode: VoiceGlowMode; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const wakeRef = useRef<() => void>(() => undefined);
  const prefersStatic = useStaticGlow();
  const [noWebGL, setNoWebGL] = useState(false);
  const isStatic = prefersStatic || noWebGL;

  useEffect(() => wakeRef.current(), [mode]);

  useEffect(() => {
    if (isStatic) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    const U = gl && createProgram(gl);
    if (!gl || !U) {
      setNoWebGL(true);
      return;
    }

    let raf = 0;
    let last = 0;
    let time = 0;
    let level = 0;
    let think = modeRef.current === 'think' ? 1 : 0;
    let line = modeRef.current === 'paused' ? 1 : 0;
    let amp = modeRef.current === 'off' ? 0 : 1;
    let sweep = 0;
    let dpr = 1;
    let visible = false;
    let cleared = true;

    const active = () => document.visibilityState === 'visible' && document.hasFocus();

    const resize = () => {
      // Свечение мягкое: холст в 1×, на Retina в 4 раза меньше работы шейдера без видимой разницы
      dpr = RENDER_SCALE;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        // Холст после смены размера пустой: один кадр, даже если цикл стоит
        if (!raf && amp > 0) draw();
      }
    };

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (amp <= 0) {
        cleared = true;
        return;
      }
      cleared = false;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uLevel, level);
      gl.uniform1f(U.uThink, think);
      gl.uniform1f(U.uSweep, 0.5 + 0.32 * Math.sin(sweep));
      gl.uniform1f(U.uRadius, TILE_RADIUS * dpr);
      gl.uniform1f(U.uDark, document.documentElement.classList.contains('dark') ? 1 : 0);
      gl.uniform1f(U.uAmp, amp);
      gl.uniform1f(U.uLine, line);
      gl.uniform1f(U.uPx, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(64, last ? now - last : 16);
      last = now;
      const m = modeRef.current;
      time += dt / 1000;
      sweep += dt * 0.0016;

      // В тишине свечение не гаснет до нитки: низкие холмы остаются, голос их поднимает
      const target = m === 'listen' ? LISTEN_FLOOR + (1 - LISTEN_FLOOR) * voiceAmount(readRecordingLevel()) : m === 'think' ? 0.28 : 0;
      // Быстрая атака, медленный спад
      const k = target > level ? 1 - Math.exp(-dt / 45) : 1 - Math.exp(-dt / 260);
      level += (target - level) * k;
      think += ((m === 'think' ? 1 : 0) - think) * (1 - Math.exp(-dt / 380));
      line += ((m === 'paused' ? 1 : 0) - line) * (1 - Math.exp(-dt / 220));
      amp = m === 'off' ? Math.max(0, amp - dt / FADE_OUT_MS) : Math.min(1, amp + dt / 240);

      draw();
      // Ушло (off) и холст пуст: цикл стоит до смены режима
      if (m === 'off' && amp <= 0) return;
      if (visible && active()) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf) return;
      if (modeRef.current === 'off' && amp <= 0) {
        if (!cleared) draw();
        return;
      }
      if (!visible || !active()) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const sleep = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    wakeRef.current = wake;

    const onActivity = () => (active() ? wake() : sleep());
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) wake();
      else sleep();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    // Уровень приходит ~30 раз в секунду; цикл кадров живёт сам, подписка держит источник
    const offLevel = onRecordingLevel(() => undefined);
    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('focus', onActivity);
    window.addEventListener('blur', onActivity);
    const onLost = (e: Event) => {
      e.preventDefault();
      sleep();
      setNoWebGL(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      sleep();
      wakeRef.current = () => undefined;
      io.disconnect();
      ro.disconnect();
      offLevel();
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('focus', onActivity);
      window.removeEventListener('blur', onActivity);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [isStatic]);

  return (
    <div className={cn('pointer-events-none absolute inset-0 -z-10 flex flex-col justify-end overflow-clip rounded-tile', className)} aria-hidden>
      <div className="aid-glow sticky bottom-0 shrink-0">
        {isStatic ? <span className="aid-glow-static" data-mode={mode} /> : <canvas ref={canvasRef} className="block size-full" />}
      </div>
    </div>
  );
}
