// Индикатор приватности: локально, облако или неизвестно. Тихая строка сайдбара,
// смысл передают иконка и слово; подробности во всплывающей подсказке.
'use client';

import { Cloud, ShieldCheck, ShieldWarning } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import type { PrivacyInfo, PrivacyLevel, ProviderPrivacy } from '@/aid/lib/privacy';
import { t } from '@/aid/strings';
import { cn } from '@/aid/lib/utils';

const LEVEL = {
  local: { icon: ShieldCheck, label: t('privacyLocal'), hint: t('privacyHintLocal') },
  cloud: { icon: Cloud, label: t('privacyCloud'), hint: t('privacyHintCloud') },
  unknown: { icon: ShieldWarning, label: t('privacyUnknown'), hint: t('privacyHintUnknown') },
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
  const { icon: Icon, label, hint } = LEVEL[privacy.level];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn(
            'flex h-11 cursor-default items-center gap-3 rounded-row px-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={`${t('privacy')}: ${label}. ${hint}`}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="font-medium">{hint}</p>
        <p className="mt-1 opacity-80">{line('Транскрипция', privacy.transcript)}</p>
        <p className="opacity-80">{line('Итоги', privacy.summary)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
