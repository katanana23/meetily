// Знак ShadeNotes: маскот (public/brand/shadenotes.png, из той же картинки, что и
// иконка приложения в src-tauri/icons). В верхней полосе окна 20 px.
'use client';

export const BRAND_MARK_SRC = '/brand/shadenotes.png';

export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- статическая выгрузка без оптимизатора изображений
    <img src={BRAND_MARK_SRC} width={size} height={size} alt="" aria-hidden draggable={false} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  );
}
