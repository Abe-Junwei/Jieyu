import { useEffect } from 'react';

type UsePanelAutoCollapseParams = {
  hoverExpandEnabled: boolean;
  isLayerRailCollapsed?: boolean;
  setIsLayerRailCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
  isSidePaneCollapsed?: boolean;
  setIsSidePaneCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
  listMainRef: React.RefObject<HTMLDivElement | null>;
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceRef: React.RefObject<HTMLElement | null>;
};

const EDGE_THRESHOLD_PX = 12;
const LAYER_RAIL_INTERACTION_SELECTOR = [
  '[data-layer-pane-interactive="true"]',
  '#app-side-pane-body-slot',
  '.app-side-pane',
  '.app-side-pane-collapse-toggle',
].join(', ');

function isLayerRailInteractionTarget(target: Element): boolean {
  return Boolean(target.closest(LAYER_RAIL_INTERACTION_SELECTOR));
}

export function usePanelAutoCollapse({
  hoverExpandEnabled,
  isLayerRailCollapsed,
  setIsLayerRailCollapsed,
  isSidePaneCollapsed,
  setIsSidePaneCollapsed,
  listMainRef,
  isAiPanelCollapsed,
  setIsAiPanelCollapsed,
  workspaceRef,
}: UsePanelAutoCollapseParams) {
  const effectiveIsSidePaneCollapsed = isSidePaneCollapsed ?? isLayerRailCollapsed ?? false;
  const effectiveSetIsSidePaneCollapsed = setIsSidePaneCollapsed ?? setIsLayerRailCollapsed;

  // Auto-collapse LayerRail when clicking outside
  useEffect(() => {
    if (effectiveIsSidePaneCollapsed) return;
    if (!effectiveSetIsSidePaneCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = listMainRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      if (
        isLayerRailInteractionTarget(target) ||
        target.closest('.timeline-annotation') ||
        target.closest('.timeline-annotation-input') ||
        target.closest('.timeline-lane-label') ||
        target.closest('button, input, textarea, select, a, [role="button"]')
      ) {
        return;
      }

        effectiveSetIsSidePaneCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [effectiveIsSidePaneCollapsed, effectiveSetIsSidePaneCollapsed, listMainRef]);

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
        isLayerRailInteractionTarget(target) ||
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
    if (!effectiveIsSidePaneCollapsed) return;
    if (!effectiveSetIsSidePaneCollapsed) return;

    let lastTrigger = 0;
    const onPointerMove = (event: PointerEvent) => {
      // Throttle to avoid repeated calls
      const now = Date.now();
      if (now - lastTrigger < 200) return;

      if (event.clientX <= EDGE_THRESHOLD_PX) {
        lastTrigger = now;
          effectiveSetIsSidePaneCollapsed(false);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
    };
  }, [hoverExpandEnabled, effectiveIsSidePaneCollapsed, effectiveSetIsSidePaneCollapsed]);

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