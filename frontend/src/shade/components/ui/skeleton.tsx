// shadcn/ui Skeleton. Цвет и пульсация из токенов темы (.shade-skeleton в globals.css).
import * as React from 'react';
import { cn } from '@/shade/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shade-skeleton rounded-nested', className)} {...props} />;
}

export { Skeleton };
