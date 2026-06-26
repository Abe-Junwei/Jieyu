/**
 * WaveSurfer scroll-parent 横向像素（媒体内容坐标系）。
 * 与 tier 主滚动 / viewportFrame.scrollLeftPx 不可混用——时间换算与套索矩形须用此值。
 */
export function readWaveformScrollParentScrollLeftPx(scrollParent: HTMLElement): number {
  return scrollParent.scrollLeft;
}
