// Индикатор приватности: локально, облако или неизвестно.
// Смысл передают текст и иконка, цвет только поддерживает.
'use client';

import { Cloud, HelpCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/aid/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import type { PrivacyInfo, PrivacyLevel, ProviderPrivacy } from '@/aid/lib/privacy';
import { t } from '@/aid/strings';
import { cn } from '@/aid/lib/utils';

const LEVEL = {
  local: { icon: ShieldCheck, label: t('privacyLocal'), hint: t('privacyHintLocal'), variant: 'accent' as const },
  cloud: { icon: Cloud, label: t('privacyCloud'), hint: t('privacyHintCloud'), variant: 'outline' as const },
  unknown: { icon: HelpCircle, label: t('privacyUnknown'), hint: t('privacyHintUnknown'), variant: 'secondary' as const },
} satisfies Record<PrivacyLevel, unknown>;

const WHERE: Record<PrivacyLevel, string> = {
  local: 'на этом компьютере',
  cloud: 'на сервере провайдера',
  unknown: 'неизвестно где',
};

function line(title: string, p: ProviderPrivacy) {
  return `${title}: ${p.label}, ${WHERE[p.level]}`;
}

export function PrivacyChip({ privacy, className }: { privacy: PrivacyInfo; className?: string }) {
  const { icon: Icon, label, hint, variant } = LEVEL[privacy.level];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={variant}
          tabIndex={0}
          className={cn('h-8 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
          aria-label={`${t('privacy')}: ${label}. ${hint}`}
        >
          <Icon aria-hidden />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <p className="font-medium">{hint}</p>
        <p className="mt-1 opacity-80">{line('Транскрипция', privacy.transcript)}</p>
        <p className="opacity-80">{line('Итоги', privacy.summary)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
