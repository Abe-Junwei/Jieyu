import { useEffect } from 'react';

type UsePanelAutoCollapseParams = {
  isLayerRailCollapsed: boolean;
  setIsLayerRailCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  listMainRef: React.RefObject<HTMLDivElement | null>;
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceRef: React.RefObject<HTMLElement | null>;
};

export function usePanelAutoCollapse({
  isLayerRailCollapsed,
  setIsLayerRailCollapsed,
  listMainRef,
  isAiPanelCollapsed,
  setIsAiPanelCollapsed,
  workspaceRef,
}: UsePanelAutoCollapseParams) {
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
}