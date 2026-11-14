// Общие классы первого запуска.
import { cn } from '@/shade/lib/utils';

/**
 * Главная кнопка шага (56 px, лайм). Неактивная нейтральная приглушённая, а не бледный лайм
 * (на тёмном он выходил грязно-оливковым). Во время сохранения кнопка остаётся лаймовой со
 * спиннером: это ожидание, а не запрет.
 */
export const mainButtonClass = (busy: boolean, extra?: string) =>
  cn('w-full', busy ? 'disabled:opacity-100' : 'disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100', extra);

/** Заголовок шага: 22/28, ровные строки (balance), колонка около 30 символов. */
export const TITLE_CLASS = 'max-w-[30ch] text-balance text-[22px] font-bold leading-7';

/** Описание: 15/24, без висящих слов (pretty), колонка до 52 символов. */
export const HINT_CLASS = 'max-w-[52ch] text-pretty text-[15px] leading-6 text-muted-foreground';

/** Неразрывный пробел: «сделает Shade», «к микрофону» не разрываются. */
export const NBSP = ' ';
