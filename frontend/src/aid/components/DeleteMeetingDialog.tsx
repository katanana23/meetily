// Подтверждение удаления встречи: одно и то же в списке и на странице встречи.
'use client';

import { useState } from 'react';
import { CircleNotch, Trash } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { t } from '@/aid/strings';

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
          {t('deleteHint')}
        </DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
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
            {busy ? <CircleNotch className="animate-spin" /> : <Trash />}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
