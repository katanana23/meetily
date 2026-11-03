// shadcn/ui Button. Монохром: главная кнопка цвета текста темы с инвертированным
// текстом, вторичная на колодце (тон наведения). Размеры 44, 48 и 56 px.
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/aid/lib/utils';

// aid-btn: иконка в кнопке с текстом стоит на своей подложке (globals.css, .aid-btn);
// у кнопки из одной иконки (size icon, aid-btn-icon) подложкой служит сама кнопка
const buttonVariants = cva(
  'aid-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Главная кнопка: цвет текста темы (белая в тёмной, чёрная в светлой), без акцента
        default: 'aid-btn-solid bg-primary text-primary-foreground hover:bg-primary/85',
        destructive: 'aid-btn-solid bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Вторичная кнопка: колодец (тон наведения), без рамки
        outline: 'bg-muted text-foreground hover:bg-input',
        secondary: 'bg-muted text-foreground hover:bg-input',
        ghost: 'text-foreground hover:bg-muted',
        // Ссылка: единственное место с кобальтом
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-11 px-4',
        lg: 'h-12 px-6 text-[15px]',
        // Главные действия (пустые состояния, диалоги, «Сделать итоги»): не ниже 56 px, иконка 20 px
        main: 'h-14 px-6 text-[15px]',
        xl: 'h-14 px-7 text-base',
        icon: 'aid-btn-icon h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
