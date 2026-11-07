// shadcn/ui Dialog на Radix: модальное окно с радиусом 24 px, крестик справа.
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CLOSE_BUTTON, CloseGlyph } from '@/aid/components/ui/close-button';
import { cn } from '@/aid/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="aid-dialog-overlay fixed inset-0 z-50" />
    <DialogPrimitive.Content
      ref={ref}
      // data-aid: окно Aid, мост для оригинальных компонентов его не трогает
      data-aid=""
      className={cn(
        // По центру через inset и m-auto, а не translate: появление анимирует transform
        'aid-glass aid-glass-pop fixed inset-0 z-50 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-tile p-6 text-card-foreground focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      {children}
      {/* Общий круглый крестик (ui/close-button.tsx): в углу на равном отступе сверху и справа */}
      <DialogPrimitive.Close className={cn(CLOSE_BUTTON, 'absolute right-3 top-3')}>
        <CloseGlyph />
        <span className="sr-only">Закрыть</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('pr-12 text-lg font-semibold leading-tight', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('mt-2 text-sm leading-relaxed text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-3', className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription, DialogFooter };
