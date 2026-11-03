// shadcn/ui Skeleton. Цвет и пульсация из токенов темы (.aid-skeleton в globals.css).
import * as React from 'react';
import { cn } from '@/aid/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('aid-skeleton rounded-nested', className)} {...props} />;
}

export { Skeleton };
