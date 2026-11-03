// Знак ShadeNotes в сайдбаре: слот 28 x 28 px. Пока маскота нет, нейтральный
// монохромный знак: круг с затенённой половиной («shade»). Когда появится
// изображение маскота, положить его в public/ и передать путь в src
// (например <BrandMark src="/brand/mascot.png" />): размер слота не изменится.
'use client';

export const BRAND_MARK_SIZE = 28;

export function BrandMark({ src }: { src?: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений
        <img src={src} width={BRAND_MARK_SIZE} height={BRAND_MARK_SIZE} alt="" className="size-7 object-contain" />
      ) : (
        <svg viewBox="0 0 28 28" className="size-7 text-foreground" fill="none">
          <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2" />
          <path d="M14 3a11 11 0 0 0 0 22Z" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}
