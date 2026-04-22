export interface ViewportFrameLike {
  pxPerDocSec: number;
}

export function viewportFrameToDocRange(
  frame: ViewportFrameLike,
  leftPx: number,
  widthPx: number,
): { startSec: number; endSec: number } {
  if (!Number.isFinite(frame.pxPerDocSec) || frame.pxPerDocSec <= 0) {
    return { startSec: 0, endSec: 0 };
  }
  const safeLeft = Number.isFinite(leftPx) ? leftPx : 0;
  const safeWidth = Number.isFinite(widthPx) ? Math.max(0, widthPx) : 0;
  const startSec = safeLeft / frame.pxPerDocSec;
  const endSec = (safeLeft + safeWidth) / frame.pxPerDocSec;
  return { startSec, endSec };
}
