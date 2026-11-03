// «Проверить звук» во время записи: какой микрофон и системный звук выбраны,
// видит ли ядро микрофон, и куда идти, чтобы исправить.
// Уровень звука здесь не показываем: ядро не отдаёт его во время записи
// (start_audio_level_monitoring шлёт синтетические значения).
'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle, GearSix, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useConfig } from '@/contexts/ConfigContext';

interface Device {
  name: string;
  device_type: 'Input' | 'Output';
}

export interface SoundState {
  inputs: string[];
  outputs: string[];
  mic: string | null;
  system: string | null;
}

/** Состояние устройств из get_audio_devices и выбора в ConfigContext. */
export function useSoundState(enabled: boolean): SoundState | null {
  const { selectedDevices } = useConfig();
  const [devices, setDevices] = useState<Device[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    invoke<Device[]>('get_audio_devices')
      .then((list) => alive && setDevices(list))
      .catch(() => alive && setDevices([]));
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!devices) return null;
  return {
    inputs: devices.filter((d) => d.device_type === 'Input').map((d) => d.name),
    outputs: devices.filter((d) => d.device_type === 'Output').map((d) => d.name),
    mic: selectedDevices?.micDevice ?? null,
    system: selectedDevices?.systemDevice ?? null,
  };
}

/** Самая вероятная причина тишины одной фразой: с каких устройств идёт запись. */
export function silenceCause(s: SoundState | null): string {
  if (!s) return t('silenceCauseGeneric');
  if (s.inputs.length === 0) return t('silenceCauseNoAccess');
  if (s.mic && !s.inputs.includes(s.mic)) return `${t('silenceCauseMicMissing')} «${s.mic}».`;
  const mic = s.mic ? `${t('microphone')} «${s.mic}»` : t('defaultMicCap');
  const system = s.system ? `${t('systemAudioLower')} «${s.system}»` : t('systemAudioDefaultLower');
  return `${mic}, ${system}. ${t('silenceCauseCheck')}`;
}

function Row({ ok, title, value }: { ok: boolean; title: string; value: string }) {
  const Icon = ok ? CheckCircle : WarningCircle;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={cn('mt-0.5 size-5 shrink-0', ok ? 'text-primary' : 'text-destructive')} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 break-words text-sm text-muted-foreground">{value}</p>
      </div>
    </li>
  );
}

export function SoundCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSoundState(open);
  const access = Boolean(s && s.inputs.length > 0);
  const micFound = Boolean(s && (!s.mic || s.inputs.includes(s.mic)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('soundCheckTitle')}</DialogTitle>
        <DialogDescription>{t('soundCheckHint')}</DialogDescription>
        {s ? (
          <ul className="mt-4 divide-y divide-border">
            <Row ok={access} title={t('micAccess')} value={access ? t('micAccessOk') : t('micAccessNo')} />
            <Row
              ok={access && micFound}
              title={t('microphone')}
              value={micFound ? `«${s.mic ?? t('defaultMic')}»` : `«${s.mic}» ${t('notFound')}`}
            />
            <Row
              ok={Boolean(s.system) || s.outputs.length > 0}
              title={t('systemAudio')}
              value={s.system ? `«${s.system}»` : t('systemAudioDefault')}
            />
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t('loading')}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{t('devicesLocked')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => void invoke('open_system_settings').catch(() => undefined)}>
            <GearSix />
            {t('openSystemSettings')}
          </Button>
          <DialogClose asChild>
            <Button>{t('done')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
