import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayerLinkDocType, LayerDocType, LayerDisplaySettings, OrthographyDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { buildLayerBundles, resolveLayerDragGroup } from '../services/LayerOrderingService';
import { resolveVerticalReorderTargetIndex, type VerticalDragDirection } from '../utils/dragReorder';
import { fireAndForget } from '../utils/fireAndForget';
import { buildLayerDropIntent, type LayerDropIntent } from '../utils/layerDragDropModel';
import { buildLayerLinkConnectorLayout, getLayerLinkConnectorColors, getLayerLinkStackWidth } from '../utils/layerLinkConnector';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

interface TimelineLaneHeaderProps {
  layer: LayerDocType;
  layerIndex: number;
  allLayers: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  renderLaneLabel: (layer: LayerDocType) => React.ReactNode;
  onLayerAction: (action: LayerActionType, layerId: string) => void;
  layerLinks?: LayerLinkDocType[];
  showConnectors?: boolean;
  onToggleConnectors?: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  trackModeControl?: {
    mode: TranscriptionTrackDisplayMode;
    onToggle: () => void;
    onSetMode?: (nextMode: TranscriptionTrackDisplayMode) => void;
    onLockSelectedToLane?: (laneIndex: number) => void;
    onUnlockSelected?: () => void;
    onResetAuto?: () => void;
    selectedSpeakerNames?: string[];
    lockedSpeakerCount?: number;
    lockConflictCount?: number;
  };
  /** 显示样式菜单所需 | Display style submenu dependencies */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof buildLayerStyleMenuItems>[7];
  };
}

interface LaneLockDialogState {
  initialLaneIndex: number;
  selectedSpeakerHint: string;
}

function formatTrackModeMenuLabel(mode: TranscriptionTrackDisplayMode): string {
  switch (mode) {
    case 'single':
      return '单轨';
    case 'multi-auto':
      return '多轨·自动';
    case 'multi-locked':
      return '多轨·锁定';
    case 'multi-speaker-fixed':
      return '多轨·一人一轨';
    default:
      return mode;
  }
}

export function TimelineLaneHeader({
  layer,
  layerIndex,
  allLayers,
  onReorderLayers,
  deletableLayers,
  onFocusLayer,
  renderLaneLabel,
  showConnectors = true,
  onToggleConnectors,
  isCollapsed = false,
  onToggleCollapsed,
  onLayerAction,
  layerLinks: layerLinks = [],
  onLaneLabelWidthResize,
  speakerQuickActions,
  trackModeControl,
  displayStyleControl,
}: TimelineLaneHeaderProps) {
  const connectorLayerLinks = useMemo(
    () => layerLinks.map((link) => ({ transcriptionLayerKey: link.transcriptionLayerKey, targetLayerId: link.layerId })),
    [layerLinks],
  );
  const connectorLayout = useMemo(
    () => buildLayerLinkConnectorLayout(allLayers, connectorLayerLinks),
    [allLayers, connectorLayerLinks],
  );
  const canOpenTranslationCreate = allLayers.some((item) => item.layerType === 'transcription');
  const rowSegments = connectorLayout.segmentsByLayerId[layer.id] ?? [];
  const hasResolvableConnectorData = connectorLayout.maxColumns > 0;
  const effectiveShowConnectors = showConnectors && hasResolvableConnectorData;
  const { bundleBoundaryIndexes, bundleRootIds, bundleRanges } = useMemo(() => {
    const boundaries = new Set<number>([0, allLayers.length]);
    const rootIds = new Set<string>();
    const ranges: Array<{ rootId: string; start: number; end: number }> = [];
    let cursor = 0;
    for (const bundle of buildLayerBundles(allLayers)) {
      const start = cursor;
      boundaries.add(cursor);
      if (!bundle.detached) {
        rootIds.add(bundle.root.id);
      }
      cursor += 1 + bundle.transcriptionDependents.length + bundle.translationDependents.length;
      boundaries.add(cursor);
      ranges.push({ rootId: bundle.root.id, start, end: cursor });
    }
    return {
      bundleBoundaryIndexes: [...boundaries].sort((left, right) => left - right),
      bundleRootIds: rootIds,
      bundleRanges: ranges,
    };
  }, [allLayers]);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [laneLockDialog, setLaneLockDialog] = useState<LaneLockDialogState | null>(null);
  const [laneLockValue, setLaneLockValue] = useState('1');
  const [laneLockError, setLaneLockError] = useState('');

  // ── Drag-and-drop state ──
  const [dragState, setDragState] = useState<{
    draggedId: string;
    draggedLayerIds: string[];
    sourceIndex: number;
    sourceSpan: number;
    sourceType: 'transcription' | 'translation';
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLSpanElement | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
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
        const lane = lanes[i];
        if (!lane) continue;
        lane.classList.add('timeline-lane-row-shift');
        lane.style.setProperty('--timeline-lane-shift-offset', `${-dragBlockHeight}px`);
      }
      return;
    }

    for (let i = insertionIndex; i < sourceIndex; i++) {
      const lane = lanes[i];
      if (!lane) continue;
      lane.classList.add('timeline-lane-row-shift');
      lane.style.setProperty('--timeline-lane-shift-offset', `${dragBlockHeight}px`);
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    onFocusLayer(layer.id);
  }, [layer.id, onFocusLayer]);

  const clearLaneDragVisual = useCallback(() => {
    if (dragVisualRafRef.current !== null) {
      cancelAnimationFrame(dragVisualRafRef.current);
      dragVisualRafRef.current = null;
    }
    dragVisualCurrentOffsetRef.current = 0;
    dragVisualTargetOffsetRef.current = 0;
    draggedLaneRowsRef.current.forEach((lane) => {
      lane.classList.remove('timeline-lane-row-dragging');
      lane.style.removeProperty('--timeline-lane-drag-offset');
    });
    draggedLaneRowsRef.current = [];
  }, []);

  const closeLaneLockDialog = useCallback(() => {
    setLaneLockDialog(null);
    setLaneLockValue('1');
    setLaneLockError('');
  }, []);

  const openLaneLockDialog = useCallback((selectedSpeakerHint: string, initialLaneIndex: number) => {
    setLaneLockDialog({ selectedSpeakerHint, initialLaneIndex });
    setLaneLockValue(String(initialLaneIndex + 1));
    setLaneLockError('');
  }, []);

  const confirmLaneLockDialog = useCallback(() => {
    if (!trackModeControl?.onLockSelectedToLane) return;
    const laneIndex = Number.parseInt(laneLockValue.trim(), 10);
    if (!Number.isFinite(laneIndex) || laneIndex < 1) {
      setLaneLockError('请输入大于等于 1 的轨道序号');
      return;
    }
    trackModeControl.onLockSelectedToLane(laneIndex - 1);
    closeLaneLockDialog();
  }, [closeLaneLockDialog, laneLockValue, trackModeControl]);

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
      lanes.forEach((lane) => {
        lane.classList.add('timeline-lane-row-dragging');
        lane.style.setProperty('--timeline-lane-drag-offset', `${next}px`);
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
    const lane = laneRowRef.current;
    const startY = dragStartClientYRef.current;
    if (!lane || startY === null) return;
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
      Array.from(laneLabels, (lane) => lane.getBoundingClientRect()),
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

  // Long press (500ms) to start drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    dropIntentRef.current = null;
    dragStartClientYRef.current = e.clientY;
    dragLastClientYRef.current = e.clientY;
    dragDirectionRef.current = 'none';
    laneRowRef.current = headerRef.current?.closest<HTMLElement>('.timeline-lane') ?? null;
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }

    const idx = allLayers.findIndex((l) => l.id === layer.id);
    const draggedLayerIds = resolveLayerDragGroup(allLayers, layer.id);
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
  }, [allLayers, layer.id, layer.layerType, resolveDraggedLaneRows, updateBundleBoundaryHighlightVisual, updateLaneDragVisual]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  const commitDragReorder = useCallback((clientY?: number) => {
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
    // 采用 over-target 提交语义：放手时不重算命中，直接提交最后一次预览。
    // Use over-target commit semantics: do not recompute on mouseup, commit the last preview target.
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

    const handleDocumentMouseUp = (e: MouseEvent) => {
      commitDragReorder(e.clientY);
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

  const viewMenuItems: ContextMenuItem[] = [
    {
      label: isCollapsed ? '展开该层' : '折叠该层',
      onClick: () => {
        onToggleCollapsed?.();
      },
    },
    {
      label: effectiveShowConnectors
        ? '隐藏层级关系'
        : (hasResolvableConnectorData ? '显示层级关系' : '显示层级关系（暂无可用链接）'),
      disabled: !hasResolvableConnectorData,
      onClick: () => {
        onToggleConnectors?.();
      },
    },
  ];

  const layerOperationMenuItems: ContextMenuItem[] = [
    {
      label: '新建转写层',
      onClick: () => {
        onLayerAction('create-transcription', layer.id);
      },
    },
    {
      label: '新建翻译层',
      disabled: !canOpenTranslationCreate,
      onClick: () => {
        onLayerAction('create-translation', layer.id);
      },
    },
    {
      label: '删除当前层',
      danger: true,
      disabled: !deletableLayers.some((l) => l.id === layer.id),
      onClick: () => {
        onLayerAction('delete', layer.id);
      },
    },
  ];

  const contextMenuItems: ContextMenuItem[] = [
    ...layerOperationMenuItems,
    {
      label: '视图',
      meta: `${isCollapsed ? '折叠' : '展开'} · ${effectiveShowConnectors ? '连线' : '无线'}`,
      variant: 'category',
      separatorBefore: true,
      children: viewMenuItems,
    },
  ];

  // 显示样式子菜单 | Display style submenu
  if (displayStyleControl) {
    const styleItems = buildLayerStyleMenuItems(
      layer.displaySettings,
      layer.id,
      layer.languageId,
      layer.orthographyId,
      displayStyleControl.orthographies,
      (patch) => displayStyleControl.onUpdate(layer.id, patch),
      () => displayStyleControl.onReset(layer.id),
      displayStyleControl.localFonts,
    );
    contextMenuItems.push({
      label: '显示样式',
      variant: 'category',
      children: styleItems,
    });
  }

  if (speakerQuickActions) {
    const { selectedCount, speakerOptions, onAssignToSelection, onClearSelection, onOpenCreateAndAssignPanel } = speakerQuickActions;
    const topSpeakers = speakerOptions.slice(0, 3);
    const speakerMenuItems: ContextMenuItem[] = [{
      label: selectedCount > 0 ? `清空 ${selectedCount} 个选中句段的说话人` : '清空选中句段说话人',
      disabled: selectedCount === 0,
      onClick: () => {
        onClearSelection();
      },
    }];
    for (const speaker of topSpeakers) {
      speakerMenuItems.push({
        label: selectedCount > 0
          ? `指派 ${selectedCount} 个选中句段 → ${speaker.name}`
          : `指派选中句段 → ${speaker.name}`,
        disabled: selectedCount === 0,
        onClick: () => {
          onAssignToSelection(speaker.id);
        },
      });
    }
    speakerMenuItems.push({
      label: selectedCount > 0 ? '新建说话人并指派到选中句段…' : '新建说话人并指派…',
      disabled: selectedCount === 0,
      onClick: () => {
        onOpenCreateAndAssignPanel();
      },
    });
    contextMenuItems.push({
      label: '说话人',
      meta: selectedCount > 0 ? `已选 ${selectedCount}` : '未选',
      variant: 'category',
      children: speakerMenuItems,
    });
  }

  if (trackModeControl) {
    const selectedSpeakerNames = trackModeControl.selectedSpeakerNames ?? [];
    const selectedSpeakerHint = selectedSpeakerNames.length > 0
      ? selectedSpeakerNames.join('、')
      : '当前未选中带说话人的句段';
    const lockConflictCount = trackModeControl.lockConflictCount ?? 0;
    const hasExistingLaneLocks = (trackModeControl.lockedSpeakerCount ?? 0) > 0;

    const trackMenuItems: ContextMenuItem[] = [
      {
        label: `当前模式：${formatTrackModeMenuLabel(trackModeControl.mode)}`,
        disabled: true,
      },
    ];

    if (!trackModeControl.onSetMode) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'single' ? '切换到多轨模式（自动）' : '切换到单轨模式',
        onClick: () => {
          trackModeControl.onToggle();
        },
      });
    }

    if (trackModeControl.onSetMode) {
      trackMenuItems.push({
        label: '切换到多轨模式（自动）',
        disabled: trackModeControl.mode === 'multi-auto',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-auto');
        },
      });
      trackMenuItems.push({
        label: hasExistingLaneLocks ? '切换到多轨模式（锁定）' : '切换到多轨模式（锁定，需先锁定说话人）',
        disabled: trackModeControl.mode === 'multi-locked' || !hasExistingLaneLocks,
        onClick: () => {
          trackModeControl.onSetMode?.('multi-locked');
        },
      });
      trackMenuItems.push({
        label: '切换到多轨模式（一人一轨）',
        disabled: trackModeControl.mode === 'multi-speaker-fixed',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-speaker-fixed');
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onLockSelectedToLane) {
      trackMenuItems.push({
        label: `锁定选中说话人到轨道…（${selectedSpeakerHint}）`,
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          openLaneLockDialog(selectedSpeakerHint, 0);
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onUnlockSelected) {
      trackMenuItems.push({
        label: `解锁选中说话人（当前已锁 ${trackModeControl.lockedSpeakerCount ?? 0}）`,
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          trackModeControl.onUnlockSelected?.();
        },
      });
    }

    if (trackModeControl.onResetAuto) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed' ? '恢复自动分轨并清空轨道映射' : '恢复自动分轨并清空锁定',
        onClick: () => {
          trackModeControl.onResetAuto?.();
        },
      });
    }

    if (lockConflictCount > 0) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed'
          ? `一人一轨冲突 ${lockConflictCount} 项（请修正切分或说话人标注）`
          : `锁定冲突 ${lockConflictCount} 项（已回退自动分配）`,
        disabled: true,
      });
    }

    contextMenuItems.push({
      label: '轨道',
      meta: formatTrackModeMenuLabel(trackModeControl.mode),
      variant: 'category',
      children: trackMenuItems,
    });
  }

  const isDragged = dragState?.draggedLayerIds.includes(layer.id) ?? false;
  const isDropInsideDraggedBlock = dragState
    ? dropTargetIndex !== null
      && dropTargetIndex > dragState.sourceIndex
      && dropTargetIndex < dragState.sourceIndex + dragState.sourceSpan
    : false;
  const isDropAbove = !isDropInsideDraggedBlock && dropTargetIndex === layerIndex && !isDragged;
  const isDropBelow = !isDropInsideDraggedBlock && dropTargetIndex === layerIndex + 1 && !isDragged;

  return (
    <div style={{ position: 'relative', display: 'contents' }}>
      {/* Drop indicator lines */}
      {isDropAbove && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'var(--color-primary, #3b82f6)',
            zIndex: 10,
          }}
        />
      )}
      {isDropBelow && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'var(--color-primary, #3b82f6)',
            zIndex: 10,
          }}
        />
      )}

      <span
        ref={headerRef}
        className={`timeline-lane-label timeline-lane-header ${isDragged ? 'timeline-lane-header-dragging' : ''}`}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (isCollapsed) {
            onToggleCollapsed?.();
            e.stopPropagation();
          }
          onFocusLayer(layer.id);
        }}
      >
        {/* 连接线容器 | Connector stack */}
        {!isCollapsed && effectiveShowConnectors && rowSegments.length > 0 && (() => {
          const connectorStackWidth = getLayerLinkStackWidth(connectorLayout.maxColumns);
          return (
            <span className="lane-link-stack" aria-hidden="true" style={{ width: connectorStackWidth }}>
              {rowSegments.map((segment) => (
                (() => {
                  const colors = getLayerLinkConnectorColors(segment.colorIndex);
                  return (
                <span
                  key={`${segment.column}-${segment.role}-${segment.colorIndex}`}
                  className={[
                    'lane-link-connector',
                    segment.role === 'bundle-root' ? 'lane-link-connector--bundle-root' : '',
                    segment.role === 'bundle-child-middle' ? 'lane-link-connector--bundle-child-middle' : '',
                    segment.role === 'bundle-child-end' ? 'lane-link-connector--bundle-child-end' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    '--lane-link-column': segment.column,
                    '--lane-link-color': colors.base,
                    '--lane-link-color-active': colors.active,
                  } as React.CSSProperties}
                >
                  {segment.role === 'bundle-root' ? <span className="lane-link-connector-root-marker" /> : null}
                  {segment.role !== 'bundle-root' ? <span className="lane-link-connector-child-marker" /> : null}
                </span>
                  );
                })()
              ))}
            </span>
          );
        })()}
        {!isCollapsed && renderLaneLabel(layer)}
        {/* Lane label width resize handle — pinned to header right edge */}
        {onLaneLabelWidthResize && (
          <div
            className="lane-label-resize-handle"
            onPointerDown={(e) => {
              e.stopPropagation();
              onLaneLabelWidthResize(e);
            }}
          />
        )}
      </span>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {laneLockDialog && (
        <div
          className="layer-action-popover-backdrop"
          onClick={closeLaneLockDialog}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <div
            className="transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered floating-panel"
            role="dialog"
            aria-modal="true"
            aria-label="锁定说话人到轨道"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ width: 360, maxWidth: 'calc(100vw - 32px)', height: 'auto' }}
          >
            <div className="transcription-layer-rail-action-popover-title floating-panel-title-row">
              <span>锁定说话人到轨道</span>
              <button
                type="button"
                className="floating-panel-reset-btn"
                onClick={closeLaneLockDialog}
                aria-label="关闭锁定轨道面板"
                title="关闭"
              >
                ×
              </button>
            </div>
            <div className="transcription-layer-rail-action-popover-body">
              <div className="speaker-rail-batch-panel">
                <p className="speaker-rail-summary">选中说话人：{laneLockDialog.selectedSpeakerHint}</p>
                <label className="speaker-rail-form-field">
                  <span>目标轨道序号</span>
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    step={1}
                    value={laneLockValue}
                    onChange={(event) => {
                      setLaneLockValue(event.target.value);
                      if (laneLockError) setLaneLockError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmLaneLockDialog();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeLaneLockDialog();
                      }
                    }}
                  />
                </label>
                <p className="speaker-rail-form-hint">输入从 1 开始的轨道编号，确认后会同时进入多轨锁定模式。</p>
                {laneLockError && <p className="speaker-rail-form-error">{laneLockError}</p>}
                <div className="speaker-rail-actions">
                  <button type="button" className="btn btn-sm" onClick={closeLaneLockDialog}>取消</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={confirmLaneLockDialog}>确认锁定</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
