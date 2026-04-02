import { useState, useCallback, useEffect, useMemo, useRef, memo, type CSSProperties } from 'react';
import type { LayerDocType } from '../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { resolveVerticalReorderTargetIndex, type VerticalDragDirection } from '../utils/dragReorder';
import { buildLayerDropIntent, type LayerDropIntent } from '../utils/layerDragDropModel';
import { formatSidePaneLayerLabel, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { LayerActionPopover } from './LayerActionPopover';
import { SidePaneActionModal } from './SidePaneActionModal';
import { useAppSidePaneHostOptional, useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { useSpeakerRailContext } from '../contexts/SpeakerRailContext';
import { SidePaneLayerProvider } from '../contexts/SidePaneContext';
import { useLocale } from '../i18n';
import { getSidePaneSidebarMessages, type SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
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
import type { UiFontScaleMode } from '../utils/panelAdaptiveLayout';

type LayerActionResult = ReturnType<typeof useLayerActionPanel>;

function getLayerEffectiveConstraint(layer: LayerDocType): NonNullable<LayerDocType['constraint']> {
  return layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
}

function normalizeSpeakerName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

function formatConstraintLabel(layer: LayerDocType, messages: SidePaneSidebarMessages): string {
  const constraint = getLayerEffectiveConstraint(layer);
  switch (constraint) {
    case 'independent_boundary':
      return messages.constraintIndependent;
    case 'time_subdivision':
      return messages.constraintTimeSubdivision;
    case 'symbolic_association':
    default:
      return messages.constraintSymbolicAssociation;
  }
}

interface SidePaneSidebarProps {
  sidePaneRows: LayerDocType[];
  focusedLayerRowId: string;
  flashLayerRowId: string;
  onFocusLayer: (id: string) => void;
  transcriptionLayers: LayerDocType[];
  toggleLayerLink: (transcriptionKey: string, translationId: string) => Promise<void>;
  deletableLayers: LayerDocType[];
  layerCreateMessage: string;
  layerAction: LayerActionResult;
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  uiFontScale?: number;
  uiFontScaleMode?: UiFontScaleMode;
  onUiFontScaleChange?: (nextScale: number) => void;
  onUiFontScaleReset?: () => void;
}

export function SidePaneSidebar({
  sidePaneRows,
  focusedLayerRowId,
  flashLayerRowId,
  onFocusLayer,
  transcriptionLayers,
  toggleLayerLink,
  deletableLayers,
  layerCreateMessage,
  layerAction,
  onReorderLayers,
  uiFontScale = 1,
  uiFontScaleMode = 'manual',
  onUiFontScaleChange,
  onUiFontScaleReset,
}: SidePaneSidebarProps) {
  const locale = useLocale();
  const messages = getSidePaneSidebarMessages(locale);

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

  // 兼容外部入口（如空状态按钮）通过 layerActionPanel 触发创建弹层
  // Bridge external create requests (e.g. timeline empty-state button) to the unified popover.
  useEffect(() => {
    if (layerActionPanel !== 'create-transcription' && layerActionPanel !== 'create-translation') {
      return;
    }
    setCreateLayerPopoverAction({
      action: layerActionPanel,
    });
    setLayerActionPanel(null);
  }, [layerActionPanel, setLayerActionPanel]);

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
    setLayerActionPanel(null);
    setCreateLayerPopoverAction({ action, ...(layerId ? { layerId } : {}) });
  }, [setLayerActionPanel]);

  const openDeletePanelForLayer = useCallback((layerId: string) => {
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
  const sidePaneHost = useAppSidePaneHostOptional();
  const hasSidePaneHost = sidePaneHost !== null;
  const sidePaneOverviewRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const dropIntentRef = useRef<LayerDropIntent | null>(null);
  const draggedRailRowsRef = useRef<HTMLElement[]>([]);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragLastClientYRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<VerticalDragDirection>('none');
  const { bundleBoundaryIndexes, bundleRootIds, bundleRanges } = useMemo(() => {
    const boundaries = new Set<number>([0, sidePaneRows.length]);
    const rootIds = new Set<string>();
    const ranges: Array<{ rootId: string; start: number; end: number }> = [];
    let cursor = 0;
    for (const bundle of buildLayerBundles(sidePaneRows)) {
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
  }, [sidePaneRows]);
  const disableCreateTranslationEntry = transcriptionLayers.length === 0;
  const uiFontScalePercent = useMemo(() => Math.round(Math.max(0.85, Math.min(1.4, uiFontScale)) * 100), [uiFontScale]);
  const uiFontScaleModeLabel = uiFontScaleMode === 'auto'
    ? messages.uiFontScaleModeAuto
    : messages.uiFontScaleModeManual;
  const focusedLayer = useMemo(
    () => sidePaneRows.find((layer) => layer.id === focusedLayerRowId) ?? null,
    [focusedLayerRowId, sidePaneRows],
  );
  const independentRootLayers = useMemo(
    () => listIndependentBoundaryTranscriptionLayers(sidePaneRows),
    [sidePaneRows],
  );
  const layerKeyById = useMemo(
    () => new Map(sidePaneRows.map((layer) => [layer.id, layer.key] as const)),
    [sidePaneRows],
  );
  const layerLabelById = useMemo(
    () => new Map(sidePaneRows.map((layer) => [layer.id, formatSidePaneLayerLabel(layer)] as const)),
    [sidePaneRows],
  );
  const focusedLayerParentKey = useMemo(() => {
    if (!focusedLayer?.parentLayerId) return '';
    return layerKeyById.get(focusedLayer.parentLayerId) ?? '';
  }, [focusedLayer, layerKeyById]);
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

  const handleRepairLayerConstraints = useCallback(async () => {
    setConstraintRepairBusy(true);
    setConstraintRepairMessage('');
    setConstraintRepairDetails(null);
    setConstraintRepairDetailsCollapsed(false);
    try {
      const constraintRepaired = repairExistingLayerConstraints(sidePaneRows);
      const orderRepaired = repairLayerOrder(constraintRepaired.layers);
      const layerById = new Map(sidePaneRows.map((layer) => [layer.id, layer] as const));
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
        setConstraintRepairMessage(messages.repairNoNeed);
        return;
      }
      setConstraintRepairMessage(
        (remainingIssues.length > 0 || remainingOrderIssues.length > 0)
          ? messages.repairSummary(changedLayers.length, changedSortLayers.length, remainingIssues.length + remainingOrderIssues.length)
          : messages.repairSummaryDone(changedLayers.length, changedSortLayers.length),
      );
    } catch (error) {
      setConstraintRepairMessage(`${messages.repairFailedPrefix}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setConstraintRepairBusy(false);
    }
  }, [messages, sidePaneRows]);

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
  }, [bundleRanges, bundleRootIds, sidePaneRows, resolveRailDropTargetIndex]);

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
      const currentIndex = sidePaneRows.findIndex((l) => l.id === layer.id);
      const draggedLayerIds = resolveLayerDragGroup(sidePaneRows, layer.id);
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
      label: messages.contextCreateTranscription,
      onClick: () => {
        setContextMenu(null);
        openCreateLayerPopover('create-transcription', contextMenu.layerId);
      },
    },
    {
      label: messages.contextCreateTranslation,
      disabled: disableCreateTranslationEntry,
      onClick: () => {
        setContextMenu(null);
        openCreateLayerPopover('create-translation', contextMenu.layerId);
      },
    },
    {
      label: messages.contextDeleteCurrentLayer,
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
    <SidePaneActionModal
      ariaLabel={messages.speakerManagementTitle}
      closeLabel={messages.cancelButton}
      onClose={() => setLayerActionPanel(null)}
      className="transcription-side-pane-action-popover transcription-side-pane-action-popover-centered transcription-side-pane-action-popover-speaker transcription-side-pane-action-popover-speaker-centered floating-panel"
    >
      <div className="transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-panel-summary">
        <strong className="transcription-side-pane-speaker-panel-title">{messages.speakerManagementTitle}</strong>
        <div className="transcription-side-pane-speaker-panel-meta">
          <span>{messages.speakerEntityCount(speakerCtx.speakerOptions.length)}</span>
          <span>{messages.speakerReferencedInScope(speakerCtx.speakerFilterOptions.length)}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? messages.speakerReferencedProject(projectReferencedSpeakerCount) : messages.speakerReferencedProjectPending}</span>
          <span>{speakerCtx.speakerReferenceStatsReady ? messages.speakerUnusedCount(unusedSpeakerCount) : messages.speakerUnusedCountPending}</span>
          <span>{messages.speakerDuplicateGroupCount(duplicateSpeakerGroupCount)}</span>
          <span>{messages.speakerSelectedUtteranceCount(speakerCtx.selectedUtteranceIds.size)}</span>
        </div>
        <div className="transcription-side-pane-speaker-panel-summary-text">{speakerCtx.selectedSpeakerSummary}</div>
        {speakerCtx.speakerReferenceStatsReady && unusedSpeakerCount > 0 && (
          <div className="transcription-side-pane-action-row transcription-side-pane-action-row-fill">
            <button
              className="btn btn-sm"
              disabled={speakerCtx.speakerSaving}
              onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleDeleteUnusedSpeakers); }}
              title={messages.speakerCleanupUnusedTitle}
            >
              {messages.speakerCleanupUnusedButton(unusedSpeakerCount)}
            </button>
          </div>
        )}
      </div>

      <div className="transcription-side-pane-speaker-panel-section">
        <strong className="transcription-side-pane-speaker-panel-subtitle">{messages.speakerBatchAssignTitle}</strong>
        <select
          className="input transcription-side-pane-action-input"
          value={speakerCtx.batchSpeakerId}
          onChange={(e) => speakerCtx.setBatchSpeakerId(e.target.value)}
          disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
        >
          <option value="">{messages.speakerTargetPlaceholder}</option>
          {speakerCtx.speakerOptions.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
          ))}
        </select>
        <div className="transcription-side-pane-action-row transcription-side-pane-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.batchSpeakerId.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleAssignSpeakerToSelectedRouted); }}
          >
            {messages.speakerApplyButton}
          </button>
          <button
            className="btn btn-sm btn-danger"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleClearSpeakerOnSelectedRouted); }}
            title={messages.speakerClearTitle}
          >
            {messages.speakerClearButton}
          </button>
        </div>
        <input
          className="input transcription-side-pane-action-input"
          placeholder={messages.speakerDraftPlaceholder}
          value={speakerCtx.speakerDraftName}
          onChange={(e) => speakerCtx.setSpeakerDraftName(e.target.value)}
          disabled={speakerCtx.speakerSaving}
        />
        <div className="transcription-side-pane-action-row transcription-side-pane-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.speakerDraftName.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerOnly); }}
            title={messages.speakerCreateOnlyTitle}
          >
            {messages.speakerCreateOnlyButton}
          </button>
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.speakerDraftName.trim().length === 0}
            onClick={() => { runSpeakerPanelActionAndClose(speakerCtx.handleCreateSpeakerAndAssign); }}
            title={messages.speakerCreateAssignTitle}
          >
            {messages.speakerCreateAssignButton}
          </button>
        </div>
      </div>

      <div className="transcription-side-pane-speaker-panel-section">
        <div className="transcription-side-pane-speaker-filter" aria-label={messages.speakerFilterAria}>
          <button
            type="button"
            className={`transcription-side-pane-speaker-chip ${speakerCtx.activeSpeakerFilterKey === 'all' ? 'transcription-side-pane-speaker-chip-active' : ''}`}
            onClick={() => speakerCtx.setActiveSpeakerFilterKey('all')}
            title={messages.speakerFilterAllTitle}
          >
            {messages.speakerFilterAllLabel}
          </button>
          {speakerCtx.speakerFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`transcription-side-pane-speaker-chip ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-side-pane-speaker-chip-active' : ''}`}
              onClick={() => speakerCtx.setActiveSpeakerFilterKey(option.key)}
              title={`${option.name}（${option.count}）`}
              style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}
            >
              <span className="transcription-side-pane-speaker-dot" />
              <span className="transcription-side-pane-speaker-name">{option.name}</span>
              <span className="transcription-side-pane-speaker-count">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      {speakerManagementRows.length > 0 && (
        <div className="transcription-side-pane-speaker-panel-section transcription-side-pane-speaker-groups" aria-label={messages.speakerGroupAria}>
          {speakerManagementRows.map((option) => {
            const isCollapsedGroup = collapsedSpeakerGroupKeys.has(option.key);
            const hasAssignmentsInScope = option.count > 0;
            const duplicateCount = duplicateSpeakerCountById.get(option.key) ?? 0;
            return (
              <div key={`group-${option.key}`} className="transcription-side-pane-speaker-group">
                <div className="transcription-side-pane-speaker-group-head" style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}>
                  <button
                    type="button"
                    className="transcription-side-pane-speaker-group-toggle"
                    onClick={() => toggleSpeakerGroupCollapsed(option.key)}
                    aria-expanded={!isCollapsedGroup}
                    title={isCollapsedGroup ? messages.speakerGroupExpand : messages.speakerGroupCollapse}
                  >
                    <span className="transcription-side-pane-speaker-dot" />
                    <span className="transcription-side-pane-speaker-name">{option.name}</span>
                    <span className="transcription-side-pane-speaker-count">{option.count}</span>
                  </button>
                  <div className="transcription-side-pane-speaker-group-actions">
                    <button
                      type="button"
                      className={`transcription-side-pane-speaker-mini-btn ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-side-pane-speaker-mini-btn-active' : ''}`}
                      onClick={() => { speakerCtx.setActiveSpeakerFilterKey(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerFocusTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerFocusButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleSelectSpeakerUtterances(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerSelectAllTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerSelectAllButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleClearSpeakerAssignments(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerDeleteTagTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerDeleteTagButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleExportSpeakerSegments(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerExportTitle}
                      disabled={!hasAssignmentsInScope}
                    >
                      {messages.speakerExportButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleRenameSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerRenameTitle}
                    >
                      {messages.speakerRenameButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn"
                      onClick={() => { speakerCtx.handleMergeSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerMergeTitle}
                    >
                      {messages.speakerMergeButton}
                    </button>
                    <button
                      type="button"
                      className="transcription-side-pane-speaker-mini-btn transcription-side-pane-speaker-mini-btn-danger"
                      onClick={() => { speakerCtx.handleDeleteSpeaker(option.key); closeSpeakerManagementPanel(); }}
                      title={messages.speakerDeleteEntityTitle}
                    >
                      {messages.speakerDeleteEntityButton}
                    </button>
                  </div>
                </div>
                {!isCollapsedGroup && (
                  <div className="transcription-side-pane-speaker-group-body">
                    <div>{hasAssignmentsInScope ? messages.speakerCurrentScopeCount(option.count) : messages.speakerCurrentScopeNone}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? messages.speakerProjectRefCount(option.projectCount) : messages.speakerProjectRefPending}</div>
                    <div>{speakerCtx.speakerReferenceStatsReady ? messages.speakerAxisStats(option.utteranceCount, option.segmentCount) : messages.speakerAxisStatsPending}</div>
                    {option.isUnused && <div>{messages.speakerUnusedEntityHint}</div>}
                    {duplicateCount > 1 && <div>{messages.speakerDuplicateEntityHint(duplicateCount)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SidePaneActionModal>
  );

  // ── Layer rail items render ──────────────────────────────────────────────────
  // Memoized row component to prevent re-renders when parent re-renders
  const SidePaneItemRow = memo(function SidePaneItemRow({
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
    const layerLabel = formatSidePaneLayerLabel(layer);
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
          'transcription-side-pane-item-row',
          boundaryHighlight === 'top' ? 'transcription-side-pane-item-row-boundary-highlight-top' : '',
          boundaryHighlight === 'bottom' ? 'transcription-side-pane-item-row-boundary-highlight-bottom' : '',
          bundleTargetHighlighted ? 'transcription-side-pane-item-row-bundle-target' : '',
        ].filter(Boolean).join(' ')}
        style={{ position: 'relative' }}
      >
        {showDropIndicator && (
          <div className="transcription-side-pane-drop-indicator" />
        )}
        <button
          type="button"
          className={`transcription-side-pane-item ${isActiveLayer ? 'transcription-side-pane-item-active' : ''} ${isFlashLayer ? 'transcription-side-pane-item-flash' : ''} ${isDragged ? 'transcription-side-pane-item-dragging' : ''} ${isTranslationLayer ? 'transcription-side-pane-item-translation' : 'transcription-side-pane-item-transcription'} ${hasDependency ? 'transcription-side-pane-item-dependent' : ''}`}
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
          aria-roledescription={messages.draggableLayerRoleDesc}
        >
          <span className="transcription-side-pane-item-drag-handle" aria-hidden="true">⠇</span>
          <span className="transcription-side-pane-item-chip" aria-hidden="true">
            {isTranslationLayer ? messages.layerTypeTranslationShort : messages.layerTypeTranscriptionShort}
          </span>
          <span className="transcription-side-pane-item-label">
            <strong className="transcription-side-pane-item-type">{labelParts.lang}</strong>
            {labelParts.alias ? <span className="transcription-side-pane-item-alias">{labelParts.alias}</span> : null}
          </span>
        </button>
      </div>
    );
  });

  // 键盘拖拽：Arrow Up/Down 直接提交重排 | Keyboard reorder: commit on each arrow press
  const handleKeyboardReorder = useCallback((layerId: string, currentIndex: number, direction: 'up' | 'down') => {
    if (dragState) return; // 鼠标拖拽进行中时忽略键盘 | Ignore while mouse drag is active
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sidePaneRows.length) return;
    fireAndForget(onReorderLayers(layerId, targetIndex));
  }, [dragState, sidePaneRows.length, onReorderLayers]);

  const renderSidePaneItems = () => {
    if (sidePaneRows.length === 0) {
      return (
        <div className="transcription-side-pane-empty">
          <span className="transcription-side-pane-empty-icon">📂</span>
          <span>{messages.emptyLayerHint}</span>
          <span className="transcription-side-pane-empty-hint">↓</span>
        </div>
      );
    }
    const targetBundleRange = dragState && dropTargetIndex !== null
      ? resolveTargetBundleRange(dragState.draggedId, dropTargetIndex)
      : null;
    const bundleBoundaryHighlight = dragState && dropTargetIndex !== null && bundleRootIds.has(dragState.draggedId) && bundleBoundaryIndexes.includes(dropTargetIndex) && dropTargetIndex !== dragState.sourceIndex
      ? (dropTargetIndex >= sidePaneRows.length
          ? { index: sidePaneRows.length - 1, position: 'bottom' as const }
          : { index: dropTargetIndex, position: 'top' as const })
      : null;
    return sidePaneRows.map((layer, index) => (
      <SidePaneItemRow
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
        <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
          <div className="transcription-side-pane-inspector-empty">{messages.inspectorEmpty}</div>
        </section>
      );
    }

    const labelParts = getLayerLabelParts(focusedLayer);
    const canDeleteFocusedLayer = deletableLayers.some((layer) => layer.id === focusedLayer.id);
    const hasValidFocusedParent = Boolean(focusedLayerParentKey)
      && independentRootLayers.some((candidateLayer) => candidateLayer.key === focusedLayerParentKey);

    return (
      <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
        <div className="transcription-side-pane-inspector-header">
          <span className="transcription-side-pane-inspector-chip" data-layer-type={focusedLayer.layerType}>
            {focusedLayer.layerType === 'translation' ? messages.layerTypeTranslationShort : messages.layerTypeTranscriptionShort}
          </span>
          <span className="transcription-side-pane-inspector-title">{formatSidePaneLayerLabel(focusedLayer)}</span>
          <button
            type="button"
            className="transcription-side-pane-inspector-del-btn"
            disabled={!canDeleteFocusedLayer}
            onClick={() => openDeletePanelForLayer(focusedLayer.id)}
            title={messages.inspectorDeleteCurrentLayerTitle}
            aria-label={messages.inspectorDeleteCurrentLayerAria}
          >
            ✕
          </button>
        </div>
        <dl className="transcription-side-pane-inspector-props">
          <div><dt>{messages.inspectorLanguage}</dt><dd>{labelParts.lang}</dd></div>
          <div><dt>{messages.inspectorConstraint}</dt><dd>{formatConstraintLabel(focusedLayer, messages)}</dd></div>
          {labelParts.alias ? <div><dt>{messages.inspectorAlias}</dt><dd>{labelParts.alias}</dd></div> : null}
          {canEditFocusedLayerParent ? (
            <div>
              <dt>{messages.inspectorParentLayer}</dt>
              <dd>
                <select
                  aria-label={messages.inspectorParentLayerAria}
                  className="transcription-side-pane-inspector-select"
                  value={hasValidFocusedParent ? focusedLayerParentKey : ''}
                  onChange={(event) => {
                    const nextParentKey = event.target.value;
                    if (!nextParentKey) return;
                    handleChangeLayerParent(nextParentKey, focusedLayer.id);
                  }}
                >
                  <option value="" disabled>
                    {messages.inspectorSelectPlaceholder}
                  </option>
                  {independentRootLayers.map((trc) => (
                    <option key={`focused-${focusedLayer.id}-${trc.id}`} value={trc.key}>
                      {formatSidePaneLayerLabel(trc)}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
          ) : null}
        </dl>
        {focusedLayer.layerType === 'translation' && independentRootLayers.length === 0 ? (
          <div className="transcription-side-pane-inspector-note">{messages.inspectorNoIndependentLayer}</div>
        ) : null}
      </section>
    );
  };

  const sidePaneOverviewNode = (
    <div
      ref={sidePaneOverviewRef}
      className={`transcription-side-pane-overview ${hasSidePaneHost ? 'transcription-side-pane-overview-portaled' : ''}`}
      data-layer-pane-interactive="true"
    >
      {hasSidePaneHost ? (
        <>
          <section className="app-side-pane-group app-side-pane-layer-group" aria-label={messages.overviewLayerListAria}>
            <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
              <span className="app-side-pane-section-title">{messages.overviewLayerListTitle}</span>
            </div>
            <div className="app-side-pane-nav app-side-pane-layer-list">
              {renderSidePaneItems()}
            </div>
          </section>
          <section className="app-side-pane-group app-side-pane-layer-group" aria-label={messages.overviewCurrentLayerCardAria}>
            <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
              <span className="app-side-pane-section-title">{messages.overviewCurrentLayerTitle}</span>
            </div>
            <div className="app-side-pane-nav app-side-pane-layer-inspector-wrap">
              {renderFocusedLayerInspector()}
            </div>
          </section>
        </>
      ) : (
        <>
          {renderSidePaneItems()}
          {renderFocusedLayerInspector()}
        </>
      )}
    </div>
  );

  const sidePaneActionsNode = (
    <div
      className={`transcription-side-pane-actions ${hasSidePaneHost ? 'transcription-side-pane-actions-portaled' : ''}`}
      aria-label={messages.quickActionsAria}
      ref={layerActionRootRef}
      data-layer-pane-interactive="true"
    >
      <button
        type="button"
        className="transcription-side-pane-action-btn"
        onClick={() => {
          openCreateLayerPopover('create-transcription');
        }}
      >
        <span className="transcription-side-pane-action-icon" aria-hidden="true">✏️</span><strong>{messages.quickActionCreateTranscription}</strong>
      </button>
      <button
        type="button"
        className="transcription-side-pane-action-btn"
        disabled={disableCreateTranslationEntry}
        onClick={() => {
          openCreateLayerPopover('create-translation');
        }}
      >
        <span className="transcription-side-pane-action-icon" aria-hidden="true">🌐</span><strong>{messages.quickActionCreateTranslation}</strong>
      </button>
      <button
        type="button"
        className="transcription-side-pane-action-btn"
        disabled={constraintRepairBusy || sidePaneRows.length === 0}
        onClick={() => {
          fireAndForget(handleRepairLayerConstraints());
        }}
      >
        <span className="transcription-side-pane-action-icon" aria-hidden="true">🔧</span><strong>{constraintRepairBusy ? messages.quickActionRepairing : messages.quickActionRepair}</strong>
      </button>

      <div
        aria-label={messages.uiFontScaleAria}
        style={{
          border: '1px solid var(--border-soft)',
          borderRadius: 8,
          padding: '8px 10px',
          background: 'var(--surface-elevated)',
          display: 'grid',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.72rem' }}>
          <strong>{messages.uiFontScaleTitle}</strong>
          <span>{messages.uiFontScaleValue(uiFontScalePercent)} · {uiFontScaleModeLabel}</span>
        </div>
        <input
          type="range"
          min={85}
          max={140}
          step={5}
          value={uiFontScalePercent}
          aria-label={messages.uiFontScaleLabel}
          onChange={(event) => {
            onUiFontScaleChange?.(Number(event.target.value) / 100);
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={uiFontScaleMode === 'auto'}
            onClick={() => onUiFontScaleReset?.()}
          >
            {messages.uiFontScaleUseAuto}
          </button>
        </div>
      </div>

      {layerActionPanel === 'speaker-management' && renderSpeakerManagementPopover()}

      {layerActionPanel === 'delete' && (
        <SidePaneActionModal ariaLabel={messages.deleteLayerModalAria} closeLabel={messages.cancelButton} onClose={() => setLayerActionPanel(null)}>
          <select
            className="input transcription-side-pane-action-input"
            value={quickDeleteLayerId}
            onChange={(e) => setQuickDeleteLayerId(e.target.value)}
          >
            {deletableLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {formatSidePaneLayerLabel(layer)}
              </option>
            ))}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={quickDeleteKeepUtterances}
              onChange={(e) => setQuickDeleteKeepUtterances(e.target.checked)}
            />
            {messages.deleteKeepUtterances}
          </label>
          <div className="transcription-side-pane-action-row">
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
              {messages.deleteButton}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>{messages.cancelButton}</button>
          </div>
        </SidePaneActionModal>
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
          aria-label={messages.repairDetailsAria}
          style={{
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: '0.72rem',
            lineHeight: 1.45,
            color: 'var(--text-primary)',
            background: 'var(--surface-elevated)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>{messages.repairDetailsTitle}</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConstraintRepairDetailsCollapsed((prev) => !prev)}
              aria-label={constraintRepairDetailsCollapsed ? messages.repairDetailsExpandAria : messages.repairDetailsCollapseAria}
            >
              {constraintRepairDetailsCollapsed ? messages.repairDetailsExpand : messages.repairDetailsCollapse}
            </button>
          </div>
          {!constraintRepairDetailsCollapsed && groupedConstraintRepairDetails.map((group) => (
            <div
              key={`group-${group.layerId}`}
              style={{
                borderTop: '1px dashed var(--border-soft)',
                paddingTop: 6,
                marginTop: 6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{group.label}</div>
              {group.repairs.map((item, index) => (
                <div key={`repair-${item.layerId}-${item.code}-${index}`}>
                  [repaired][{item.code}] {item.message}
                </div>
              ))}
              {group.issues.map((item, index) => (
                <div key={`issue-${item.layerId}-${item.code}-${index}`}>
                  [pending][{item.code}] {item.message}
                </div>
              ))}
              {group.orderRepairs.map((item, index) => (
                <div key={`order-repair-${item.layerId}-${item.code}-${index}`}>
                  [order-repaired][{item.code}] {item.message}
                </div>
              ))}
              {group.orderIssues.map((item, index) => (
                <div key={`order-issue-${item.layerId}-${item.code}-${index}`}>
                  [order-pending][{item.code}] {item.message}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const sidePanePortaledNode = (
    <div className="transcription-side-pane-portaled-stack" data-layer-pane-interactive="true">
      {sidePaneOverviewNode}
      <section className="app-side-pane-group app-side-pane-layer-group app-side-pane-layer-actions-group" aria-label={messages.quickActionsCardAria}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{messages.quickActionsCardTitle}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-layer-actions-wrap">
          {sidePaneActionsNode}
        </div>
      </section>
    </div>
  );

  const sidePaneInlineFallbackNode = (
    <div
      className="transcription-side-pane"
      aria-label={messages.inlinePaneAria}
      data-layer-pane-interactive="true"
    >
      {sidePaneOverviewNode}
      {sidePaneActionsNode}
    </div>
  );

  useRegisterAppSidePane({
    title: messages.paneTitle,
    subtitle: messages.paneSubtitle,
    content: sidePanePortaledNode,
    enabled: sidePaneHost !== null,
  });

  return (
    <SidePaneLayerProvider deletableLayers={deletableLayers} checkLayerHasContent={checkLayerHasContent} deleteLayer={deleteLayer} deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}>
      {sidePaneHost ? null : sidePaneInlineFallbackNode}

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
    </SidePaneLayerProvider>
  );
}
