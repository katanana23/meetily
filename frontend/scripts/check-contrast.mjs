// Проверка контраста «текст на заливке» по APCA (Lc, модель восприятия контраста), обе темы.
// Запуск: pnpm check:contrast. Значения берутся из токенов src/aid/styles/globals.css,
// поэтому правка цвета заливки или текста без пересчёта не пройдёт.
//
// Правило (docs/ui/foundations.md, «Цвет с ролью»): текст и иконка на красной заливке всегда
// белые, на лайме, информации (Indigo) и предупреждении (Giants) всегда #111; тема цвет текста
// на заливке не меняет. Не проходит контраст: меняется заливка, а не текст.
// Подпись кнопки (до 16 px, 500) не ниже Lc 75.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'src/aid/styles/globals.css'), 'utf8');

// APCA-W3 0.0.98G-4g
function luminance([r, g, b]) {
  return 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
}
function apca(text, bg) {
  const clamp = (y) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414);
  const yt = clamp(luminance(text));
  const yb = clamp(luminance(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// Токены `--name: H S% L%;` из блока селектора (`:root` или `.dark`)
function readTokens(selector) {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`В globals.css нет блока ${selector}`);
  const end = CSS.indexOf('\n  }', start);
  const tokens = {};
  for (const m of CSS.slice(start, end).matchAll(/--([\w-]+):\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)) {
    tokens[m[1]] = hslToRgb(Number(m[2]), Number(m[3]), Number(m[4]));
  }
  return tokens;
}

const light = readTokens(':root');
const themes = { light, dark: { ...light, ...readTokens('.dark') } };

// [текст, заливка, минимум Lc]
const PAIRS = [
  ['destructive-foreground', 'destructive', 75], // удаление, ошибка
  ['record-foreground', 'record', 75], // «Остановить», точка записи
  ['primary-foreground', 'primary', 75], // лайм: «Записать», вкладка, переключатель
  ['on-role', 'indigo', 75], // информация и итоги
  ['on-role', 'giants', 75], // предупреждение, «Не распознано»
  ['nav-active-foreground', 'nav-active', 75], // выбранный раздел сайдбара
];

let failed = 0;
const lines = [];
for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      lines.push(`FAIL ${theme.padEnd(5)} --${fg} / --${bg}: токена нет`);
      failed++;
      continue;
    }
    const lc = Math.abs(apca(tokens[fg], tokens[bg]));
    const ok = lc >= min;
    if (!ok) failed++;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${hex(tokens[fg])} на ${hex(tokens[bg])}  Lc ${lc.toFixed(1).padStart(5)} (от ${min})  --${fg} / --${bg}`);
  }
}

// Цвет текста на заливке тема не меняет
for (const [fg] of PAIRS) {
  if (hex(themes.light[fg] ?? []) !== hex(themes.dark[fg] ?? [])) {
    lines.push(`FAIL --${fg}: в светлой ${hex(themes.light[fg])}, в тёмной ${hex(themes.dark[fg])}; текст на заливке тема не меняет`);
    failed++;
  }
}

// Красная заливка без своего цвета текста: bg-destructive / bg-record вместе с text-* в одном классе
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}
// Цвет текста, который нельзя ставить рядом с сплошной красной заливкой
const BAD_TEXT = /^(?:[\w-]+:)*text-(?:white|black|foreground|on-role|muted-foreground|primary-foreground|primary-ink|destructive|destructive-ink|record|giants-ink|indigo-ink|\[(?:#|hsl|rgb).*)$/;
const RED_FILL = /^bg-(?:destructive|record)$/;
for (const file of walk(join(ROOT, 'src/aid'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const tokens = line.split(/[\s"'`{}]+/);
      if (tokens.some((t) => RED_FILL.test(t)) && tokens.some((t) => BAD_TEXT.test(t))) {
        lines.push(`FAIL ${file.slice(ROOT.length + 1)}:${i + 1}: цвет текста на красной заливке переопределён, используйте variant="destructive"`);
        failed++;
      }
    });
}

console.log(lines.join('\n'));
if (failed) {
  console.error(`\nКонтраст текста на заливках: не прошло ${failed}`);
  process.exit(1);
}
console.log('\nКонтраст текста на заливках: всё проходит');
