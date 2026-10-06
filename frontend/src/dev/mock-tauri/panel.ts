// Маленькая плавающая панель выбора сценария. Чистый DOM вне дерева React,
// чтобы не трогать компоненты приложения и не мешать гидратации.

import { SCENARIOS, type ScenarioId, switchScenario } from './scenarios';

const PANEL_ID = 'meetily-mock-panel';
const COLLAPSED_KEY = 'meetily.mock.panelCollapsed';

function readCollapsed() {
  try {
    // по умолчанию свёрнута в плашку, чтобы не закрывать тосты приложения
    return window.localStorage.getItem(COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
  } catch {
    /* не критично */
  }
}

function render(root: HTMLElement, current: ScenarioId) {
  const collapsed = readCollapsed();
  root.innerHTML = '';
  root.setAttribute('style', [
    'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483000',
    'font:12px/1.3 system-ui,-apple-system,sans-serif', 'color:#1f2937',
    'background:rgba(255,255,255,.96)', 'border:1px solid #c4b5fd', 'border-radius:10px',
    'box-shadow:0 4px 16px rgba(76,29,149,.18)', 'padding:6px 8px', 'max-width:260px',
  ].join(';'));

  const head = document.createElement('button');
  head.type = 'button';
  head.title = 'Режим заглушек Tauri (только dev). Нажмите, чтобы свернуть или развернуть';
  head.setAttribute('style', 'all:unset;cursor:pointer;display:flex;gap:6px;align-items:center;font-weight:600;color:#6d28d9');
  head.textContent = `MOCK · ${current} ${collapsed ? '▸' : '▾'}`;
  head.onclick = () => {
    writeCollapsed(!collapsed);
    render(root, current);
  };
  root.appendChild(head);
  if (collapsed) return;

  const list = document.createElement('div');
  list.setAttribute('style', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px');
  (Object.keys(SCENARIOS) as ScenarioId[]).forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = id;
    b.title = SCENARIOS[id].description;
    const active = id === current;
    b.setAttribute('style', [
      'all:unset', 'cursor:pointer', 'padding:2px 7px', 'border-radius:6px',
      `border:1px solid ${active ? '#7c3aed' : '#ddd6fe'}`,
      `background:${active ? '#7c3aed' : '#f5f3ff'}`, `color:${active ? '#fff' : '#4c1d95'}`,
    ].join(';'));
    b.onclick = () => switchScenario(id);
    list.appendChild(b);
  });
  root.appendChild(list);

  const hint = document.createElement('div');
  hint.setAttribute('style', 'margin-top:5px;color:#6b7280');
  hint.textContent = SCENARIOS[current].description;
  root.appendChild(hint);
}

export function mountScenarioPanel(current: ScenarioId) {
  const mount = () => {
    if (document.getElementById(PANEL_ID)) return;
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.setAttribute('data-mock-panel', '');
    render(root, current);
    // в <html>, а не в <body>: body гидратирует React, лишний узел там дал бы предупреждение
    document.documentElement.appendChild(root);
  };
  if (document.readyState === 'complete') setTimeout(mount, 300);
  else window.addEventListener('load', () => setTimeout(mount, 300), { once: true });
}
