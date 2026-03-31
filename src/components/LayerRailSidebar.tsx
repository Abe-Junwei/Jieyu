import { useState, useCallback, useEffect, useMemo, useRef, memo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LayerDocType } from '../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { resolveVerticalReorderTargetIndex, type VerticalDragDirection } from '../utils/dragReorder';
import { buildLayerDropIntent, type LayerDropIntent } from '../utils/layerDragDropModel';
import { formatLayerRailLabel, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { LayerActionPopover } from './LayerActionPopover';
import { useSpeakerRailContext } from '../contexts/SpeakerRailContext';
import { LayerRailProvider } from '../contexts/LayerRailContext';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import {
  type ExistingLayerConstraintIssue,
  type ExistingLayerConstraintRepair,
  listIndependentBoundaryTranscriptionLayers,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from '../services/LayerConstraintService';
import {
  buildLayerBundles,
  type LayerOrderIssue,
  type LayerOrderRepair,
  repairLayerOrder,
  resolveLayerDragGroup,
  validateLayerOrder,
} from '../services/LayerOrderingService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

type LayerActionResult = ReturnType<typeof useLayerActionPanel>;

type RailActionMenuKind = 'create' | 'more' | null;

function getLayerEffectiveConstraint(layer: LayerDocType): NonNullable<LayerDocType['constraint']> {
  return layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
}

function normalizeSpeakerName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

function formatConstraintLabel(layer: LayerDocType): string {
  const constraint = getLayerEffectiveConstraint(layer);
  switch (constraint) {
    case 'independent_boundary':
      return '独立边界';
    case 'time_subdivision':
      return '时间细分';
    case 'symbolic_association':
    default:
      return '符号关联';
  }
}

interface LayerRailSidebarProps {
  isCollapsed: boolean;
  layerRailRows: LayerDocType[];
  focusedLayerRowId: string;
  flashLayerRowId: string;
  onFocusLayer: (id: string) => void;
  transcriptionLayers: LayerDocType[];
  toggleLayerLink: (transcriptionKey: string, translationId: string) => Promise<void>;
  deletableLayers: LayerDocType[];
  layerCreateMessage: string;
  layerAction: LayerActionResult;
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
}

interface LayerRailActionModalProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

function LayerRailActionModal({ ariaLabel, children, onClose, className }: LayerRailActionModalProps) {
  const isSpeakerModal = Boolean(className?.includes('transcription-layer-rail-action-popover-speaker-centered'));
  const defaultSize = useMemo(
    () => (isSpeakerModal ? { width: 560, height: 560 } : { width: 340, height: 200 }),
    [isSpeakerModal],
  );
  const minSize = useMemo(
    () => (isSpeakerModal ? { width: 420, height: 320 } : { width: 280, height: 160 }),
    [isSpeakerModal],
  );

  const clampSize = useCallback((raw: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxWidth = Math.max(minSize.width, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(minSize.height, window.innerHeight - viewportPadding * 2);
    return {
      width: Math.min(Math.max(raw.width, minSize.width), maxWidth),
      height: Math.min(Math.max(raw.height, minSize.height), maxHeight),
    };
  }, [minSize.height, minSize.width]);

  const centerPosition = useCallback((panelSize: { width: number; height: number }) => ({
    x: Math.max(16, Math.round((window.innerWidth - panelSize.width) / 2)),
    y: Math.max(16, Math.round((window.innerHeight - panelSize.height) / 2)),
  }), []);

  const clampPosition = useCallback((raw: { x: number; y: number }, panelSize: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxX = Math.max(viewportPadding, window.innerWidth - panelSize.width - viewportPadding);
    const maxY = Math.max(viewportPadding, window.innerHeight - panelSize.height - viewportPadding);
    return {
      x: Math.min(Math.max(raw.x, viewportPadding), maxX),
      y: Math.min(Math.max(raw.y, viewportPadding), maxY),
    };
  }, []);

  const [size, setSize] = useState(() => clampSize(defaultSize));
  const [position, setPosition] = useState(() => centerPosition(clampSize(defaultSize)));
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const currentPositionRef = useRef(position);
  const currentSizeRef = useRef(size);

  useEffect(() => {
    currentPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    currentSizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const safeSize = clampSize(defaultSize);
    setSize(safeSize);
    setPosition(centerPosition(safeSize));
  }, [ariaLabel, centerPosition, clampSize, defaultSize]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) {
        const next = {
          x: dragRef.current.startLeft + (event.clientX - dragRef.current.startX),
          y: dragRef.current.startTop + (event.clientY - dragRef.current.startY),
        };
        setPosition(clampPosition(next, currentSizeRef.current));
      }

      if (resizeRef.current) {
        const nextSize = clampSize({
          width: resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
          height: resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
        });
        setSize(nextSize);
        setPosition((prev) => clampPosition(prev, nextSize));
      }
    };

    const onPointerUp = () => {
      if (!dragRef.current && !resizeRef.current) return;
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [clampPosition, clampSize]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) => {
        const safe = clampSize(prev);
        setPosition((old) => clampPosition(old, safe));
        return safe;
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPosition, clampSize]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: currentPositionRef.current.x,
      startTop: currentPositionRef.current.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentSizeRef.current.width,
      startHeight: currentSizeRef.current.height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  const handleResetLayout = (event?: React.MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    const safe = clampSize(defaultSize);
    setSize(safe);
    setPosition(centerPosition(safe));
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="layer-action-popover-backdrop"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={className ?? 'transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered floating-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          transform: 'none',
        }}
      >
        <div
          className="transcription-layer-rail-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={() => handleResetLayout()}
          title="拖动移动，双击回中并重置尺寸"
        >
          <span>{ariaLabel}</span>
          <button
            type="button"
            className="floating-panel-reset-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleResetLayout}
            aria-label="重置位置与尺寸"
            title="重置位置与尺寸"
          >
            ↺
          </button>
        </div>
        <div className="transcription-layer-rail-action-popover-body">
          {children}
        </div>
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}

export function LayerRailSidebar({
  isCollapsed,
  layerRailRows,
  focusedLayerRowId,
  flashLayerRowId,
  onFocusLayer,
  transcriptionLayers,
  toggleLayerLink,
  deletableLayers,
  layerCreateMessage,
  layerAction,
  onReorderLayers,
}: LayerRailSidebarProps) {
  // ── Speaker management context ───────────────────────────────────────────────
  const speakerCtx = useSpeakerRailContext();

  const {
    layerActionPanel, setLayerActionPanel, layerActionRootRef,
    quickDeleteLayerId, setQuickDeleteLayerId,
    quickDeleteKeepUtterances, setQuickDeleteKeepUtterances,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = layerAction;

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [createLayerPopoverAction, setCreateLayerPopoverAction] = useState<{
    action: 'create-transcription' | 'create-translation';
    layerId?: string;
  } | null>(null);
  const [railActionMenu, setRailActionMenu] = useState<RailActionMenuKind>(null);

  // 兼容外部入口（如空状态按钮）通过 layerActionPanel 触发创建弹层
  // Bridge external create requests (e.g. timeline empty-state button) to the unified popover.
  useEffect(() => {
    if (layerActionPanel !== 'create-transcription' && layerActionPanel !== 'create-translation') {
      return;
    }
    setCreateLayerPopoverAction({
      action: layerActionPanel,
    });
    setRailActionMenu(null);
    setLayerActionPanel(null);
  }, [layerActionPanel, setLayerActionPanel]);

  useEffect(() => {
    if (!createLayerPopoverAction && layerActionPanel === null) return;
    setRailActionMenu(null);
  }, [createLayerPopoverAction, layerActionPanel]);

  useEffect(() => {
    if (railActionMenu === null) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const root = layerActionRootRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setRailActionMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRailActionMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [layerActionRootRef, railActionMenu]);

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUtterances,
    setDeleteConfirmKeepUtterances,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  } = useLayerDeleteConfirm({
    deletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  });

  const handleLayerContextMenu = (e: React.MouseEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, layerId });
    onFocusLayer(layerId);
  };

  const openCreateLayerPopover = useCallback((action: 'create-transcription' | 'create-translation', layerId?: string) => {
    setRailActionMenu(null);
    setLayerActionPanel(null);
    setCreateLayerPopoverAction({ action, ...(layerId ? { layerId } : {}) });
  }, [setLayerActionPanel]);

  const openDeletePanelForLayer = useCallback((layerId: string) => {
    setRailActionMenu(null);
    setQuickDeleteLayerId(layerId);
    setLayerActionPanel('delete');
  }, [setLayerActionPanel, setQuickDeleteLayerId]);

  const handleChangeLayerParent = useCallback((transcriptionKey: string, translationId: string) => {
    fireAndForget(toggleLayerLink(transcriptionKey, translationId));
  }, [toggleLayerLink]);

  // ── Drag-and-drop state ──
  const [dragState, setDragState] = useState<{
    draggedId: string;
    draggedLayerIds: string[];
    sourceIndex: number;
    sourceSpan: number;
    sourceType: 'transcription' | 'translation';
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [collapsedSpeakerGroupKeys, setCollapsedSpeakerGroupKeys] = useState<Set<string>>(new Set());
  const [constraintRepairBusy, setConstraintRepairBusy] = useState(false);
  const [constraintRepairMessage, setConstraintRepairMessage] = useState('');
  const [constraintRepairDetails, setConstraintRepairDetails] = useState<{
    repairs: ExistingLayerConstraintRepair[];
    issues: ExistingLayerConstraintIssue[];
    orderRepairs: LayerOrderRepair[];
    orderIssues: LayerOrderIssue[];
  } | null>(null);
  const [constraintRepairDetailsCollapsed, setConstraintRepairDetailsCollapsed] = useState(false);
  const layerRailOverviewRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const dropIntentRef = useRef<LayerDropIntent | null>(null);
  const draggedRailRowsRef = useRef<HTMLElement[]>([]);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragLastClientYRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<VerticalDragDirection>('none');
  const { bundleBoundaryIndexes, bundleRootIds, bundleRanges } = useMemo(() => {
    const boundaries = new Set<number>([0, layerRailRows.length]);
    const rootIds = new Set<string>();
    const ranges: Array<{ rootId: string; start: number; end: number }> = [];
    let cursor = 0;
    for (const bundle of buildLayerBundles(layerRailRows)) {
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
  }, [layerRailRows]);
  const disableCreateTranslationEntry = transcriptionLayers.length === 0;
  const focusedLayer = useMemo(
    () => layerRailRows.find((layer) => layer.id === focusedLayerRowId) ?? null,
    [focusedLayerRowId, layerRailRows],
  );
  const independentRootLayers = useMemo(
    () => listIndependentBoundaryTranscriptionLayers(layerRailRows),
    [layerRailRows],
  );
  const layerKeyById = useMemo(
    () => new Map(layerRailRows.map((layer) => [layer.id, layer.key] as const)),
    [layerRailRows],
  );
  const layerLabelById = useMemo(
    () => new Map(layerRailRows.map((layer) => [layer.id, formatLayerRailLabel(layer)] as const)),
    [layerRailRows],
  );
  const focusedLayerParentKey = useMemo(() => {
    if (!focusedLayer?.parentLayerId) return '';
    return layerKeyById.get(focusedLayer.parentLayerId) ?? '';
  }, [focusedLayer, layerKeyById]);
  const focusedLayerParentLabel = useMemo(() => {
    if (!focusedLayer?.parentLayerId) return '';
    return layerLabelById.get(focusedLayer.parentLayerId) ?? '';
  }, [focusedLayer, layerLabelById]);
  const canEditFocusedLayerParent = focusedLayer?.layerType === 'translation'
    && independentRootLayers.length > 0;
  const groupedConstraintRepairDetails = useMemo(() => {
    if (!constraintRepairDetails) return [] as Array<{
      layerId: string;
      label: string;
      repairs: ExistingLayerConstraintRepair[];
      issues: ExistingLayerConstraintIssue[];
      orderRepairs: LayerOrderRepair[];
      orderIssues: LayerOrderIssue[];
    }>;
    const grouped = new Map<string, {
      layerId: string;
      label: string;
      repairs: ExistingLayerConstraintRepair[];
      issues: ExistingLayerConstraintIssue[];
      orderRepairs: LayerOrderRepair[];
      orderIssues: LayerOrderIssue[];
    }>();
    const ensureGroup = (layerId: string) => {
      const existing = grouped.get(layerId);
      if (existing) return existing;
      const created = {
        layerId,
        label: layerLabelById.get(layerId) ?? layerId,
        repairs: [] as ExistingLayerConstraintRepair[],
        issues: [] as ExistingLayerConstraintIssue[],
        orderRepairs: [] as LayerOrderRepair[],
        orderIssues: [] as LayerOrderIssue[],
      };
      grouped.set(layerId, created);
      return created;
    };
    for (const repair of constraintRepairDetails.repairs) {
      ensureGroup(repair.layerId).repairs.push(repair);
    }
    for (const issue of constraintRepairDetails.issues) {
      ensureGroup(issue.layerId).issues.push(issue);
    }
    for (const repair of constraintRepairDetails.orderRepairs) {
      ensureGroup(repair.layerId).orderRepairs.push(repair);
    }
    for (const issue of constraintRepairDetails.orderIssues) {
      ensureGroup(issue.layerId).orderIssues.push(issue);
    }
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  }, [constraintRepairDetails, layerLabelById]);

  const clearRailShiftVisual = useCallback(() => {
    const overview = layerRailOverviewRef.current;
    if (!overview) return;
    overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item-row').forEach((row) => {
      row.classList.remove('transcription-layer-rail-item-row-shift');
      row.style.removeProperty('--transcription-layer-rail-shift-offset');
    });
  }, []);

  const clearRailBoundaryHighlightVisual = useCallback(() => {
    const overview = layerRailOverviewRef.current;
    if (!overview) return;
    overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item-row').forEach((row) => {
      row.classList.remove('transcription-layer-rail-item-row-boundary-highlight-top');
      row.classList.remove('transcription-layer-rail-item-row-boundary-highlight-bottom');
    });
  }, []);

  const clearRailDragVisual = useCallback(() => {
    draggedRailRowsRef.current.forEach((row) => {
      row.classList.remove('transcription-layer-rail-item-row-dragging');
      row.style.removeProperty('--transcription-layer-rail-drag-offset');
    });
    draggedRailRowsRef.current = [];
  }, []);

  const getRailRows = useCallback((): HTMLElement[] => {
    const overview = layerRailOverviewRef.current;
    if (!overview) return [];
    return Array.from(overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item-row'));
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
      row.classList.add('transcription-layer-rail-item-row-dragging');
      row.style.setProperty('--transcription-layer-rail-drag-offset', `${deltaY}px`);
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
        row.classList.add('transcription-layer-rail-item-row-shift');
        row.style.setProperty('--transcription-layer-rail-shift-offset', `${-dragBlockHeight}px`);
      }
      return;
    }

    for (let i = insertionIndex; i < sourceIndex; i += 1) {
      const row = rows[i];
      if (!row) continue;
      row.classList.add('transcription-layer-rail-item-row-shift');
      row.style.setProperty('--transcription-layer-rail-shift-offset', `${dragBlockHeight}px`);
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
      rows[rows.length - 1]?.classList.add('transcription-layer-rail-item-row-boundary-highlight-bottom');
      return;
    }

    rows[dropIndex]?.classList.add('transcription-layer-rail-item-row-boundary-highlight-top');
  }, [bundleBoundaryIndexes, bundleRootIds, clearRailBoundaryHighlightVisual, getRailRows]);

  const handleRepairLayerConstraints = useCallback(async () => {
    setConstraintRepairBusy(true);
    setConstraintRepairMessage('');
    setConstraintRepairDetails(null);
    setConstraintRepairDetailsCollapsed(false);
    try {
      const constraintRepaired = repairExistingLayerConstraints(layerRailRows);
      const orderRepaired = repairLayerOrder(constraintRepaired.layers);
      const layerById = new Map(layerRailRows.map((layer) => [layer.id, layer] as const));
      const changedLayers = orderRepaired.layers.filter((layer) => {
        const before = layerById.get(layer.id);
        if (!before) return false;
        return getLayerEffectiveConstraint(before) !== getLayerEffectiveConstraint(layer)
          || (before.parentLayerId ?? '') !== (layer.parentLayerId ?? '');
      });
      const changedSortLayers = orderRepaired.layers.filter((layer) => {
        const before = layerById.get(layer.id);
        if (!before) return false;
        return (before.sortOrder ?? 0) !== (layer.sortOrder ?? 0);
      });
      if (changedLayers.length > 0) {
        const now = new Date().toISOString();
        await Promise.all(changedLayers.map((layer) => LayerTierUnifiedService.updateLayer({
          ...layer,
          updatedAt: now,
        })));
      }
      if (changedSortLayers.length > 0) {
        await Promise.all(changedSortLayers.map((layer) => LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0)));
      }
      const remainingIssues = validateExistingLayerConstraints(orderRepaired.layers);
      const remainingOrderIssues = validateLayerOrder(orderRepaired.layers);
      setConstraintRepairDetails({
        repairs: constraintRepaired.repairs,
        issues: remainingIssues,
        orderRepairs: orderRepaired.repairs,
        orderIssues: remainingOrderIssues,
      });
      if (changedLayers.length === 0 && changedSortLayers.length === 0 && remainingIssues.length === 0 && remainingOrderIssues.length === 0) {
        setConstraintRepairMessage('层约束检查通过，无需修复。');
        return;
      }
      setConstraintRepairMessage(
        (remainingIssues.length > 0 || remainingOrderIssues.length > 0)
          ? `已修复 ${changedLayers.length} 条结构约束、${changedSortLayers.length} 条顺序问题，仍有 ${remainingIssues.length + remainingOrderIssues.length} 条需人工处理。`
          : `已自动修复 ${changedLayers.length} 条结构约束、${changedSortLayers.length} 条顺序问题。`,
      );
    } catch (error) {
      setConstraintRepairMessage(`约束修复失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setConstraintRepairBusy(false);
    }
  }, [layerRailRows]);

  const toggleSpeakerGroupCollapsed = (speakerKey: string) => {
    setCollapsedSpeakerGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(speakerKey)) next.delete(speakerKey);
      else next.add(speakerKey);
      return next;
    });
  };

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  const resolveRailDropTargetIndex = useCallback((clientY: number): number | null => {
    const overview = layerRailOverviewRef.current;
    if (!overview) return null;

    const activeDrag = dragStateRef.current;
    if (!activeDrag) return null;

    const items = Array.from(overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item-row'));
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

    if (targetIndex > layerRailRows.length) targetIndex = layerRailRows.length;

    if (targetIndex > activeDrag.sourceIndex && targetIndex < activeDrag.sourceIndex + activeDrag.sourceSpan) {
      targetIndex = activeDrag.sourceIndex;
    }

    return targetIndex;
  }, [bundleBoundaryIndexes, bundleRootIds, layerRailRows.length]);

  const resolveRailDropTargetIndexForActiveDrag = useCallback((
    clientY: number,
    activeDrag: { draggedId: string; sourceIndex: number; sourceSpan: number },
  ): LayerDropIntent | null => {
    const baseTargetIndex = resolveRailDropTargetIndex(clientY);
    if (baseTargetIndex === null) return null;

    const overview = layerRailOverviewRef.current;
    if (!overview) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: layerRailRows.length,
        bundleRanges,
        isRootBundleDrag: bundleRootIds.has(activeDrag.draggedId),
      });
    }
    const rows = Array.from(overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item-row'));
    if (rows.length === 0) {
      return buildLayerDropIntent({
        draggedId: activeDrag.draggedId,
        sourceIndex: activeDrag.sourceIndex,
        sourceSpan: activeDrag.sourceSpan,
        baseTargetIndex,
        rowCount: layerRailRows.length,
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
  }, [bundleRanges, bundleRootIds, layerRailRows, resolveRailDropTargetIndex]);

  const resolveTargetBundleRange = useCallback((draggedId: string, dropIndex: number) => {
    if (!bundleRootIds.has(draggedId)) return null;
    if (!bundleBoundaryIndexes.includes(dropIndex)) return null;

    const clampedProbeIndex = Math.max(0, Math.min(dropIndex, layerRailRows.length - 1));
    const targetRange = bundleRanges.find((range) => clampedProbeIndex >= range.start && clampedProbeIndex < range.end);
    if (!targetRange || targetRange.rootId === draggedId) return null;
    return targetRange;
  }, [bundleBoundaryIndexes, bundleRanges, bundleRootIds, layerRailRows.length]);

  const commitRailDragReorder = useCallback((clientY?: number) => {
    const activeDrag = dragStateRef.current;
    if (typeof clientY === 'number') {
      updateRailDragDirection(clientY);
      updateRailDragVisual(clientY);
    }

    const resolvedIntent = (typeof clientY === 'number' && activeDrag)
      ? resolveRailDropTargetIndexForActiveDrag(clientY, activeDrag)
      : null;
    const resolvedTarget = resolvedIntent?.previewIndex ?? null;
    const previewTarget = dropIntentRef.current?.previewIndex ?? dropTargetIndexRef.current;
    let finalTarget = resolvedTarget ?? previewTarget;
    if (activeDrag && resolvedTarget !== null && previewTarget !== null) {
      // Keep the last preview target when mouseup jitters back to source row.
      if (resolvedTarget === activeDrag.sourceIndex && previewTarget !== activeDrag.sourceIndex) {
        finalTarget = previewTarget;
      }
    }

    if (activeDrag && finalTarget !== null && finalTarget !== activeDrag.sourceIndex) {
      fireAndForget(onReorderLayers(activeDrag.draggedId, finalTarget));
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

  const handleDragStart = (e: React.MouseEvent, layer: LayerDocType) => {
    // 长按 200ms 启动拖拽 | Long press (200ms) to start drag
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
      const currentIndex = layerRailRows.findIndex((l) => l.id === layer.id);
      const draggedLayerIds = resolveLayerDragGroup(layerRailRows, layer.id);
      const sourceSpan = draggedLayerIds.length;
      draggedRailRowsRef.current = getRailRows().slice(currentIndex, currentIndex + sourceSpan);
      dragStartClientYRef.current = e.clientY;
      dragLastClientYRef.current = e.clientY;
      dragDirectionRef.current = 'none';
      // 全局 grabbing 光标 | Global grabbing cursor
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
  };

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

  const contextMenuItems: ContextMenuItem[] = contextMenu ? [
    {
      label: '新建转写层',
      onClick: () => {
        setContextMenu(null);
        openCreateLayerPopover('create-transcription', contextMenu.layerId);
      },
    },
    {
      label: '新建翻译层',
      disabled: disableCreateTranslationEntry,
      onClick: () => {
        setContextMenu(null);
        openCreateLayerPopover('create-translation', contextMenu.layerId);
      },
    },
    {
      label: '删除当前层',
      danger: true,
      disabled: !deletableLayers.some((l) => l.id === contextMenu.layerId),
      onClick: () => {
        fireAndForget(requestDeleteLayer(contextMenu.layerId));
      },
    },
  ] : [];

  const speakerFilterOptionByKey = useMemo(
    () => new Map(speakerCtx.speakerFilterOptions.map((option) => [option.key, option] as const)),
    [speakerCtx.speakerFilterOptions],
  );

  const speakerManagementRows = useMemo(() => (
    speakerCtx.speakerOptions.map((speaker) => {
      const activeOption = speakerFilterOptionByKey.get(speaker.id);
      const projectStats = speakerCtx.speakerReferenceStatsReady
        ? (speakerCtx.speakerReferenceStats[speaker.id] ?? {
          utteranceCount: 0,
          segmentCount: 0,
          totalCount: 0,
        })
        : {
        utteranceCount: 0,
        segmentCount: 0,
        totalCount: 0,
        };
      return {
        key: speaker.id,
        name: speaker.name,
        count: activeOption?.count ?? 0,
        projectCount: projectStats.totalCount,
        utteranceCount: projectStats.utteranceCount,
        segmentCount: projectStats.segmentCount,
        isUnused: speakerCtx.speakerReferenceStatsReady && projectStats.totalCount === 0,
        ...(activeOption?.color ? { color: activeOption.color } : {}),
      };
    })
  ), [speakerCtx.speakerOptions, speakerCtx.speakerReferenceStats, speakerCtx.speakerReferenceStatsReady, speakerFilterOptionByKey]);

  const unusedSpeakerCount = useMemo(
    () => speakerManagementRows.filter((row) => row.isUnused).length,
    [speakerManagementRows],
  );

  const projectReferencedSpeakerCount = useMemo(
    () => speakerManagementRows.filter((row) => row.projectCount > 0).length,
    [speakerManagementRows],
  );

  const duplicateSpeakerGroupCount = useMemo(() => {
    const groups = new Map<string, number>();
    for (const speaker of speakerCtx.speakerOptions) {
      const key = normalizeSpeakerName(speaker.name);
      if (!key) continue;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return Array.from(groups.values()).filter((count) => count > 1).length;
  }, [speakerCtx.speakerOptions]);

  const duplicateSpeakerCountById = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const speaker of speakerCtx.speakerOptions) {
      const key = normalizeSpeakerName(speaker.name);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(speaker.id);
      groups.set(key, list);
    }

    const next = new Map<string, number>();
    for (const ids of groups.values()) {
      if (ids.length <= 1) continue;
      for (const id of ids) next.set(id, ids.length);
    }
    return next;
  }, [speakerCtx.speakerOptions]);

  const closeSpeakerManagementPanel = useCallback(() => {
    setLayerActionPanel(null);
  }, [setLayerActionPanel]);

  const runSpeakerPanelActionAndClose = useCallback((action: () => void | Promise<void>) => {
    fireAndForget((async () => {
      await action();
      closeSpeakerManagementPanel();
    })());
  }, [closeSpeakerManagementPanel]);

  const renderSpeakerManagementPopover = () => (
    <LayerRailActionModal
      ariaLabel="说话人管理"
      onClose={() => setLayerActionPanel(null)}
      className="transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered transcription-layer-rail-action-popover-speaker transcription-layer-rail-action-popover-speaker-centered floating-panel"
    >
      <div className="transcription-layer-rail-speaker-panel-section transcription-layer-rail-speaker-panel-summary">
        <strong className="transcription-layer-rail-speaker-panel-title">说话人管理</strong>
        <div className="transcription-layer-rail-speaker-panel-meta">
          <span>说话人实体：{speakerCtx.speakerOptions.length}</span>
          <span>当前范围已引用：{speakerCtx.speakerFilterOptions.length}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? `全项目已引用：${projectReferencedSpeakerCount}` : '全项目已引用：统计中…'}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? `未引用实体：${unusedSpeakerCount}` : '未引用实体：统计中…'}</span>
          <span>同名组：{duplicateSpeakerGroupCount}</span>
          <span>已选句段：{speakerCtx.selectedUtteranceIds.size}</span>
        </div>
        <div className="transcription-layer-rail-speaker-panel-summary-text">{speakerCtx.selectedSpeakerSummary}</div>
        {speakerCtx.speakerReferenceStatsReady && unusedSpeakerCount > 0 && (
          <div className="transcription-layer-rail-action-row transcription-layer-rail-action-row-fill">
            <button
              className="btn btn-sm"
              disabled={speakerCtx.speakerSaving}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleDeleteUnusedSpeakers); }}
              title="批量删除全项目未引用的说话人实体"
            >
              清理未引用实体（{unusedSpeakerCount}）
            </button>
          </div>
        )}
      </div>

      <div className="transcription-layer-rail-speaker-panel-section">
        <strong className="transcription-layer-rail-speaker-panel-subtitle">批量分配</strong>
        <select
          className="input transcription-layer-rail-action-input"
          value={speakerCtx.batchSpeakerId}
          onChange={(e) => speakerCtx.setBatchSpeakerId(e.target.value)}
          disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
        >
          <option value="">选择目标说话人</option>
          {speakerCtx.speakerOptions.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
          ))}
        </select>
        <div className="transcription-layer-rail-action-row transcription-layer-rail-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.batchSpeakerId.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleAssignSpeakerToSelectedRouted); }}
          >
            应用说话人
          </button>
          <button
            className="btn btn-sm btn-danger"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleClearSpeakerOnSelectedRouted); }}
            title="清空当前选中语段的说话人标签"
          >
            清空已选说话人
          </button>
        </div>
        <input
          className="input transcription-layer-rail-action-input"
          placeholder="新说话人名称"
          value={speakerCtx.speakerDraftName}
          onChange={(e) => speakerCtx.setSpeakerDraftName(e.target.value)}
          disabled={speakerCtx.speakerSaving}
        />
        <div className="transcription-layer-rail-action-row transcription-layer-rail-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.speakerDraftName.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerOnly); }}
            title="仅新建说话人，不分配句段"
          >
            仅新建
          </button>
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.speakerDraftName.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerAndAssign); }}
            title="新建说话人并分配到已选句段"
          >
            新建并分配
          </button>
        </div>
      </div>

      <div className="transcription-layer-rail-speaker-panel-section">
        <div className="transcription-layer-rail-speaker-filter" aria-label="说话人筛选">
          <button
            type="button"
            className={`transcription-layer-rail-speaker-chip ${speakerCtx.activeSpeakerFilterKey === 'all' ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
            onClick={() => speakerCtx.setActiveSpeakerFilterKey('all')}
            title="显示全部说话人"
          >
            全部
          </button>
          {speakerCtx.speakerFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`transcription-layer-rail-speaker-chip ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
              onClick={() => speakerCtx.setActiveSpeakerFilterKey(option.key)}
              title={`${option.name}（${option.count}）`}
              style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}
            >
              <span className="transcription-layer-rail-speaker-dot" />
              <span className="transcription-layer-rail-speaker-name">{option.name}</span>
              <span className="transcription-layer-rail-speaker-count">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      {speakerManagementRows.length > 0 && (
        <div className="transcription-layer-rail-speaker-panel-section transcription-layer-rail-speaker-groups" aria-label="说话人组">
          {speakerManagementRows.map((option) => {
            const isCollapsedGroup = collapsedSpeakerGroupKeys.has(option.key);
            const hasAssignmentsInScope = option.count > 0;
            const duplicateCount = duplicateSpeakerCountById.get(option.key) ?? 0;
            return (
              <div key={`group-${option.key}`} className="transcription-layer-rail-speaker-group">
                <div className="transcription-layer-rail-speaker-group-head" style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}>
                  <button
                    type="button"
                    className="transcription-layer-rail-speaker-group-toggle"
                    onClick={() => toggleSpeakerGroupCollapsed(option.key)}
                    aria-expanded={!isCollapsedGroup}
                    title={isCollapsedGroup ? '展开说话人组' : '折叠说话人组'}
                  >
                    <span className="transcription-layer-rail-speaker-dot" />
                    <span className="transcription-layer-rail-speaker-name">{option.name}</span>
                    <span className="transcription-layer-rail-speaker-count">{option.count}</span>
                  </button>
                  <div className="transcription-layer-rail-speaker-group-actions">
                    <button
                      type="button"
                      className={`transcription-layer-rail-speaker-mini-btn ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-mini-btn-active' : ''}`}
                      onClick={() => { speakerCtx.setActiveSpeakerFilterKey(option.key); closeSpeakerManagementPanel(); }}
                      title="只看该说话人"
                      disabled={!hasAssignmentsInScope}
                    >
                      聚焦
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleSelectSpeakerUtterances(option.key); closeSpeakerManagementPanel(); }}
                      title="选中该说话人的全部句段"
                      disabled={!hasAssignmentsInScope}
                    >
                      选中
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleClearSpeakerAssignments(option.key); closeSpeakerManagementPanel(); }}
                      title="删除该说话人的标签"
                      disabled={!hasAssignmentsInScope}
                    >
                      删除标签
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleExportSpeakerSegments(option.key); closeSpeakerManagementPanel(); }}
                      title="导出该说话人句段清单"
                      disabled={!hasAssignmentsInScope}
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleRenameSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title="重命名该说话人"
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleMergeSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title="将该说话人合并到其他说话人"
                    >
                      合并
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn transcription-layer-rail-speaker-mini-btn-danger"
                      onClick={() => { speakerCtx.handleDeleteSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title="删除该说话人实体（危险）"
                    >
                      删除说话人实体
                    </button>
                  </div>
                </div>
                {!isCollapsedGroup && (
                  <div className="transcription-layer-rail-speaker-group-body">
                    <div>{hasAssignmentsInScope ? `当前范围句段数：${option.count}` : '当前范围未引用'}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? `全项目引用：${option.projectCount}` : '全项目引用：统计中…'}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? `主轴句段：${option.utteranceCount} / 独立语段：${option.segmentCount}` : '主轴句段 / 独立语段：统计中…'}</div>
                    {option.isUnused && <div>该实体当前未被引用，可安全清理</div>}
                    {duplicateCount > 1 && <div>检测到同名实体组：{duplicateCount} 个，建议合并清理</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </LayerRailActionModal>
  );

  // ── Layer rail items render ──────────────────────────────────────────────────
  // Memoized row component to prevent re-renders when parent re-renders
  const LayerRailItemRow = memo(function LayerRailItemRow({
    layer,
    index,
    focusedLayerRowId,
    flashLayerRowId,
    dragState,
    dropTargetIndex,
    boundaryHighlight,
    bundleTargetHighlighted,
    parentLabel,
    onFocusLayer,
    onContextMenu,
    onMouseDown,
    onKeyboardReorder,
  }: {
    layer: LayerDocType;
    index: number;
    focusedLayerRowId: string;
    flashLayerRowId: string;
    dragState: { draggedId: string; draggedLayerIds: string[]; sourceIndex: number; sourceSpan: number; sourceType: 'transcription' | 'translation' } | null;
    dropTargetIndex: number | null;
    boundaryHighlight: 'top' | 'bottom' | null;
    bundleTargetHighlighted: boolean;
    parentLabel: string;
    onFocusLayer: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, layerId: string) => void;
    onMouseDown: (e: React.MouseEvent, layer: LayerDocType) => void;
    onKeyboardReorder: (layerId: string, currentIndex: number, direction: 'up' | 'down') => void;
  }) {
    const layerLabel = formatLayerRailLabel(layer);
    const labelParts = getLayerLabelParts(layer);
    const isActiveLayer = layer.id === focusedLayerRowId;
    const isFlashLayer = layer.id === flashLayerRowId;
    const isDragged = dragState?.draggedLayerIds.includes(layer.id) ?? false;
    const showDropIndicator = dropTargetIndex === index && !isDragged;
    const isTranslationLayer = layer.layerType === 'translation';
    const hasDependency = Boolean(parentLabel);

    return (
      <div
        key={layer.id}
        className={[
          'transcription-layer-rail-item-row',
          boundaryHighlight === 'top' ? 'transcription-layer-rail-item-row-boundary-highlight-top' : '',
          boundaryHighlight === 'bottom' ? 'transcription-layer-rail-item-row-boundary-highlight-bottom' : '',
          bundleTargetHighlighted ? 'transcription-layer-rail-item-row-bundle-target' : '',
        ].filter(Boolean).join(' ')}
        style={{ position: 'relative' }}
      >
        {showDropIndicator && (
          <div className="transcription-layer-rail-drop-indicator" />
        )}
        <button
          type="button"
          className={`transcription-layer-rail-item ${isActiveLayer ? 'transcription-layer-rail-item-active' : ''} ${isFlashLayer ? 'transcription-layer-rail-item-flash' : ''} ${isDragged ? 'transcription-layer-rail-item-dragging' : ''} ${isTranslationLayer ? 'transcription-layer-rail-item-translation' : 'transcription-layer-rail-item-transcription'} ${hasDependency ? 'transcription-layer-rail-item-dependent' : ''}`}
          onClick={() => !dragState && onFocusLayer(layer.id)}
          onContextMenu={(e) => onContextMenu(e, layer.id)}
          onMouseDown={(e) => !dragState && onMouseDown(e, layer)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              onKeyboardReorder(layer.id, index, e.key === 'ArrowUp' ? 'up' : 'down');
            }
          }}
          title={layerLabel}
          aria-roledescription="可拖拽层"
        >
          <span className="transcription-layer-rail-item-drag-handle" aria-hidden="true">⠇</span>
          <span className="transcription-layer-rail-item-chip" aria-hidden="true">
            {isTranslationLayer ? '译' : '写'}
          </span>
          <span className="transcription-layer-rail-item-label">
            <strong className="transcription-layer-rail-item-type">{labelParts.lang}</strong>
            {labelParts.alias ? <span className="transcription-layer-rail-item-alias">{labelParts.alias}</span> : null}
          </span>
        </button>
      </div>
    );
  });

  // 键盘拖拽：Arrow Up/Down 直接提交重排 | Keyboard reorder: commit on each arrow press
  const handleKeyboardReorder = useCallback((layerId: string, currentIndex: number, direction: 'up' | 'down') => {
    if (dragState) return; // 鼠标拖拽进行中时忽略键盘 | Ignore while mouse drag is active
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= layerRailRows.length) return;
    fireAndForget(onReorderLayers(layerId, targetIndex));
  }, [dragState, layerRailRows.length, onReorderLayers]);

  const renderLayerRailItems = () => {
    if (layerRailRows.length === 0) {
      return (
        <div className="transcription-layer-rail-empty">
          <span className="transcription-layer-rail-empty-icon">📂</span>
          <span>暂无层，点击下方按钮新建</span>
          <span className="transcription-layer-rail-empty-hint">↓</span>
        </div>
      );
    }
    const targetBundleRange = dragState && dropTargetIndex !== null
      ? resolveTargetBundleRange(dragState.draggedId, dropTargetIndex)
      : null;
    const bundleBoundaryHighlight = dragState && dropTargetIndex !== null && bundleRootIds.has(dragState.draggedId) && bundleBoundaryIndexes.includes(dropTargetIndex) && dropTargetIndex !== dragState.sourceIndex
      ? (dropTargetIndex >= layerRailRows.length
          ? { index: layerRailRows.length - 1, position: 'bottom' as const }
          : { index: dropTargetIndex, position: 'top' as const })
      : null;
    return layerRailRows.map((layer, index) => (
      <LayerRailItemRow
        key={layer.id}
        layer={layer}
        index={index}
        focusedLayerRowId={focusedLayerRowId}
        flashLayerRowId={flashLayerRowId}
        dragState={dragState}
        dropTargetIndex={dropTargetIndex}
        boundaryHighlight={bundleBoundaryHighlight?.index === index ? bundleBoundaryHighlight.position : null}
        bundleTargetHighlighted={Boolean(targetBundleRange && index >= targetBundleRange.start && index < targetBundleRange.end)}
        parentLabel={layer.parentLayerId ? (layerLabelById.get(layer.parentLayerId) ?? '') : ''}
        onFocusLayer={onFocusLayer}
        onContextMenu={handleLayerContextMenu}
        onMouseDown={handleDragStart}
        onKeyboardReorder={handleKeyboardReorder}
      />
    ));
  };

  const renderFocusedLayerInspector = () => {
    if (!focusedLayer) {
      return (
        <section className="transcription-layer-rail-inspector" aria-label="当前层详情">
          <div className="transcription-layer-rail-inspector-empty">请选择一个层查看详情。</div>
        </section>
      );
    }

    const labelParts = getLayerLabelParts(focusedLayer);
    const canDeleteFocusedLayer = deletableLayers.some((layer) => layer.id === focusedLayer.id);
    const hasValidFocusedParent = Boolean(focusedLayerParentKey)
      && independentRootLayers.some((candidateLayer) => candidateLayer.key === focusedLayerParentKey);

    return (
      <section className="transcription-layer-rail-inspector" aria-label="当前层详情">
        <div className="transcription-layer-rail-inspector-header">
          <span className="transcription-layer-rail-inspector-chip" data-layer-type={focusedLayer.layerType}>
            {focusedLayer.layerType === 'translation' ? '译' : '写'}
          </span>
          <span className="transcription-layer-rail-inspector-title">{formatLayerRailLabel(focusedLayer)}</span>
          <button
            type="button"
            className="transcription-layer-rail-inspector-del-btn"
            disabled={!canDeleteFocusedLayer}
            onClick={() => openDeletePanelForLayer(focusedLayer.id)}
            title="删除当前层"
            aria-label="删除当前层"
          >
            ✕
          </button>
        </div>
        <dl className="transcription-layer-rail-inspector-props">
          <div><dt>语言</dt><dd>{labelParts.lang}</dd></div>
          <div><dt>约束</dt><dd>{formatConstraintLabel(focusedLayer)}</dd></div>
          {labelParts.alias ? <div><dt>别名</dt><dd>{labelParts.alias}</dd></div> : null}
          {canEditFocusedLayerParent ? (
            <div>
              <dt>依赖转写层</dt>
              <dd>
                <select
                  aria-label="依赖转写层"
                  className="transcription-layer-rail-inspector-select"
                  value={hasValidFocusedParent ? focusedLayerParentKey : ''}
                  onChange={(event) => {
                    const nextParentKey = event.target.value;
                    if (!nextParentKey) return;
                    handleChangeLayerParent(nextParentKey, focusedLayer.id);
                  }}
                >
                  <option value="" disabled>
                    请选择
                  </option>
                  {independentRootLayers.map((trc) => (
                    <option key={`focused-${focusedLayer.id}-${trc.id}`} value={trc.key}>
                      {formatLayerRailLabel(trc)}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
          ) : null}
        </dl>
        {focusedLayer.layerType === 'translation' && independentRootLayers.length === 0 ? (
          <div className="transcription-layer-rail-inspector-note">暂无可用的独立转写层可供绑定。</div>
        ) : null}
      </section>
    );
  };

  return (
    <LayerRailProvider deletableLayers={deletableLayers} checkLayerHasContent={checkLayerHasContent} deleteLayer={deleteLayer} deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}>
    <aside className={`transcription-layer-rail ${isCollapsed ? 'transcription-layer-rail-collapsed' : ''}`} aria-label="文本区层滚动栏">
      <div
        ref={layerRailOverviewRef}
        className="transcription-layer-rail-overview"
      >
        {renderLayerRailItems()}
        {renderFocusedLayerInspector()}
      </div>
      <div className="transcription-layer-rail-actions" aria-label="层管理快捷操作" ref={layerActionRootRef}>
        <button
          type="button"
          className="transcription-layer-rail-action-btn"
          onClick={() => {
            setRailActionMenu(null);
            openCreateLayerPopover('create-transcription');
          }}
        >
          <span className="transcription-layer-rail-action-icon" aria-hidden="true">✏️</span><strong>新建转写层</strong>
        </button>
        <button
          type="button"
          className="transcription-layer-rail-action-btn"
          disabled={disableCreateTranslationEntry}
          onClick={() => {
            setRailActionMenu(null);
            openCreateLayerPopover('create-translation');
          }}
        >
          <span className="transcription-layer-rail-action-icon" aria-hidden="true">🌐</span><strong>新建翻译层</strong>
        </button>
        <button
          type="button"
          className={`transcription-layer-rail-action-btn ${railActionMenu === 'more' || layerActionPanel === 'speaker-management' || layerActionPanel === 'delete' ? 'transcription-layer-rail-action-btn-active' : ''}`}
          onClick={() => setRailActionMenu((prev) => (prev === 'more' ? null : 'more'))}
        >
          <span className="transcription-layer-rail-action-icon" aria-hidden="true">⋯</span><strong>更多</strong>
        </button>

        {railActionMenu === 'more' && (
          <div className="transcription-layer-rail-action-popover" role="group" aria-label="更多操作">
            <button
              type="button"
              className="transcription-layer-rail-action-btn"
              onClick={() => {
                setRailActionMenu(null);
                setLayerActionPanel((prev) => (prev === 'speaker-management' ? null : 'speaker-management'));
              }}
            >
              <span className="transcription-layer-rail-action-icon" aria-hidden="true">👥</span><strong>说话人管理</strong>
            </button>
            <button
              type="button"
              className="transcription-layer-rail-action-btn transcription-layer-rail-action-btn-danger"
              disabled={!focusedLayer}
              onClick={() => {
                if (!focusedLayer) return;
                openDeletePanelForLayer(focusedLayer.id);
              }}
            >
              <span className="transcription-layer-rail-action-icon" aria-hidden="true">🗑️</span><strong>删除当前层</strong>
            </button>
            <button
              type="button"
              className="transcription-layer-rail-action-btn"
              disabled={constraintRepairBusy || layerRailRows.length === 0}
              onClick={() => {
                setRailActionMenu(null);
                fireAndForget(handleRepairLayerConstraints());
              }}
            >
              <span className="transcription-layer-rail-action-icon" aria-hidden="true">🔧</span><strong>{constraintRepairBusy ? '修复中…' : '约束修复'}</strong>
            </button>
          </div>
        )}

        {layerActionPanel === 'speaker-management' && renderSpeakerManagementPopover()}

        {layerActionPanel === 'delete' && (
          <LayerRailActionModal ariaLabel="删除层" onClose={() => setLayerActionPanel(null)}>
            <select
              className="input transcription-layer-rail-action-input"
              value={quickDeleteLayerId}
              onChange={(e) => setQuickDeleteLayerId(e.target.value)}
            >
              {deletableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {formatLayerRailLabel(layer)}
                </option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={quickDeleteKeepUtterances}
                onChange={(e) => setQuickDeleteKeepUtterances(e.target.checked)}
              />
              保留现有语段区间
            </label>
            <div className="transcription-layer-rail-action-row">
              <button
                className="btn btn-sm btn-danger"
                disabled={!quickDeleteLayerId}
                onClick={() => {
                  fireAndForget((async () => {
                    await requestDeleteLayer(quickDeleteLayerId);
                    setLayerActionPanel(null);
                  })());
                }}
              >
                删除
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
            </div>
          </LayerRailActionModal>
        )}

        {layerCreateMessage && (
          <p className="small-text" style={{ margin: 0, fontSize: '0.7rem' }}>
            {layerCreateMessage}
          </p>
        )}
        {constraintRepairMessage && (
          <p className="small-text" style={{ margin: 0, fontSize: '0.7rem' }}>
            {constraintRepairMessage}
          </p>
        )}
        {constraintRepairDetails && (
          constraintRepairDetails.repairs.length > 0
          || constraintRepairDetails.issues.length > 0
          || constraintRepairDetails.orderRepairs.length > 0
          || constraintRepairDetails.orderIssues.length > 0
        ) && (
          <div
            aria-label="约束修复明细"
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: '0.72rem',
              lineHeight: 1.45,
              color: '#334155',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>修复明细</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConstraintRepairDetailsCollapsed((prev) => !prev)}
                aria-label={constraintRepairDetailsCollapsed ? '展开修复明细' : '收起修复明细'}
              >
                {constraintRepairDetailsCollapsed ? '展开明细' : '收起明细'}
              </button>
            </div>
            {!constraintRepairDetailsCollapsed && groupedConstraintRepairDetails.map((group) => (
              <div
                key={`group-${group.layerId}`}
                style={{
                  borderTop: '1px dashed #cbd5e1',
                  paddingTop: 6,
                  marginTop: 6,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{group.label}</div>
                {group.repairs.map((item, index) => (
                  <div key={`repair-${item.layerId}-${item.code}-${index}`}>
                    [已修复 / repaired][{item.code}] {item.message}
                  </div>
                ))}
                {group.issues.map((item, index) => (
                  <div key={`issue-${item.layerId}-${item.code}-${index}`}>
                    [待处理 / pending][{item.code}] {item.message}
                  </div>
                ))}
                {group.orderRepairs.map((item, index) => (
                  <div key={`order-repair-${item.layerId}-${item.code}-${index}`}>
                    [顺序已修复 / order repaired][{item.code}] {item.message}
                  </div>
                ))}
                {group.orderIssues.map((item, index) => (
                  <div key={`order-issue-${item.layerId}-${item.code}-${index}`}>
                    [顺序待处理 / order pending][{item.code}] {item.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context menu for right-click on layer items */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {createLayerPopoverAction && (
        <LayerActionPopover
          action={createLayerPopoverAction.action}
          layerId={createLayerPopoverAction.layerId}
          deletableLayers={deletableLayers}
          layerCreateMessage={layerCreateMessage}
          createLayer={async (layerType, input, modality) => createLayer(layerType, {
            languageId: input.languageId,
            ...(input.alias !== undefined ? { alias: input.alias } : {}),
            ...(input.constraint !== undefined ? { constraint: input.constraint } : {}),
            ...(input.parentLayerId !== undefined ? { parentLayerId: input.parentLayerId } : {}),
          }, modality)}
          deleteLayer={deleteLayer}
          deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}
          checkLayerHasContent={checkLayerHasContent}
          onClose={() => setCreateLayerPopoverAction(null)}
        />
      )}

      {/* Delete layer confirmation dialog */}
      <DeleteLayerConfirmDialog
        open={deleteLayerConfirm !== null}
        layerName={deleteLayerConfirm?.layerName ?? ''}
        layerType={deleteLayerConfirm?.layerType ?? 'transcription'}
        textCount={deleteLayerConfirm?.textCount ?? 0}
        {...(deleteLayerConfirm?.warningMessage !== undefined
          ? { warningMessage: deleteLayerConfirm.warningMessage }
          : {})}
        keepUtterances={deleteConfirmKeepUtterances}
        onKeepUtterancesChange={setDeleteConfirmKeepUtterances}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => { fireAndForget(confirmDeleteLayer()); }}
      />
    </aside>
    </LayerRailProvider>
  );
}
