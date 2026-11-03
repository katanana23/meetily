// Кнопка «Назад»: круг 56 px на колодце (тон наведения) с шевроном 16 px, подпись
// только во всплывающей подсказке (и в aria-label). Одна и та же на встрече,
// в настройках и на экране записи. CaretLeft weight="bold": исключение из правила fill.
'use client';

import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';

const CLASS =
  'flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BackButton({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const icon = <CaretLeft weight="bold" className="size-4" aria-hidden />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label} className={CLASS}>
            {icon}
          </Link>
        ) : (
          <button type="button" onClick={onClick} aria-label={label} className={CLASS}>
            {icon}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
