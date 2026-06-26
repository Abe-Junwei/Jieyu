import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { useWaveSurfer } from '~/hooks/media/useWaveSurfer';
import { useLatest } from '../hooks/ui/useLatest';
import { applyTimelineViewportScroll } from '../utils/applyTimelineViewportScroll';
import { isExtendedDocumentTimeline } from '../utils/waveformTierScrollSync';

type PlayerSlice = Pick<ReturnType<typeof useWaveSurfer>, 'instanceRef' | 'isReady' | 'duration'>;

/**
 * Syncs tier horizontal scroll with WaveSurfer; resets tier scroll when media first attaches from empty.
 */
export function useWaveformBridgeTierScrollSync(input: {
  tierContainerRef: RefObject<HTMLDivElement | null>;
  player: PlayerSlice;
  selectedMediaUrl: string | undefined;
  documentSpanSec: number;
  zoomPxPerSec: number;
  commitWaveformScrollLeft: (nextScrollLeft: number) => void;
  onTierScrollLeftPx?: (nextScrollLeft: number) => void;
}): void {
  const {
    tierContainerRef,
    player,
    selectedMediaUrl,
    documentSpanSec,
    zoomPxPerSec,
    commitWaveformScrollLeft,
    onTierScrollLeftPx,
  } = input;
  const previousSelectedMediaUrlForTierResetRef = useRef(selectedMediaUrl);
  const zoomPxPerSecRef = useLatest(zoomPxPerSec);

  useLayoutEffect(() => {
    const tier = tierContainerRef.current;
    if (!tier) return;
    const ws = player.instanceRef.current;
    if (!ws) {
      onTierScrollLeftPx?.(tier.scrollLeft);
      return;
    }
    const mediaDur = player.duration || 0;
    const zoomPxPerSecLive = zoomPxPerSecRef.current;
    const targetScrollLeftPx = isExtendedDocumentTimeline(documentSpanSec, mediaDur)
      ? tier.scrollLeft
      : ws.getScroll();
    const { waveformScrollLeftPx, tierScrollLeftPx } = applyTimelineViewportScroll({
      tier,
      ws,
      documentSpanSec,
      mediaDurSec: mediaDur,
      zoomPxPerSec: zoomPxPerSecLive,
      targetScrollLeftPx,
    });
    commitWaveformScrollLeft(waveformScrollLeftPx);
    onTierScrollLeftPx?.(tierScrollLeftPx);
  }, [
    commitWaveformScrollLeft,
    onTierScrollLeftPx,
    selectedMediaUrl,
    tierContainerRef,
    player.instanceRef,
    player.isReady,
    player.duration,
    documentSpanSec,
    zoomPxPerSecRef,
  ]);

  useLayoutEffect(() => {
    const prev = previousSelectedMediaUrlForTierResetRef.current;
    const cur = selectedMediaUrl;
    previousSelectedMediaUrlForTierResetRef.current = cur;
    const wasEmpty = typeof prev !== 'string' || prev.trim() === '';
    const nowHas = typeof cur === 'string' && cur.trim() !== '';
    if (!wasEmpty || !nowHas) return;
    const tier = tierContainerRef.current;
    const ws = player.instanceRef.current;
    const { waveformScrollLeftPx, tierScrollLeftPx } = applyTimelineViewportScroll({
      tier,
      ws,
      documentSpanSec,
      mediaDurSec: player.duration || 0,
      zoomPxPerSec: zoomPxPerSecRef.current,
      targetScrollLeftPx: 0,
    });
    commitWaveformScrollLeft(waveformScrollLeftPx);
    onTierScrollLeftPx?.(tierScrollLeftPx);
  }, [
    selectedMediaUrl,
    tierContainerRef,
    player.instanceRef,
    player.duration,
    documentSpanSec,
    commitWaveformScrollLeft,
    onTierScrollLeftPx,
    zoomPxPerSecRef,
  ]);
}
