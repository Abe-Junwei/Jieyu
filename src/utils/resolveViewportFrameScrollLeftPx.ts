import { isExtendedDocumentTimeline } from './waveformTierScrollSync';

/** Scroll authority for `TimelineViewportProjection.viewportFrame.scrollLeftPx`. */
export function resolveViewportFrameScrollLeftPx(input: {
  documentSpanSec: number;
  mediaDurSec: number;
  tierScrollLeftPx: number;
  waveformScrollLeftPx: number;
}): number {
  if (isExtendedDocumentTimeline(input.documentSpanSec, input.mediaDurSec)) {
    return input.tierScrollLeftPx;
  }
  return input.waveformScrollLeftPx;
}
