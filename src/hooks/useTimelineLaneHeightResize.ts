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
  onResizeEnd?: (layerId: string, finalHeight: number) => void,
  onResizePreview?: (layerId: string, previewHeight: number) => void,
) {
  const [resizingLayerId, setResizingLayerId] = useState<string | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const lastHeightRef = useRef(DEFAULT_TIMELINE_LANE_HEIGHT);
  const onResizeEndRef = useRef(onResizeEnd);
  const onResizePreviewRef = useRef(onResizePreview);
  useEffect(() => { onResizeEndRef.current = onResizeEnd; });
  useEffect(() => { onResizePreviewRef.current = onResizePreview; });

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
    lastHeightRef.current = initialHeight;
    onLaneHeightChange(layerId, initialHeight);
    onResizePreviewRef.current?.(layerId, initialHeight);
    setResizingLayerId(layerId);
  }, [onLaneHeightChange]);

  useEffect(() => {
    if (!resizingLayerId || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const drag = resizeStateRef.current;
      if (!drag) return;
      const delta = event.clientY - drag.startY;
      const clamped = clampTimelineLaneHeight(drag.startHeight + delta);
      lastHeightRef.current = clamped;
      onLaneHeightChange(drag.layerId, clamped);
      onResizePreviewRef.current?.(drag.layerId, clamped);
    };

    const stopResize = (): void => {
      const drag = resizeStateRef.current;
      if (drag) {
        // 触发 resize 结束回调（用于字号联动） | Fire resize-end callback (for font-size sync)
        onResizeEndRef.current?.(drag.layerId, lastHeightRef.current);
      }
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