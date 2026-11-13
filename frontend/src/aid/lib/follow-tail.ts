// Лента транскрипта во время записи едет за новыми репликами, только если человек уже внизу.
//
// - «Внизу»: до конца прокрутки не больше FOLLOW_SLACK_PX. Прокрутил выше: лента стоит,
//   пока он читает, а над капсулой записи появляется «К новым» (atBottom: false).
// - Рост ленты (новая реплика, печать по буквам) ловит ResizeObserver на самом списке: если
//   человек внизу, в следующем кадре конец ленты ставится на место одним присваиванием
//   scrollTop. Плавная прокрутка не запускается заново на каждую реплику и букву: её
//   повторные старты и давали рывки.
// - «К новым» прокручивает плавно один раз; пока эта прокрутка идёт, промежуточные события
//   прокрутки не считаются уходом наверх. При «уменьшить движение» сразу.
'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Насколько можно быть выше конца, чтобы лента всё ещё ехала за новыми репликами. */
export const FOLLOW_SLACK_PX = 80;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useFollowTail(listRef: RefObject<HTMLElement>, active: boolean) {
  const [atBottom, setAtBottom] = useState(true);
  const pinned = useRef(true);
  /** Идёт прокрутка «К новым»: до конца её не считаем уходом наверх. */
  const jumping = useRef(false);
  const scroller = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.closest<HTMLElement>('.aid-scroll') ?? null;
    scroller.current = el;
    if (!active || !list || !el) return;
    const gap = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    const onScroll = () => {
      const near = gap() <= FOLLOW_SLACK_PX;
      if (jumping.current) {
        if (gap() <= 2) jumping.current = false;
        else return;
      }
      pinned.current = near;
      setAtBottom(near);
    };
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (!pinned.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pinned.current && !jumping.current) el.scrollTop = el.scrollHeight;
      });
    });
    ro.observe(list);
    el.addEventListener('scroll', onScroll, { passive: true });
    // Экран записи открылся с репликами (вернулись из списка): сразу к концу
    el.scrollTop = el.scrollHeight;
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [listRef, active]);

  const jumpToEnd = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = true;
    setAtBottom(true);
    if (reducedMotion()) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    jumping.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  return { atBottom, jumpToEnd };
}
