import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { useWaveSurfer } from '~/hooks/media/useWaveSurfer';
import { useLatest } from '../hooks/ui/useLatest';
import {
  applyTierScrollToWaveSurfer,
  isExtendedDocumentTimeline,
} from '../utils/waveformTierScrollSync';

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
    if (isExtendedDocumentTimeline(documentSpanSec, mediaDur)) {
      const overlayScrollLeft = applyTierScrollToWaveSurfer({
        ws,
        tierScrollLeftPx: tier.scrollLeft,
        zoomPxPerSec: zoomPxPerSecLive,
        mediaDurSec: mediaDur,
        documentSpanSec,
      });
      commitWaveformScrollLeft(overlayScrollLeft);
      onTierScrollLeftPx?.(tier.scrollLeft);
      return;
    }
    const nextScrollLeft = ws.getScroll();
    if (Math.abs(tier.scrollLeft - nextScrollLeft) > 0.5) {
      tier.scrollLeft = nextScrollLeft;
    }
    commitWaveformScrollLeft(nextScrollLeft);
    onTierScrollLeftPx?.(tier.scrollLeft);
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
    if (tier) tier.scrollLeft = 0;
    const ws = player.instanceRef.current;
    if (ws) ws.setScroll(0);
    commitWaveformScrollLeft(0);
    onTierScrollLeftPx?.(0);
  }, [
    selectedMediaUrl,
    tierContainerRef,
    player.instanceRef,
    commitWaveformScrollLeft,
    onTierScrollLeftPx,
  ]);
}
