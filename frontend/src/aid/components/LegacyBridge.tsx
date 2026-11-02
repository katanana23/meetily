// Временный мост для оригинальных компонентов внутри Aid: русские тексты
// без правки оригинальных файлов. Наблюдает за DOM и подменяет текст
// и подписи (placeholder, title, aria-label) только внутри областей
// оригинала: контейнеров .aid-legacy и всплывающих окон Radix.
// Цвета подменяет legacy.css. Мост убирается, когда секция переписана в src/aid.
'use client';

import { useEffect } from 'react';
import { looksUntranslated, translate } from '@/aid/lib/legacy-i18n';

const SCOPE = '.aid-legacy, [role="dialog"]:not([data-aid]), [role="alertdialog"]:not([data-aid]), [data-radix-popper-content-wrapper], [role="listbox"], [data-sonner-toast]';
const ATTRS = ['placeholder', 'title', 'aria-label'];
const reported = new Set<string>();

function inScope(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(el?.closest(SCOPE));
}

function report(text: string) {
  if (process.env.NODE_ENV !== 'development' || reported.has(text) || !looksUntranslated(text)) return;
  reported.add(text);
  console.info('[aid] Нет перевода для строки оригинала:', JSON.stringify(text));
}

/** Эмодзи моделей в оригинале → иконка Phosphor (рисует legacy.css по data-aid-icon). */
const EMOJI_ICONS: Record<string, string> = { '⚡': 'lightning', '📦': 'package', '🎯': 'target' };

function translateText(node: Text) {
  const value = node.nodeValue;
  const icon = value ? EMOJI_ICONS[value.trim()] : undefined;
  if (icon && node.parentElement && node.parentElement.childNodes.length === 1) {
    node.parentElement.setAttribute('data-aid-icon', icon);
    node.parentElement.setAttribute('aria-hidden', 'true');
    node.nodeValue = '';
    return;
  }
  if (!value || !/[A-Za-z]/.test(value)) return;
  const next = translate(value);
  if (next == null) {
    report(value.trim());
    return;
  }
  // сохраняем пробелы по краям: JSX часто склеивает текст с соседями
  const lead = value.match(/^\s*/)?.[0] ?? '';
  const trail = value.match(/\s*$/)?.[0] ?? '';
  const replaced = `${lead}${next}${trail}`;
  if (replaced !== value) node.nodeValue = replaced;
}

function translateAttrs(el: Element) {
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value || !/[A-Za-z]/.test(value)) continue;
    const next = translate(value);
    if (next != null && next !== value) el.setAttribute(attr, next);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (inScope(root)) translateText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  // корень может быть вне области, а дети внутри (портал Radix)
  const scoped = el.closest(SCOPE) ? [el] : Array.from(el.querySelectorAll(SCOPE));
  for (const scope of scoped) {
    translateAttrs(scope);
    scope.querySelectorAll('[placeholder],[title],[aria-label]').forEach(translateAttrs);
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) translateText(n as Text);
  }
}

/** Переключатель оригинала без подписи: берём заголовок его строки (axe: button-name). */
function labelSwitches(root: Element) {
  root.querySelectorAll('[role="switch"]:not([aria-label]):not([aria-labelledby])').forEach((sw) => {
    let row: Element | null = sw.parentElement;
    for (let i = 0; i < 4 && row; i++, row = row.parentElement) {
      const title = row.querySelector('h3, h4, .font-semibold, .font-medium');
      if (title?.textContent?.trim()) {
        sw.setAttribute('aria-label', title.textContent.trim());
        return;
      }
    }
  });
}

/** Кнопки-точки шагов мастера оригинала (ProgressIndicator) без подписи: «Шаг N». */
function labelSteps(root: Element) {
  const onboarding = root.closest('.aid-onboarding') ?? root.querySelector('.aid-onboarding');
  onboarding?.querySelectorAll('.flex.items-center.justify-center.gap-2').forEach((row) => {
    Array.from(row.children)
      .filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement)
      .forEach((b, i) => {
        if (!b.getAttribute('aria-label') && !b.textContent?.trim()) b.setAttribute('aria-label', `Шаг ${i + 1}`);
      });
  });
  // значок «i» с подсказкой (Radix Tooltip) без подписи
  onboarding?.querySelectorAll('button[data-state]:not([aria-label])').forEach((b) => {
    if (!b.textContent?.trim()) b.setAttribute('aria-label', 'Подробнее');
  });
  // стрелки «назад» и «вперёд» над шагами (OnboardingContainer)
  onboarding?.querySelectorAll('.justify-between.pointer-events-none > button').forEach((b, i) => {
    if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', i === 0 ? 'Предыдущий шаг' : 'Следующий шаг');
  });
}

// Начального обхода нет: секции оригинала монтируются только на клиенте
// (см. ClientOnly в Settings и обёртку мастера), иначе перевод серверного
// HTML до гидратации дал бы расхождение текста.
export function LegacyBridge() {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          if (inScope(m.target)) translateText(m.target as Text);
        } else if (m.type === 'attributes') {
          if (inScope(m.target)) translateAttrs(m.target as Element);
        } else {
          m.addedNodes.forEach(walk);
          if (m.addedNodes.length && m.target instanceof Element && inScope(m.target)) {
            labelSwitches(m.target);
            labelSteps(m.target);
          }
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
