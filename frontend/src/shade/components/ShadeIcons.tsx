// Все иконки Shade залитые: weight="fill" по умолчанию для @phosphor-icons/react.
// regular не используем; размер задаётся классом (16 или 20 px).
'use client';

import type { ReactNode } from 'react';
import { IconContext } from '@phosphor-icons/react';

const VALUE = { weight: 'fill' as const, size: '1em' };

export function ShadeIcons({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={VALUE}>{children}</IconContext.Provider>;
}
