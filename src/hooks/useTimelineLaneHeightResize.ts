import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export const DEFAULT_TIMELINE_LANE_HEIGHT = 54;
export const MIN_TIMELINE_LANE_HEIGHT = 42;
export const MAX_TIMELINE_LANE_HEIGHT = 180;

type ResizeState = {
  layerId: string;
  startY: number;
  startHeight: number;
};

function clampTimelineLaneHeight(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_TIMELINE_LANE_HEIGHT), MAX_TIMELINE_LANE_HEIGHT);
}

export function useTimelineLaneHeightResize(
  onLaneHeightChange: (layerId: string, nextHeight: number) => void,
) {
  const [resizingLayerId, setResizingLayerId] = useState<string | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  const startLaneHeightResize = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    layerId: string,
    currentHeight: number,
  ) => {
    if (typeof window === 'undefined') return;
    event.preventDefault();
    event.stopPropagation();
    const initialHeight = clampTimelineLaneHeight(currentHeight);
    resizeStateRef.current = {
      layerId,
      startY: event.clientY,
      startHeight: initialHeight,
    };
    onLaneHeightChange(layerId, initialHeight);
    setResizingLayerId(layerId);
  }, [onLaneHeightChange]);

  useEffect(() => {
    if (!resizingLayerId || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const drag = resizeStateRef.current;
      if (!drag) return;
      const delta = event.clientY - drag.startY;
      onLaneHeightChange(drag.layerId, clampTimelineLaneHeight(drag.startHeight + delta));
    };

    const stopResize = (): void => {
      resizeStateRef.current = null;
      setResizingLayerId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [onLaneHeightChange, resizingLayerId]);

  return {
    resizingLayerId,
    startLaneHeightResize,
  };
}