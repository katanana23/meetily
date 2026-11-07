// Экран обработки сам решает, когда открыть сохранённую встречу: по кнопке или через 3 с
// без нажатий (FinishingScreen). Оригинальный useRecordingStop через 2 с после сохранения
// сам переходит на /meeting-details?id=…&source=recording; пока экран обработки на месте,
// этот переход пропускается (lib/in-place-router.tsx). Ушёл экран — переход снова как у оригинала.

let held = false;

export function holdFinish(on: boolean) {
  held = on;
}

export function finishHeld(): boolean {
  return held;
}
