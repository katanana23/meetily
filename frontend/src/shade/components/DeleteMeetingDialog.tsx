// Подтверждение удаления встречи: одно и то же в списке и на странице встречи.
'use client';

import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { Spinner } from '@/shade/components/ui/spinner';
import { Button } from '@/shade/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/shade/components/ui/dialog';
import { t, tDays } from '@/shade/strings';

interface DeleteMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Название встречи, как его видит человек. */
  title?: string;
  onConfirm: () => Promise<void>;
}

export function DeleteMeetingDialog({ open, onOpenChange, title, onConfirm }: DeleteMeetingDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogTitle>{t('deleteTitle')}</DialogTitle>
        <DialogDescription>
          {title ? `«${title}». ` : ''}
          {tDays('deleteHint')}
        </DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="main" disabled={busy}>
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            size="main"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner tone="inherit" /> : <Trash />}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
