// Иконки ShadeNotes: Solar Bold из components/icons.tsx (залитые, размер 1em, задаётся
// классом). Обёртка осталась, чтобы не менять разметку каркаса; контекст иконкам не нужен.
'use client';

import type { ReactNode } from 'react';

export function AidIcons({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
