export interface ViewportFrameScrollLike {
  pxPerDocSec: number;
  scrollLeftPx: number;
}

/** Map document-second range to content-space pixels (tier scroll authority). */
export function docSecRangeToContentPx(
  startSec: number,
  endSec: number,
  frame: ViewportFrameScrollLike,
): { leftPx: number; widthPx: number } {
  const pxPerDocSec = frame.pxPerDocSec;
  if (!Number.isFinite(pxPerDocSec) || pxPerDocSec <= 0) {
    return { leftPx: 0, widthPx: 0 };
  }
  const safeStart = Number.isFinite(startSec) ? startSec : 0;
  const safeEnd = Number.isFinite(endSec) ? endSec : safeStart;
  const lo = Math.min(safeStart, safeEnd);
  const hi = Math.max(safeStart, safeEnd);
  const scrollLeftPx = Number.isFinite(frame.scrollLeftPx) ? frame.scrollLeftPx : 0;
  return {
    leftPx: lo * pxPerDocSec - scrollLeftPx,
    widthPx: (hi - lo) * pxPerDocSec,
  };
}
