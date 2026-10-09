// Карточка в бенто-сетке: шапка с названием и действиями, тело.

import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface BentoCardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function BentoCard({ title, action, children, className = '', onClick, interactive = false }: BentoCardProps) {
  const baseClass = 'relative overflow-hidden transition-all duration-200';
  const interactiveClass = interactive
    ? 'cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]'
    : '';

  return (
    <Card
      className={`${baseClass} ${interactiveClass} ${className}`}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={title || action ? 'px-6 pb-6' : 'p-6'}>
        {children}
      </div>
    </Card>
  );
}
