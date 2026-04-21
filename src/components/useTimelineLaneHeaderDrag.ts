import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { LayerDocType, LayerLinkDocType } from '../db';
import { resolveLayerDragGroup } from '../services/LayerOrderingService';
import { resolveVerticalReorderTargetIndex, type VerticalDragDirection } from '../utils/dragReorder';
import { fireAndForget } from '../utils/fireAndForget';
import { buildLayerDropIntent, type LayerDropIntent } from '../utils/layerDragDropModel';

interface BundleRange {
  rootId: string;
  start: number;
  end: number;
}

type LaneHeaderHostLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

interface TimelineLaneHeaderDragOptions {
  layer: Pick<LayerDocType, 'id' | 'layerType'>;
  allLayers: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  bundleBoundaryIndexes: number[];
  bundleRootIds: Set<string>;
  bundleRanges: BundleRange[];
  layerLinks?: ReadonlyArray<LaneHeaderHostLink>;
}

interface DragState {
  draggedId: string;
  draggedLayerIds: string[];
  sourceIndex: number;
  sourceSpan: number;
  sourceType: 'transcription' | 'translation';
}

export function useTimelineLaneHeaderDrag(options: TimelineLaneHeaderDragOptions) {
  const {
    layer,
    allLayers,
    onReorderLayers,
    bundleBoundaryIndexes,
    bundleRootIds,
    bundleRanges,
    layerLinks = [],
  } = options;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLSpanElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const dropIntentRef = useRef<LayerDropIntent | null>(null);
  const laneRowRef = useRef<HTMLElement | null>(null);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragVisualRafRef = useRef<number | null>(null);
  const dragVisualCurrentOffsetRef = useRef(0);
  const dragVisualTargetOffsetRef = useRef(0);
  const draggedLaneRowsRef = useRef<HTMLElement[]>([]);
  const dragLastClientYRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<VerticalDragDirection>('none');

  const resolveDraggedLaneRows = useCallback((sourceIndex: number, sourceSpan: number): HTMLElement[] => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return [];
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.timeline-lane'));
    return lanes.slice(sourceIndex, sourceIndex + sourceSpan);
  }, []);

  const updateDragDirection = useCallback((clientY: number) => {
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

  const clearSiblingShiftVisual = useCallback(() => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;
    const lanes = container.querySelectorAll<HTMLElement>('.timeline-lane');
    lanes.forEach((lane) => {
      lane.classList.remove('timeline-lane-row-shift');
      lane.style.removeProperty('--timeline-lane-shift-offset');
    });
  }, []);

  const clearBundleBoundaryHighlightVisual = useCallback(() => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;
    const lanes = container.querySelectorAll<HTMLElement>('.timeline-lane');
    lanes.forEach((lane) => {
      lane.classList.remove('timeline-lane-boundary-highlight-top');
      lane.classList.remove('timeline-lane-boundary-highlight-bottom');
      lane.classList.remove('timeline-lane-bundle-target');
    });
  }, []);

  const resolveTargetBundleRange = useCallback((draggedId: string, dropIndex: number) => {
    if (!bundleRootIds.has(draggedId)) return null;
    if (!bundleBoundaryIndexes.includes(dropIndex)) return null;

    const clampedProbeIndex = Math.max(0, Math.min(dropIndex, allLayers.length - 1));
    const targetRange = bundleRanges.find((range) => clampedProbeIndex >= range.start && clampedProbeIndex < range.end);
    if (!targetRange || targetRange.rootId === draggedId) return null;
    return targetRange;
  }, [allLayers.length, bundleBoundaryIndexes, bundleRanges, bundleRootIds]);

  const getDraggedLaneBlockHeight = useCallback((lanes: HTMLElement[]): number => {
    if (lanes.length === 0) return 54;
    return lanes.reduce((total, lane) => total + lane.getBoundingClientRect().height, 0);
  }, []);

  const updateSiblingShiftVisual = useCallback((sourceIndex: number, sourceSpan: number, dropIndex: number) => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;

    clearSiblingShiftVisual();

    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.timeline-lane'));
    if (lanes.length === 0) return;

    const insertionIndex = Math.max(0, Math.min(dropIndex, lanes.length));
    if (insertionIndex === sourceIndex || (insertionIndex > sourceIndex && insertionIndex <= sourceIndex + sourceSpan)) return;

    const dragBlockHeight = getDraggedLaneBlockHeight(lanes.slice(sourceIndex, sourceIndex + sourceSpan));

    if (insertionIndex > sourceIndex) {
      for (let i = sourceIndex + sourceSpan; i < insertionIndex; i++) {
        const laneEl = lanes[i];
        if (!laneEl) continue;
        laneEl.classList.add('timeline-lane-row-shift');
        laneEl.style.setProperty('--timeline-lane-shift-offset', `${-dragBlockHeight}px`);
      }
      return;
    }

    for (let i = insertionIndex; i < sourceIndex; i++) {
      const laneEl = lanes[i];
      if (!laneEl) continue;
      laneEl.classList.add('timeline-lane-row-shift');
      laneEl.style.setProperty('--timeline-lane-shift-offset', `${dragBlockHeight}px`);
    }
  }, [clearSiblingShiftVisual, getDraggedLaneBlockHeight]);

  const updateBundleBoundaryHighlightVisual = useCallback((draggedId: string, sourceIndex: number, dropIndex: number) => {
    clearBundleBoundaryHighlightVisual();

    if (!bundleRootIds.has(draggedId)) return;
    if (!bundleBoundaryIndexes.includes(dropIndex)) return;
    if (dropIndex === sourceIndex) return;

    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.timeline-lane'));
    if (lanes.length === 0) return;

    if (dropIndex >= lanes.length) {
      lanes[lanes.length - 1]?.classList.add('timeline-lane-boundary-highlight-bottom');
    } else {
      lanes[dropIndex]?.classList.add('timeline-lane-boundary-highlight-top');
    }

    const targetRange = resolveTargetBundleRange(draggedId, dropIndex);
    if (!targetRange) return;
    for (let index = targetRange.start; index < targetRange.end; index += 1) {
      lanes[index]?.classList.add('timeline-lane-bundle-target');
    }
  }, [bundleBoundaryIndexes, bundleRootIds, clearBundleBoundaryHighlightVisual, resolveTargetBundleRange]);

  const clearLaneDragVisual = useCallback(() => {
    if (dragVisualRafRef.current !== null) {
      cancelAnimationFrame(dragVisualRafRef.current);
      dragVisualRafRef.current = null;
    }
    dragVisualCurrentOffsetRef.current = 0;
    dragVisualTargetOffsetRef.current = 0;
    draggedLaneRowsRef.current.forEach((laneEl) => {
      laneEl.classList.remove('timeline-lane-row-dragging');
      laneEl.style.removeProperty('--timeline-lane-drag-offset');
    });
    draggedLaneRowsRef.current = [];
  }, []);

  const startLaneDragVisualAnimation = useCallback(() => {
    if (dragVisualRafRef.current !== null) return;

    const animate = () => {
      const lanes = draggedLaneRowsRef.current;
      if (lanes.length === 0) {
        dragVisualRafRef.current = null;
        return;
      }

      const target = dragVisualTargetOffsetRef.current;
      const current = dragVisualCurrentOffsetRef.current;
      const next = current + (target - current) * 0.22;

      dragVisualCurrentOffsetRef.current = next;
      lanes.forEach((laneEl) => {
        laneEl.classList.add('timeline-lane-row-dragging');
        laneEl.style.setProperty('--timeline-lane-drag-offset', `${next}px`);
      });

      const diff = Math.abs(target - next);
      if (!dragStateRef.current && diff < 0.2) {
        dragVisualRafRef.current = null;
        return;
      }

      dragVisualRafRef.current = requestAnimationFrame(animate);
    };

    dragVisualRafRef.current = requestAnimationFrame(animate);
  }, []);

  const updateLaneDragVisual = useCallback((clientY: number) => {
    const laneEl = laneRowRef.current;
    const startY = dragStartClientYRef.current;
    if (!laneEl || startY === null) return;
    const deltaY = clientY - startY;
    dragVisualTargetOffsetRef.current = deltaY;
    startLaneDragVisualAnimation();
  }, [startLaneDragVisualAnimation]);

  const resolveDropTargetIndex = useCallback((clientY: number): number | null => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return null;

    const laneLabels = container.querySelectorAll<HTMLElement>('.timeline-lane-header');
    if (laneLabels.length === 0) return null;

    const activeDrag = dragStateRef.current;

    let targetIndex = resolveVerticalReorderTargetIndex(
      Array.from(laneLabels, (laneEl) => laneEl.getBoundingClientRect()),
      clientY,
      dragDirectionRef.current,
      {
        ...(activeDrag && bundleRootIds.has(activeDrag.draggedId)
          ? { allowedBoundaryIndexes: bundleBoundaryIndexes }
          : {}),
      },
    );
    if (targetIndex === null) return null;

    if (targetIndex > allLayers.length) targetIndex = allLayers.length;

    if (activeDrag && targetIndex > activeDrag.sourceIndex && targetIndex < activeDrag.sourceIndex + activeDrag.sourceSpan) {
      return activeDrag.sourceIndex;
    }

    return targetIndex;
  }, [allLayers.length, bundleBoundaryIndexes, bundleRootIds]);

  const resolveDropTargetIndexForActiveDrag = useCallback((
    clientY: number,
    activeDrag: { draggedId: string; sourceIndex: number; sourceSpan: number },
  ): LayerDropIntent | null => {
    const baseTargetIndex = resolveDropTargetIndex(clientY);
    if (baseTargetIndex === null) return null;

    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: allLayers.length,
        bundleRanges,
        isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
      });
    }
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.timeline-lane'));
    if (lanes.length === 0) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: allLayers.length,
        bundleRanges,
        isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
      });
    }

    return buildLayerDropIntent({
      draggedId: activeDrag.draggedId,
      sourceIndex: activeDrag.sourceIndex,
      sourceSpan: activeDrag.sourceSpan,
      baseTargetIndex,
      rowCount: lanes.length,
      bundleRanges,
      isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
    });
  }, [allLayers.length, bundleRanges, bundleRootIds, resolveDropTargetIndex]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dropIntentRef.current = null;
    dragStartClientYRef.current = e.clientY;
    dragLastClientYRef.current = e.clientY;
    dragDirectionRef.current = 'none';
    laneRowRef.current = headerRef.current?.closest<HTMLElement>('.timeline-lane') ?? null;
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }

    const idx = allLayers.findIndex((item) => item.id === layer.id);
    const draggedLayerIds = resolveLayerDragGroup(allLayers, layer.id, layerLinks);
    const sourceSpan = draggedLayerIds.length;

    const cancelPendingDragStart = () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
      dragStartClientYRef.current = null;
      dragLastClientYRef.current = null;
      dragDirectionRef.current = 'none';
      dropIntentRef.current = null;
      laneRowRef.current = null;
      document.removeEventListener('mouseup', cancelPendingDragStart);
    };

    dragTimerRef.current = setTimeout(() => {
      dragTimerRef.current = null;
      draggedLaneRowsRef.current = resolveDraggedLaneRows(idx, sourceSpan);
      laneRowRef.current = draggedLaneRowsRef.current[0] ?? laneRowRef.current;
      setDragState({
        draggedId: layer.id,
        draggedLayerIds,
        sourceIndex: idx,
        sourceSpan,
        sourceType: layer.layerType,
      });
      setDropTargetIndex(idx);
      dropTargetIndexRef.current = idx;
      dropIntentRef.current = null;
      updateBundleBoundaryHighlightVisual(layer.id, idx, idx);
      updateLaneDragVisual(e.clientY);
      document.removeEventListener('mouseup', cancelPendingDragStart);
    }, 500);
    document.addEventListener('mouseup', cancelPendingDragStart);
  }, [allLayers, layer.id, layer.layerType, layerLinks, resolveDraggedLaneRows, updateBundleBoundaryHighlightVisual, updateLaneDragVisual]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  const commitDragReorder = useCallback(() => {
    const activeDrag = dragStateRef.current;
    if (!activeDrag) {
      clearLaneDragVisual();
      clearSiblingShiftVisual();
      clearBundleBoundaryHighlightVisual();
      dragStartClientYRef.current = null;
      dragLastClientYRef.current = null;
      dragDirectionRef.current = 'none';
      dropIntentRef.current = null;
      laneRowRef.current = null;
      draggedLaneRowsRef.current = [];
      setDragState(null);
      setDropTargetIndex(null);
      return;
    }

    const previewIntent = dropIntentRef.current;
    const previewTarget = previewIntent?.previewIndex ?? dropTargetIndexRef.current;
    const finalTarget = previewTarget;

    if (finalTarget !== null) {
      if (finalTarget !== activeDrag.sourceIndex) {
        fireAndForget(onReorderLayers(activeDrag.draggedId, finalTarget));
      }
    }

    clearLaneDragVisual();
    clearSiblingShiftVisual();
    clearBundleBoundaryHighlightVisual();
    dragStartClientYRef.current = null;
    dragLastClientYRef.current = null;
    dragDirectionRef.current = 'none';
    dropIntentRef.current = null;
    laneRowRef.current = null;
    draggedLaneRowsRef.current = [];
    setDragState(null);
    setDropTargetIndex(null);
  }, [clearBundleBoundaryHighlightVisual, clearLaneDragVisual, clearSiblingShiftVisual, onReorderLayers]);

  useEffect(() => {
    if (!dragState) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      updateDragDirection(e.clientY);
      updateLaneDragVisual(e.clientY);
      const nextIntent = resolveDropTargetIndexForActiveDrag(e.clientY, dragState);
      if (nextIntent !== null) {
        dropIntentRef.current = nextIntent;
        const next = nextIntent.previewIndex;
        dropTargetIndexRef.current = next;
        setDropTargetIndex(next);
        updateSiblingShiftVisual(dragState.sourceIndex, dragState.sourceSpan, next);
        updateBundleBoundaryHighlightVisual(dragState.draggedId, dragState.sourceIndex, next);
      }
    };

    const handleDocumentMouseUp = () => {
      commitDragReorder();
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      clearLaneDragVisual();
      clearSiblingShiftVisual();
      clearBundleBoundaryHighlightVisual();
      dropIntentRef.current = null;
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [clearBundleBoundaryHighlightVisual, clearLaneDragVisual, clearSiblingShiftVisual, commitDragReorder, dragState, resolveDropTargetIndexForActiveDrag, updateDragDirection, updateBundleBoundaryHighlightVisual, updateLaneDragVisual, updateSiblingShiftVisual]);

  useEffect(() => () => {
    clearLaneDragVisual();
    clearSiblingShiftVisual();
    clearBundleBoundaryHighlightVisual();
    dragStartClientYRef.current = null;
    dragLastClientYRef.current = null;
    dragDirectionRef.current = 'none';
    dropIntentRef.current = null;
    laneRowRef.current = null;
    draggedLaneRowsRef.current = [];
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
  }, [clearBundleBoundaryHighlightVisual, clearLaneDragVisual, clearSiblingShiftVisual]);

  return {
    headerRef,
    dragState,
    dropTargetIndex,
    handleMouseDown,
  };
}
