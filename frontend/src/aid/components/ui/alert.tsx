// shadcn/ui Alert.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/aid/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-3xl border p-5 text-sm [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-5 [&>svg]:top-5 [&>svg]:size-5 [&>svg~*]:pl-8',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground [&>svg]:text-foreground',
        destructive: 'border-destructive/40 bg-destructive/5 text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn('mb-1 text-base font-semibold leading-tight', className)} {...props} />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
