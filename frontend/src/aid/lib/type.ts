// Типографическая шкала ShadeNotes (классы Tailwind одной строкой, чтобы
// заголовки на всех экранах были одинаковыми). Иерархию держат размер и
// насыщенность, а не коробки: вложенных карточек в плитке контента нет.

/** Заголовок страницы: 36/40, вес 700. «Встречи», название встречи, «Настройки». */
export const H1 = 'text-[36px] font-bold leading-10 tracking-[-0.02em] text-foreground';

/** Подпись под заголовком страницы: 14 px серым. */
export const SUB = 'text-sm leading-5 text-muted-foreground';

/** Заголовок секции: 22 px, вес 700. «Итоги», «Не распознано ›», «Сегодня». */
export const H2 = 'text-[22px] font-bold leading-7 tracking-[-0.01em] text-foreground';

/** Название строки списка: 16 px. */
export const ROW_TITLE = 'text-base font-medium leading-6 text-foreground';

/** Вторичная строка в списке: 14 px серым. */
export const ROW_META = 'text-sm leading-5 text-muted-foreground';
