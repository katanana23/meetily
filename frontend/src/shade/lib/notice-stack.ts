// Одна стопка уведомлений внизу по центру колонки страницы. Внизу то, что показывает
// RecordDock (кнопка записи, капсула, карточка итога, карточки про микрофон), над ним тосты
// (ShadeToaster, sonner). Тосты стоят выше всего, что сейчас в доке, на 8 px (--tile-gap),
// поэтому карточка итога и тост не ложатся друг на друга ни при какой ширине окна.
//
// RecordDock меряет себя и пишет в :root четыре переменные, стиль тостера в globals.css
// (.shade-toaster) их читает:
//   --shade-stack-x       центр колонки дока по горизонтали, px от левого края окна;
//   --shade-stack-w       ширина колонки дока (тосты не шире неё);
//   --shade-stack-bottom  от низа окна до низа дока;
//   --shade-stack-lift    высота содержимого дока плюс зазор; 0, если в доке пусто.
// Подъём идёт через transform (translateY) с плавным переходом: когда карточка уходит или
// появляется, тосты сдвигаются плавно, без скачков раскладки.
'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';

/** Зазор между доком и тостами, как между плитками (--tile-gap). */
export const STACK_GAP = 8;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const VARS = ['--shade-stack-x', '--shade-stack-w', '--shade-stack-bottom', '--shade-stack-lift'] as const;

let last = '';

function write(section: HTMLElement) {
  const rect = section.getBoundingClientRect();
  // Верх содержимого по раскладке (offsetTop), а не по getBoundingClientRect: у появляющихся
  // и уходящих элементов идёт transform, он не должен сдвигать стопку
  let top = section.offsetHeight;
  for (const child of Array.from(section.children) as HTMLElement[]) {
    if (child.offsetHeight > 0) top = Math.min(top, child.offsetTop);
  }
  const content = section.offsetHeight - top;
  const values = [
    `${Math.round(rect.left + rect.width / 2)}px`,
    `${Math.round(rect.width)}px`,
    `${Math.max(0, Math.round(window.innerHeight - rect.bottom))}px`,
    `${content > 0 ? Math.round(content + STACK_GAP) : 0}px`,
  ];
  const key = values.join(' ');
  if (key === last) return;
  last = key;
  const root = document.documentElement.style;
  VARS.forEach((name, i) => root.setProperty(name, values[i]));
}

/**
 * Меряет док и держит переменные стопки в актуальном виде: после каждой отрисовки дока
 * (появилась или ушла карточка), при изменении его размера и окна.
 */
export function useNoticeStackAnchor(ref: RefObject<HTMLElement>) {
  // После каждой отрисовки: уходящая копия карточки и новые элементы
  useIsoLayoutEffect(() => {
    if (ref.current) write(ref.current);
  });

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const update = () => write(section);
    const ro = new ResizeObserver(update);
    ro.observe(section);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      last = '';
      VARS.forEach((name) => document.documentElement.style.removeProperty(name));
    };
  }, [ref]);
}
