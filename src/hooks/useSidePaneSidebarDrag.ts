import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerDocType, LayerLinkDocType } from '../db';
import { resolveVerticalReorderTargetIndex, type VerticalDragDirection } from '../utils/dragReorder';
import { buildLayerDropIntent, type LayerDropIntent } from '../utils/layerDragDropModel';
import { resolveLayerDragGroup } from '../services/LayerOrderingService';
import { fireAndForget } from '../utils/fireAndForget';

export type SidePaneSidebarDragState = {
  draggedId: string;
  draggedLayerIds: string[];
  sourceIndex: number;
  sourceSpan: number;
  sourceType: 'transcription' | 'translation';
} | null;

type BundleRange = {
  rootId: string;
  start: number;
  end: number;
};

type SidebarDragHostLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

interface UseSidePaneSidebarDragInput {
  sidePaneRows: LayerDocType[];
  bundleBoundaryIndexes: number[];
  bundleRootIds: Set<string>;
  bundleRanges: BundleRange[];
  layerLinks?: ReadonlyArray<SidebarDragHostLink>;
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
}

export function useSidePaneSidebarDrag({
  sidePaneRows,
  bundleBoundaryIndexes,
  bundleRootIds,
  bundleRanges,
  layerLinks = [],
  onReorderLayers,
}: UseSidePaneSidebarDragInput) {
  const sidePaneOverviewRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<SidePaneSidebarDragState>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragStateRef = useRef<SidePaneSidebarDragState>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const dropIntentRef = useRef<LayerDropIntent | null>(null);
  const draggedRailRowsRef = useRef<HTMLElement[]>([]);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragLastClientYRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<VerticalDragDirection>('none');

  const clearRailShiftVisual = useCallback(() => {
    const overview = sidePaneOverviewRef.current;
    if (!overview) return;
    overview.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row').forEach((row) => {
      row.classList.remove('transcription-side-pane-item-row-shift');
      row.style.removeProperty('--transcription-side-pane-shift-offset');
    });
  }, []);

  const clearRailBoundaryHighlightVisual = useCallback(() => {
    const overview = sidePaneOverviewRef.current;
    if (!overview) return;
    overview.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row').forEach((row) => {
      row.classList.remove('transcription-side-pane-item-row-boundary-highlight-top');
      row.classList.remove('transcription-side-pane-item-row-boundary-highlight-bottom');
    });
  }, []);

  const clearRailDragVisual = useCallback(() => {
    draggedRailRowsRef.current.forEach((row) => {
      row.classList.remove('transcription-side-pane-item-row-dragging');
      row.style.removeProperty('--transcription-side-pane-drag-offset');
    });
    draggedRailRowsRef.current = [];
  }, []);

  const getRailRows = useCallback((): HTMLElement[] => {
    const overview = sidePaneOverviewRef.current;
    if (!overview) return [];
    return Array.from(overview.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
  }, []);

  const getDraggedRailBlockHeight = useCallback((rows: HTMLElement[]): number => {
    if (rows.length === 0) return 28;
    return rows.reduce((total, row) => total + row.getBoundingClientRect().height, 0);
  }, []);

  const updateRailDragVisual = useCallback((clientY: number) => {
    const startY = dragStartClientYRef.current;
    if (startY === null) return;
    const deltaY = clientY - startY;
    draggedRailRowsRef.current.forEach((row) => {
      row.classList.add('transcription-side-pane-item-row-dragging');
      row.style.setProperty('--transcription-side-pane-drag-offset', `${deltaY}px`);
    });
  }, []);

  const updateRailDragDirection = useCallback((clientY: number) => {
    const previous = dragLastClientYRef.current;
    if (previous !== null) {
      if (clientY > previous + 1) {
        dragDirectionRef.current = 'down';
      } else if (clientY < previous - 1) {
        dragDirectionRef.current = 'up';
      }
    }
    dragLastClientYRef.current = clientY;
  }, []);

  const updateRailShiftVisual = useCallback((sourceIndex: number, sourceSpan: number, dropIndex: number) => {
    const rows = getRailRows();
    if (rows.length === 0) return;

    clearRailShiftVisual();

    const insertionIndex = Math.max(0, Math.min(dropIndex, rows.length));
    if (insertionIndex === sourceIndex || (insertionIndex > sourceIndex && insertionIndex <= sourceIndex + sourceSpan)) return;

    const dragBlockHeight = getDraggedRailBlockHeight(rows.slice(sourceIndex, sourceIndex + sourceSpan));

    if (insertionIndex > sourceIndex) {
      for (let i = sourceIndex + sourceSpan; i < insertionIndex; i += 1) {
        const row = rows[i];
        if (!row) continue;
        row.classList.add('transcription-side-pane-item-row-shift');
        row.style.setProperty('--transcription-side-pane-shift-offset', `${-dragBlockHeight}px`);
      }
      return;
    }

    for (let i = insertionIndex; i < sourceIndex; i += 1) {
      const row = rows[i];
      if (!row) continue;
      row.classList.add('transcription-side-pane-item-row-shift');
      row.style.setProperty('--transcription-side-pane-shift-offset', `${dragBlockHeight}px`);
    }
  }, [clearRailShiftVisual, getDraggedRailBlockHeight, getRailRows]);

  const updateRailBoundaryHighlightVisual = useCallback((draggedId: string, sourceIndex: number, dropIndex: number) => {
    clearRailBoundaryHighlightVisual();

    if (!bundleRootIds.has(draggedId)) return;
    if (!bundleBoundaryIndexes.includes(dropIndex)) return;
    if (dropIndex === sourceIndex) return;

    const rows = getRailRows();
    if (rows.length === 0) return;

    if (dropIndex >= rows.length) {
      rows[rows.length - 1]?.classList.add('transcription-side-pane-item-row-boundary-highlight-bottom');
      return;
    }

    rows[dropIndex]?.classList.add('transcription-side-pane-item-row-boundary-highlight-top');
  }, [bundleBoundaryIndexes, bundleRootIds, clearRailBoundaryHighlightVisual, getRailRows]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  const resolveRailDropTargetIndex = useCallback((clientY: number): number | null => {
    const overview = sidePaneOverviewRef.current;
    if (!overview) return null;

    const activeDrag = dragStateRef.current;
    if (!activeDrag) return null;

    const items = Array.from(overview.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    let targetIndex = resolveVerticalReorderTargetIndex(
      items.map((item) => item.getBoundingClientRect()),
      clientY,
      dragDirectionRef.current,
      {
        ...(bundleRootIds.has(activeDrag.draggedId)
          ? { allowedBoundaryIndexes: bundleBoundaryIndexes }
          : {}),
      },
    );
    if (targetIndex === null) return null;

    if (targetIndex > sidePaneRows.length) targetIndex = sidePaneRows.length;

    if (targetIndex > activeDrag.sourceIndex && targetIndex < activeDrag.sourceIndex + activeDrag.sourceSpan) {
      targetIndex = activeDrag.sourceIndex;
    }

    return targetIndex;
  }, [bundleBoundaryIndexes, bundleRootIds, sidePaneRows.length]);

  const resolveRailDropTargetIndexForActiveDrag = useCallback((
    clientY: number,
    activeDrag: { draggedId: string; sourceIndex: number; sourceSpan: number },
  ): LayerDropIntent | null => {
    const baseTargetIndex = resolveRailDropTargetIndex(clientY);
    if (baseTargetIndex === null) return null;

    const overview = sidePaneOverviewRef.current;
    if (!overview) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: sidePaneRows.length,
        bundleRanges,
        isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
      });
    }
    const rows = Array.from(overview.querySelectorAll<HTMLElement>('.transcription-side-pane-item-row'));
    if (rows.length === 0) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: sidePaneRows.length,
        bundleRanges,
        isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
      });
    }

    return buildLayerDropIntent({
      draggedId: activeDrag.draggedId,
      sourceIndex: activeDrag.sourceIndex,
      sourceSpan: activeDrag.sourceSpan,
      baseTargetIndex,
      rowCount: rows.length,
      bundleRanges,
      isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
    });
  }, [bundleRanges, bundleRootIds, sidePaneRows.length, resolveRailDropTargetIndex]);

  const resolveTargetBundleRange = useCallback((draggedId: string, dropIndex: number) => {
    if (!bundleRootIds.has(draggedId)) return null;
    if (!bundleBoundaryIndexes.includes(dropIndex)) return null;

    const clampedProbeIndex = Math.max(0, Math.min(dropIndex, sidePaneRows.length - 1));
    const targetRange = bundleRanges.find((range) => clampedProbeIndex >= range.start && clampedProbeIndex < range.end);
    if (!targetRange || targetRange.rootId === draggedId) return null;
    return targetRange;
  }, [bundleBoundaryIndexes, bundleRanges, bundleRootIds, sidePaneRows.length]);

  const commitRailDragReorder = useCallback((clientY?: number) => {
    const activeDrag = dragStateRef.current;
    if (typeof clientY === 'number') {
      updateRailDragDirection(clientY);
      updateRailDragVisual(clientY);
    }

    const resolvedIntent = (typeof clientY === 'number' && activeDrag)
      ? resolveRailDropTargetIndexForActiveDrag(clientY, activeDrag)
      : null;
    const resolvedTarget = resolvedIntent?.commitIndex ?? null;
    const previewTarget = dropIntentRef.current?.commitIndex ?? dropTargetIndexRef.current;
    let finalTarget = resolvedTarget ?? previewTarget;
    if (activeDrag && resolvedTarget !== null && previewTarget !== null) {
      if (resolvedTarget === activeDrag.sourceIndex && previewTarget !== activeDrag.sourceIndex) {
        finalTarget = previewTarget;
      }
    }

    if (activeDrag && finalTarget !== null && finalTarget !== activeDrag.sourceIndex) {
      fireAndForget(onReorderLayers(activeDrag.draggedId, finalTarget), { context: 'src/hooks/useSidePaneSidebarDrag.ts:L268', policy: 'user-visible' });
    }

    clearRailDragVisual();
    clearRailShiftVisual();
    clearRailBoundaryHighlightVisual();
    dragStartClientYRef.current = null;
    dragLastClientYRef.current = null;
    dragDirectionRef.current = 'none';
    dropIntentRef.current = null;
    setDragState(null);
    setDropTargetIndex(null);
  }, [clearRailBoundaryHighlightVisual, clearRailDragVisual, clearRailShiftVisual, onReorderLayers, resolveRailDropTargetIndexForActiveDrag, updateRailDragDirection, updateRailDragVisual]);

  const handleDragStart = useCallback((event: React.MouseEvent, layer: LayerDocType) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    dropIntentRef.current = null;
    const cancelPendingDragStart = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      dragLastClientYRef.current = null;
      dragDirectionRef.current = 'none';
      dropIntentRef.current = null;
      document.removeEventListener('mouseup', cancelPendingDragStart);
    };

    timer = setTimeout(() => {
      timer = null;
      const currentIndex = sidePaneRows.findIndex((candidateLayer) => candidateLayer.id === layer.id);
      const draggedLayerIds = resolveLayerDragGroup(sidePaneRows, layer.id, layerLinks);
      const sourceSpan = draggedLayerIds.length;
      draggedRailRowsRef.current = getRailRows().slice(currentIndex, currentIndex + sourceSpan);
      dragStartClientYRef.current = event.clientY;
      dragLastClientYRef.current = event.clientY;
      dragDirectionRef.current = 'none';
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      setDragState({
        draggedId: layer.id,
        draggedLayerIds,
        sourceIndex: currentIndex,
        sourceSpan,
        sourceType: layer.layerType,
      });
      setDropTargetIndex(currentIndex);
      dropTargetIndexRef.current = currentIndex;
      dropIntentRef.current = null;
      updateRailBoundaryHighlightVisual(layer.id, currentIndex, currentIndex);
      document.removeEventListener('mouseup', cancelPendingDragStart);
    }, 200);

    document.addEventListener('mouseup', cancelPendingDragStart);
  }, [getRailRows, layerLinks, sidePaneRows, updateRailBoundaryHighlightVisual]);

  useEffect(() => {
    if (!dragState) return undefined;

    const handleDocumentMouseMove = (event: MouseEvent) => {
      updateRailDragDirection(event.clientY);
      updateRailDragVisual(event.clientY);
      const nextIntent = resolveRailDropTargetIndexForActiveDrag(event.clientY, dragState);
      if (nextIntent !== null) {
        dropIntentRef.current = nextIntent;
        const next = nextIntent.previewIndex;
        dropTargetIndexRef.current = next;
        setDropTargetIndex(next);
        updateRailShiftVisual(dragState.sourceIndex, dragState.sourceSpan, next);
        updateRailBoundaryHighlightVisual(dragState.draggedId, dragState.sourceIndex, next);
      }
    };

    const handleDocumentMouseUp = (event: MouseEvent) => {
      commitRailDragReorder(event.clientY);
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      clearRailDragVisual();
      clearRailShiftVisual();
      clearRailBoundaryHighlightVisual();
      dropIntentRef.current = null;
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [clearRailBoundaryHighlightVisual, clearRailDragVisual, clearRailShiftVisual, commitRailDragReorder, dragState, resolveRailDropTargetIndexForActiveDrag, updateRailBoundaryHighlightVisual, updateRailDragDirection, updateRailDragVisual, updateRailShiftVisual]);

  useEffect(() => () => {
    clearRailDragVisual();
    clearRailShiftVisual();
    clearRailBoundaryHighlightVisual();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    dragStartClientYRef.current = null;
    dragLastClientYRef.current = null;
    dragDirectionRef.current = 'none';
    dropIntentRef.current = null;
  }, [clearRailBoundaryHighlightVisual, clearRailDragVisual, clearRailShiftVisual]);

  return {
    sidePaneOverviewRef,
    dragState,
    dropTargetIndex,
    handleDragStart,
    resolveTargetBundleRange,
  };
}
