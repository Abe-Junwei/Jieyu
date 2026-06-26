import type WaveSurfer from 'wavesurfer.js';
import { resolveViewportFrameScrollLeftPx } from './resolveViewportFrameScrollLeftPx';
import {
  isExtendedDocumentTimeline,
  syncWaveScrollToTierOverlayLeft,
} from './waveformTierScrollSync';

export function clampTierScrollLeftPx(tier: HTMLElement, targetScrollLeftPx: number): number {
  const maxScroll = Math.max(0, tier.scrollWidth - tier.clientWidth);
  return Math.min(maxScroll, Math.max(0, targetScrollLeftPx));
}

export type ApplyTimelineViewportScrollInput = {
  tier: HTMLElement | null;
  ws: WaveSurfer | null;
  documentSpanSec: number;
  mediaDurSec: number;
  zoomPxPerSec: number;
  targetScrollLeftPx: number;
};

export type ApplyTimelineViewportScrollResult = {
  tierScrollLeftPx: number;
  waveformScrollLeftPx: number;
  viewportScrollLeftPx: number;
};

/** 阶段 B：横向滚动 DOM 写入单入口（tier 主 / WS 主 / 纯文本）。 */
export function applyTimelineViewportScroll(
  input: ApplyTimelineViewportScrollInput,
): ApplyTimelineViewportScrollResult {
  const { tier, ws, documentSpanSec, mediaDurSec, zoomPxPerSec, targetScrollLeftPx } = input;
  const extended = isExtendedDocumentTimeline(documentSpanSec, mediaDurSec);

  if (extended && tier) {
    const tierScrollLeftPx = clampTierScrollLeftPx(tier, targetScrollLeftPx);
    tier.scrollLeft = tierScrollLeftPx;
    let waveformScrollLeftPx = tierScrollLeftPx;
    if (ws && mediaDurSec > 0 && zoomPxPerSec > 0) {
      waveformScrollLeftPx = syncWaveScrollToTierOverlayLeft(
        ws,
        tierScrollLeftPx,
        zoomPxPerSec,
        mediaDurSec,
      );
    }
    return {
      tierScrollLeftPx,
      waveformScrollLeftPx,
      viewportScrollLeftPx: resolveViewportFrameScrollLeftPx({
        documentSpanSec,
        mediaDurSec,
        tierScrollLeftPx,
        waveformScrollLeftPx,
      }),
    };
  }

  if (ws) {
    ws.setScroll(targetScrollLeftPx);
    const waveformScrollLeftPx = ws.getScroll();
    if (tier) {
      tier.scrollLeft = waveformScrollLeftPx;
    }
    const tierScrollLeftPx = tier?.scrollLeft ?? waveformScrollLeftPx;
    return {
      tierScrollLeftPx,
      waveformScrollLeftPx,
      viewportScrollLeftPx: resolveViewportFrameScrollLeftPx({
        documentSpanSec,
        mediaDurSec,
        tierScrollLeftPx,
        waveformScrollLeftPx,
      }),
    };
  }

  if (tier && documentSpanSec > 0) {
    const tierScrollLeftPx = clampTierScrollLeftPx(tier, targetScrollLeftPx);
    tier.scrollLeft = tierScrollLeftPx;
    return {
      tierScrollLeftPx,
      waveformScrollLeftPx: tierScrollLeftPx,
      viewportScrollLeftPx: tierScrollLeftPx,
    };
  }

  return { tierScrollLeftPx: 0, waveformScrollLeftPx: 0, viewportScrollLeftPx: 0 };
}

export function applyTimelineViewportWheelPan(
  input: Omit<ApplyTimelineViewportScrollInput, 'targetScrollLeftPx'> & { deltaPx: number },
): ApplyTimelineViewportScrollResult {
  const { tier, ws, documentSpanSec, mediaDurSec, deltaPx } = input;
  const extended = isExtendedDocumentTimeline(documentSpanSec, mediaDurSec);

  if (extended && tier) {
    return applyTimelineViewportScroll({
      ...input,
      targetScrollLeftPx: tier.scrollLeft + deltaPx,
    });
  }

  if (ws) {
    return applyTimelineViewportScroll({
      ...input,
      targetScrollLeftPx: ws.getScroll() + deltaPx,
    });
  }

  if (tier) {
    return applyTimelineViewportScroll({
      ...input,
      targetScrollLeftPx: tier.scrollLeft + deltaPx,
    });
  }

  return { tierScrollLeftPx: 0, waveformScrollLeftPx: 0, viewportScrollLeftPx: 0 };
}
