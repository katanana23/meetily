// shadcn/ui ContextMenu на Radix (пакет radix-ui уже в зависимостях): меню по правому клику.
'use client';

import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import { cn } from '@/aid/lib/utils';

// Без модального режима: Radix не блокирует прокрутку страницы (react-remove-scroll)
// и не снимает pointer-events с body, поэтому открытие меню не двигает раскладку.
function ContextMenu({ modal = false, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root modal={modal} {...props} />;
}
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      // data-aid: меню Aid, мост для оригинальных компонентов его не трогает
      data-aid=""
      className={cn(
        'aid-glass aid-glass-pop relative z-50 min-w-[220px] overflow-hidden rounded-tile p-1.5 text-popover-foreground',
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex h-10 cursor-default select-none items-center gap-3 rounded-[calc(var(--tile-radius)-6px)] px-3 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
      destructive ? 'text-destructive' : 'text-foreground',
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator ref={ref} className={cn('my-1 h-px bg-border', className)} {...props} />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator };
