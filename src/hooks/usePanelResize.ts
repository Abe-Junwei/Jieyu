import { useCallback } from 'react';

type UsePanelResizeParams = {
  isLayerRailCollapsed: boolean;
  layerRailWidth: number;
  setLayerRailWidth: React.Dispatch<React.SetStateAction<number>>;
  listMainRef: React.RefObject<HTMLDivElement | null>;
  isAiPanelCollapsed: boolean;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  workspaceRef: React.RefObject<HTMLElement | null>;
  dragCleanupRef: React.MutableRefObject<(() => void) | null>;
};

export function usePanelResize({
  isLayerRailCollapsed,
  layerRailWidth,
  setLayerRailWidth,
  listMainRef,
  isAiPanelCollapsed,
  aiPanelWidth,
  setAiPanelWidth,
  workspaceRef,
  dragCleanupRef,
}: UsePanelResizeParams) {
  const handleLayerRailResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLayerRailCollapsed) return;

    const root = listMainRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = layerRailWidth;
    const minWidth = 84;
    const maxWidth = Math.min(280, rect.width * 0.45);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
      setLayerRailWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dragCleanupRef.current = onUp;
  }, [isLayerRailCollapsed, listMainRef, layerRailWidth, setLayerRailWidth, dragCleanupRef]);

  const handleAiPanelResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isAiPanelCollapsed) return;

    const root = workspaceRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = aiPanelWidth;
    const minWidth = 240;
    const maxWidth = Math.min(560, rect.width * 0.6);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
      setAiPanelWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dragCleanupRef.current = onUp;
  }, [isAiPanelCollapsed, workspaceRef, aiPanelWidth, setAiPanelWidth, dragCleanupRef]);

  return {
    handleLayerRailResizeStart,
    handleAiPanelResizeStart,
  };
}