import { useCallback } from 'react';
import type { LayerUnitDocType } from '../db';
import type { SnapGuide } from './transcriptionTypes';

type Params = {
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
};

export function useTranscriptionSnapGuideActions({
  unitsRef,
}: Params) {
  const getNeighborBounds = useCallback((unitId: string, mediaId: string | undefined, probeStart: number) => {
    const siblings = unitsRef.current
      .filter((item) => item.id !== unitId && item.mediaId === mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const timeline = [...siblings, { id: unitId, startTime: probeStart, endTime: probeStart + 0.1 }].sort(
      (a, b) => a.startTime - b.startTime,
    );
    const currentIndex = timeline.findIndex((item) => item.id === unitId);
    const prev = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : undefined;
    return {
      left: prev ? prev.endTime + 0.02 : 0,
      right: next ? next.startTime - 0.02 : undefined,
    };
  }, [unitsRef]);

  const makeSnapGuide = useCallback((
    bounds: { left: number; right: number | undefined },
    start: number,
    end: number,
  ): SnapGuide => {
    const threshold = 0.045;
    const nearLeft = Math.abs(start - bounds.left) <= threshold;
    const nearRight = typeof bounds.right === 'number' ? Math.abs(end - bounds.right) <= threshold : false;
    const nearSide = nearLeft && nearRight ? 'both' : nearLeft ? 'left' : nearRight ? 'right' : undefined;
    return {
      visible: true,
      left: bounds.left,
      ...(typeof bounds.right === 'number' ? { right: bounds.right } : {}),
      ...(nearSide ? { nearSide } : {}),
    };
  }, []);

  return {
    getNeighborBounds,
    makeSnapGuide,
  };
}