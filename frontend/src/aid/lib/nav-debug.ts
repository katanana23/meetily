// ВРЕМЕННО (седьмой круг): журнал кликов по списку встреч для проверки на Mac.
// В браузерах клик по строке открывает встречу, а в Tauri на macOS не открывал.
// Журнал показывает, доходят ли события до страницы и чем заканчивается переход:
// - pointerdown, mousedown, mouseup, click, dragstart внутри списка (фаза захвата);
// - что лежит в точке события (elementFromPoint) и отменено ли событие к концу всплытия;
// - смена адреса после клика или её отсутствие через 1,5 с.
// Пишет в консоль с префиксом [aid:nav] и в window.__aidNavLog (последние 50 записей).
// Убрать после проверки на Mac вместе с вызовом в app/layout.tsx.
'use client';

type Entry = Record<string, unknown>;

declare global {
  interface Window {
    __aidNavLog?: Entry[];
  }
}

let installed = false;

function describe(el: Element | null): string {
  if (!el) return 'null';
  const parts: string[] = [];
  for (let e: Element | null = el; e && parts.length < 4; e = e.parentElement) {
    const cls = typeof e.className === 'string' ? e.className.split(' ').slice(0, 2).join('.') : '';
    parts.push(`${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
  }
  return parts.join(' < ');
}

function log(entry: Entry) {
  const list = (window.__aidNavLog ??= []);
  list.push({ t: Math.round(performance.now()), ...entry });
  if (list.length > 50) list.shift();
  console.info('[aid:nav]', JSON.stringify(entry));
}

export function installNavDebug() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const inList = (e: Event) => Boolean((e.target as Element | null)?.closest?.('main ul[aria-label] > li'));

  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dragstart'] as const) {
    document.addEventListener(
      type,
      (e) => {
        if (!inList(e)) return;
        const me = e as MouseEvent;
        const top = document.elementFromPoint(me.clientX, me.clientY);
        log({ type, target: describe(e.target as Element), atPoint: describe(top), x: me.clientX, y: me.clientY, href: location.pathname + location.search });
        // Итог всплытия: отменил ли кто-то событие (preventDefault)
        setTimeout(() => {
          if (e.defaultPrevented) log({ type: `${type}:prevented`, target: describe(e.target as Element) });
        }, 0);
        if (type === 'click') {
          const from = location.href;
          setTimeout(() => log({ type: 'nav-result', ok: location.href !== from, href: location.pathname + location.search }), 1500);
        }
      },
      true,
    );
  }
}
