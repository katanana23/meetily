// Индикатор приватности: локально / облако / неизвестно.

import { Shield, Cloud, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '../strings';
import { PrivacyLevel } from '../lib/privacy';

interface PrivacyChipProps {
  level: PrivacyLevel;
  className?: string;
}

export function PrivacyChip({ level, className = '' }: PrivacyChipProps) {
  const config = {
    local: {
      icon: Shield,
      label: t('privacyLocal'),
      hint: t('privacyHintLocal'),
      variant: 'default' as const,
      className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    },
    cloud: {
      icon: Cloud,
      label: t('privacyCloud'),
      hint: t('privacyHintCloud'),
      variant: 'secondary' as const,
      className: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
    },
    unknown: {
      icon: HelpCircle,
      label: t('privacyUnknown'),
      hint: t('privacyHintUnknown'),
      variant: 'outline' as const,
      className: 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
    },
  };

  const { icon: Icon, label, hint, className: variantClass } = config[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1.5 ${variantClass} ${className}`}>
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
