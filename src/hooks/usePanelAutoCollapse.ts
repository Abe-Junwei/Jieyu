import { useEffect } from 'react';

type UsePanelAutoCollapseParams = {
  hoverExpandEnabled: boolean;
  isLayerRailCollapsed: boolean;
  setIsLayerRailCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  listMainRef: React.RefObject<HTMLDivElement | null>;
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceRef: React.RefObject<HTMLElement | null>;
};

const EDGE_THRESHOLD_PX = 12;

export function usePanelAutoCollapse({
  hoverExpandEnabled,
  isLayerRailCollapsed,
  setIsLayerRailCollapsed,
  listMainRef,
  isAiPanelCollapsed,
  setIsAiPanelCollapsed,
  workspaceRef,
}: UsePanelAutoCollapseParams) {
  // Auto-collapse LayerRail when clicking outside
  useEffect(() => {
    if (isLayerRailCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = listMainRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      if (
        target.closest('.transcription-layer-rail') ||
        target.closest('.transcription-layer-rail-toggle') ||
        target.closest('.transcription-layer-rail-resizer') ||
        target.closest('.timeline-annotation') ||
        target.closest('.timeline-annotation-input') ||
        target.closest('.timeline-lane-label') ||
        target.closest('button, input, textarea, select, a, [role="button"]')
      ) {
        return;
      }

      setIsLayerRailCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isLayerRailCollapsed, setIsLayerRailCollapsed, listMainRef]);

  // Auto-collapse AI panel when clicking outside
  useEffect(() => {
    if (isAiPanelCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = workspaceRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      if (
        target.closest('.transcription-ai-panel') ||
        target.closest('.transcription-ai-panel-toggle') ||
        target.closest('.transcription-ai-panel-resizer') ||
        target.closest('.timeline-annotation') ||
        target.closest('.timeline-annotation-input') ||
        target.closest('.timeline-lane-label') ||
        target.closest('.transcription-layer-rail') ||
        target.closest('.transcription-layer-rail-toggle') ||
        target.closest('button, input, textarea, select, a, [role="button"]')
      ) {
        return;
      }

      setIsAiPanelCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isAiPanelCollapsed, setIsAiPanelCollapsed, workspaceRef]);

  // Expand LayerRail on hover near left edge when collapsed
  useEffect(() => {
    if (!hoverExpandEnabled) return;
    if (!isLayerRailCollapsed) return;

    let lastTrigger = 0;
    const onPointerMove = (event: PointerEvent) => {
      // Throttle to avoid repeated calls
      const now = Date.now();
      if (now - lastTrigger < 200) return;

      if (event.clientX <= EDGE_THRESHOLD_PX) {
        lastTrigger = now;
        setIsLayerRailCollapsed(false);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
    };
  }, [hoverExpandEnabled, isLayerRailCollapsed, setIsLayerRailCollapsed]);

  // Expand AI panel on hover near right edge when collapsed
  useEffect(() => {
    if (!hoverExpandEnabled) return;
    if (!isAiPanelCollapsed) return;

    let lastTrigger = 0;
    const onPointerMove = (event: PointerEvent) => {
      const now = Date.now();
      if (now - lastTrigger < 200) return;

      if (event.clientX >= window.innerWidth - EDGE_THRESHOLD_PX) {
        lastTrigger = now;
        setIsAiPanelCollapsed(false);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
    };
  }, [hoverExpandEnabled, isAiPanelCollapsed, setIsAiPanelCollapsed]);
}