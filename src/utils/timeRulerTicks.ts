import { resolveTimelineBindingExtentSec } from './timelineBindingExtent';

/** 标尺刻度与 overview 共用的绑定跨度（秒）；`max(文献, 声学)`，与 `resolveTimelineBindingExtentSec` 同源。 */
export function resolveTimeRulerSpanSec(mediaDurSec: number, documentSpanSec: number): number {
  const media = mediaDurSec > 0 ? mediaDurSec : 0;
  const doc =
    typeof documentSpanSec === 'number' && Number.isFinite(documentSpanSec) && documentSpanSec > 0
      ? documentSpanSec
      : 0;
  return resolveTimelineBindingExtentSec({
    documentSpanSec: doc,
    acousticDurationSec: media,
    hasMediaUrl: media > 0,
    globalPlaybackReady: media > 0,
  });
}

/**
 * 刻度密度应跟可见窗口（像素 / 秒）一致，避免波形 zoom 与 fit 脱节时秒级标签堆叠。
 */
export function resolveTimeRulerPxPerSec(input: {
  zoomPxPerSec: number;
  windowSec: number;
  viewWidthPx: number;
}): number {
  const { zoomPxPerSec, windowSec, viewWidthPx } = input;
  if (windowSec > 0 && viewWidthPx > 0) {
    return viewWidthPx / windowSec;
  }
  return Math.max(zoomPxPerSec, 1e-6);
}

export function buildTimeRulerTicks(input: {
  start: number;
  end: number;
  timelineSpanSec: number;
  minorStep: number;
  majorStep: number;
}): Array<{ time: number; kind: 'major' | 'minor' }> {
  const { start, end, timelineSpanSec, minorStep, majorStep } = input;
  if (!(minorStep > 0) || !(majorStep > 0) || end <= start) return [];
  const nextTicks: Array<{ time: number; kind: 'major' | 'minor' }> = [];
  const t0 = Math.max(0, Math.floor(start / minorStep) * minorStep);
  for (let t = t0; t <= end + 1e-9; t += minorStep) {
    const rounded = Math.round(t * 1e6) / 1e6;
    if (rounded > timelineSpanSec) break;
    const ratio = rounded / majorStep;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    nextTicks.push({ time: rounded, kind: isMajor ? 'major' : 'minor' });
  }
  return nextTicks;
}
