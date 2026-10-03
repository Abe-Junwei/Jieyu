/** 1:1 is 100 px per second, as a percent of fit-all (100 = the whole span fills the viewport). */
export function resolveOneToOneZoomPercent(fitPxPerSec: number): number {
  if (!(fitPxPerSec > 0) || !Number.isFinite(fitPxPerSec)) return 100;
  return Math.round((100 / fitPxPerSec) * 100);
}

/**
 * Fit-all (100) is the widest view, except when 100 px/s is coarser than that.
 * The slider and 1:1 can then sit below 100 so they are not clamped back to fit-all.
 */
export function resolveTimelineZoomPercentMin(fitPxPerSec: number): number {
  const oneToOne = resolveOneToOneZoomPercent(fitPxPerSec);
  if (!Number.isFinite(oneToOne) || oneToOne >= 100) return 100;
  return Math.max(1, oneToOne);
}

export function clampTimelineZoomPercent(
  percent: number,
  fitPxPerSec: number,
  maxZoomPercent: number,
): number {
  const minZoomPercent = resolveTimelineZoomPercentMin(fitPxPerSec);
  const maxZoom = Math.max(minZoomPercent, maxZoomPercent);
  return Math.max(minZoomPercent, Math.min(maxZoom, Math.round(percent)));
}

export function timelineZoomSliderPosition(
  zoomPercent: number,
  fitPxPerSec: number,
  maxZoomPercent: number,
): number {
  const minZoomPercent = resolveTimelineZoomPercentMin(fitPxPerSec);
  const maxZoom = Math.max(minZoomPercent, maxZoomPercent);
  if (maxZoom <= minZoomPercent) return 0;
  const span = Math.log(maxZoom / minZoomPercent);
  if (!(span > 0)) return 0;
  const clamped = clampTimelineZoomPercent(zoomPercent, fitPxPerSec, maxZoom);
  const ratio = Math.log(clamped / minZoomPercent) / span;
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 1000);
}

export function timelineZoomPercentFromSlider(
  position: number,
  fitPxPerSec: number,
  maxZoomPercent: number,
): number {
  const minZoomPercent = resolveTimelineZoomPercentMin(fitPxPerSec);
  const maxZoom = Math.max(minZoomPercent, maxZoomPercent);
  const t = Math.min(1000, Math.max(0, position)) / 1000;
  if (maxZoom <= minZoomPercent) return minZoomPercent;
  const percent = minZoomPercent * Math.pow(maxZoom / minZoomPercent, t);
  return clampTimelineZoomPercent(percent, fitPxPerSec, maxZoom);
}
