// Индикатор приватности: локально, облако или неизвестно.
// Смысл передают текст и иконка, цвет только поддерживает.
'use client';

import { Cloud, ShieldCheck, ShieldWarning, Sparkle, Waveform } from '@phosphor-icons/react';
import { Badge } from '@/aid/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/aid/components/ui/tooltip';
import type { PrivacyInfo, PrivacyLevel, ProviderPrivacy } from '@/aid/lib/privacy';
import { t } from '@/aid/strings';
import { cn } from '@/aid/lib/utils';

const LEVEL = {
  local: { icon: ShieldCheck, label: t('privacyLocal'), hint: t('privacyHintLocal'), variant: 'accent' as const },
  cloud: { icon: Cloud, label: t('privacyCloud'), hint: t('privacyHintCloud'), variant: 'outline' as const },
  unknown: { icon: ShieldWarning, label: t('privacyUnknown'), hint: t('privacyHintUnknown'), variant: 'secondary' as const },
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
      {/* Сетка: колонка иконок и колонка текста, строки начинаются с одной линии */}
      <TooltipContent side="bottom" align="start" className="w-max max-w-[min(460px,calc(100vw-2rem))] p-3">
        <div className="grid grid-cols-[20px_1fr] items-start gap-x-2.5 gap-y-2 text-[13px]">
          <Icon className="mt-px size-5 text-primary-ink" aria-hidden />
          <p className="whitespace-nowrap font-medium">{hint}</p>
          <Waveform className="mt-px size-4 justify-self-center text-muted-foreground" aria-hidden />
          <p className="whitespace-nowrap text-muted-foreground">{line('Транскрипция', privacy.transcript)}</p>
          <Sparkle className="mt-px size-4 justify-self-center text-muted-foreground" aria-hidden />
          <p className="whitespace-nowrap text-muted-foreground">{line('Итоги', privacy.summary)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
