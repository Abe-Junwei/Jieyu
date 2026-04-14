import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { LayerDocType } from '../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { formatSidePaneLayerLabel } from '../utils/transcriptionFormatters';
import { ContextMenu } from './ContextMenu';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { LayerActionPopover } from './LayerActionPopover';
import { SidePaneSidebarOverview } from './SidePaneSidebarOverview';
import { TranscriptionLeftRailLayerActions } from './transcription/TranscriptionLeftRailLayerActions';
import { SidePaneSidebarActions } from './SidePaneSidebarActions';
import { buildSidePaneSidebarContextMenuItems } from './SidePaneSidebar.contextMenu';
import { useSidePaneSidebarConstraintRepair } from './SidePaneSidebar.constraintRepair';
import { useAppSidePaneHostOptional, useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { useSpeakerRailContext } from '../contexts/SpeakerRailContext';
import { SidePaneLayerProvider } from '../contexts/SidePaneContext';
import { useLocale } from '../i18n';
import { getSidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { useSidePaneSidebarDrag } from '../hooks/useSidePaneSidebarDrag';
import {
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import {
  buildLayerBundles,
} from '../services/LayerOrderingService';
import { isTranscriptionWorkspacePathname } from '../utils/transcriptionWorkspaceRoute';

type LayerActionResult = ReturnType<typeof useLayerActionPanel>;

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
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
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
  defaultLanguageId,
  defaultOrthographyId,
  onReorderLayers,
}: SidePaneSidebarProps) {
  const location = useLocation();
  const showLeftRailLayerActions = isTranscriptionWorkspacePathname(location.pathname);
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

  const sidePaneHost = useAppSidePaneHostOptional();
  const hasSidePaneHost = sidePaneHost !== null;
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
  const {
    sidePaneOverviewRef,
    dragState,
    dropTargetIndex,
    handleDragStart,
    resolveTargetBundleRange,
  } = useSidePaneSidebarDrag({
    sidePaneRows,
    bundleBoundaryIndexes,
    bundleRootIds,
    bundleRanges,
    onReorderLayers,
  });
  const disableCreateTranslationEntry = transcriptionLayers.length === 0;
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
  const {
    constraintRepairBusy,
    constraintRepairMessage,
    constraintRepairDetails,
    constraintRepairDetailsCollapsed,
    groupedConstraintRepairDetails,
    setConstraintRepairDetailsCollapsed,
    handleRepairLayerConstraints,
  } = useSidePaneSidebarConstraintRepair({
    messages,
    sidePaneRows,
    layerLabelById,
  });

  const contextMenuItems = useMemo(() => buildSidePaneSidebarContextMenuItems({
    layerId: contextMenu?.layerId ?? null,
    messages,
    deletableLayers,
    requestDeleteLayer,
  }), [
    contextMenu?.layerId,
    deletableLayers,
    messages,
    requestDeleteLayer,
  ]);

  // 键盘拖拽：Arrow Up/Down 直接提交重排 | Keyboard reorder: commit on each arrow press
  const handleKeyboardReorder = useCallback((layerId: string, currentIndex: number, direction: 'up' | 'down') => {
    if (dragState) return; // 鼠标拖拽进行中时忽略键盘 | Ignore while mouse drag is active
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sidePaneRows.length) return;
    fireAndForget(onReorderLayers(layerId, targetIndex));
  }, [dragState, sidePaneRows.length, onReorderLayers]);

  const sidePaneOverviewNode = useMemo(() => (
    <SidePaneSidebarOverview
      sidePaneOverviewRef={sidePaneOverviewRef}
      hasSidePaneHost={hasSidePaneHost}
      messages={messages}
      sidePaneRows={sidePaneRows}
      dragState={dragState}
      dropTargetIndex={dropTargetIndex}
      focusedLayerRowId={focusedLayerRowId}
      flashLayerRowId={flashLayerRowId}
      bundleRootIds={bundleRootIds}
      bundleBoundaryIndexes={bundleBoundaryIndexes}
      layerLabelById={layerLabelById}
      deletableLayers={deletableLayers}
      focusedLayer={focusedLayer}
      focusedLayerParentKey={focusedLayerParentKey}
      independentRootLayers={independentRootLayers}
      resolveTargetBundleRange={resolveTargetBundleRange}
      onFocusLayer={onFocusLayer}
      onContextMenu={handleLayerContextMenu}
      onMouseDown={handleDragStart}
      onKeyboardReorder={handleKeyboardReorder}
      onOpenDeletePanel={openDeletePanelForLayer}
      onChangeLayerParent={handleChangeLayerParent}
    />
  ), [
    sidePaneOverviewRef,
    hasSidePaneHost,
    messages,
    sidePaneRows,
    dragState,
    dropTargetIndex,
    focusedLayerRowId,
    flashLayerRowId,
    bundleRootIds,
    bundleBoundaryIndexes,
    layerLabelById,
    deletableLayers,
    focusedLayer,
    focusedLayerParentKey,
    independentRootLayers,
    resolveTargetBundleRange,
    onFocusLayer,
    handleLayerContextMenu,
    handleDragStart,
    handleKeyboardReorder,
    openDeletePanelForLayer,
    handleChangeLayerParent,
  ]);

  const sidePaneActionsNode = useMemo(() => (
    <SidePaneSidebarActions
      hasSidePaneHost={hasSidePaneHost}
      messages={messages}
      layerActionRootRef={layerActionRootRef}
      constraintRepairBusy={constraintRepairBusy}
      sidePaneRowsLength={sidePaneRows.length}
      layerActionPanel={layerActionPanel}
      quickDeleteLayerId={quickDeleteLayerId}
      quickDeleteKeepUtterances={quickDeleteKeepUtterances}
      deletableLayers={deletableLayers}
      layerCreateMessage={layerCreateMessage}
      constraintRepairMessage={constraintRepairMessage}
      constraintRepairDetails={constraintRepairDetails}
      constraintRepairDetailsCollapsed={constraintRepairDetailsCollapsed}
      groupedConstraintRepairDetails={groupedConstraintRepairDetails}
      speakerCtx={speakerCtx}
      onRunRepair={handleRepairLayerConstraints}
      setLayerActionPanel={setLayerActionPanel}
      setQuickDeleteLayerId={setQuickDeleteLayerId}
      setQuickDeleteKeepUtterances={setQuickDeleteKeepUtterances}
      requestDeleteLayer={requestDeleteLayer}
      setConstraintRepairDetailsCollapsed={setConstraintRepairDetailsCollapsed}
    />
  ), [
    hasSidePaneHost,
    messages,
    layerActionRootRef,
    constraintRepairBusy,
    sidePaneRows.length,
    layerActionPanel,
    quickDeleteLayerId,
    quickDeleteKeepUtterances,
    deletableLayers,
    layerCreateMessage,
    constraintRepairMessage,
    constraintRepairDetails,
    constraintRepairDetailsCollapsed,
    groupedConstraintRepairDetails,
    speakerCtx,
    handleRepairLayerConstraints,
    setLayerActionPanel,
    setQuickDeleteLayerId,
    setQuickDeleteKeepUtterances,
    requestDeleteLayer,
    setConstraintRepairDetailsCollapsed,
  ]);

  const sidePanePortaledNode = useMemo(() => (
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
  ), [messages.quickActionsCardAria, messages.quickActionsCardTitle, sidePaneActionsNode, sidePaneOverviewNode]);

  const sidePaneInlineFallbackNode = useMemo(() => (
    <div
      className="transcription-side-pane"
      aria-label={messages.inlinePaneAria}
      data-layer-pane-interactive="true"
    >
      {sidePaneOverviewNode}
      {sidePaneActionsNode}
    </div>
  ), [messages.inlinePaneAria, sidePaneActionsNode, sidePaneOverviewNode]);

  useRegisterAppSidePane({
    title: messages.paneTitle,
    subtitle: messages.paneSubtitle,
    content: sidePanePortaledNode,
    enabled: sidePaneHost !== null,
  });

  return (
    <SidePaneLayerProvider deletableLayers={deletableLayers} checkLayerHasContent={checkLayerHasContent} deleteLayer={deleteLayer} deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}>
      {showLeftRailLayerActions ? (
        <TranscriptionLeftRailLayerActions
          messages={messages}
          disableCreateTranslationEntry={disableCreateTranslationEntry}
          onCreateTranscription={() => openCreateLayerPopover('create-transcription')}
          onCreateTranslation={() => openCreateLayerPopover('create-translation')}
        />
      ) : null}
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
            ...(input.orthographyId !== undefined ? { orthographyId: input.orthographyId } : {}),
            ...(input.alias !== undefined ? { alias: input.alias } : {}),
            ...(input.constraint !== undefined ? { constraint: input.constraint } : {}),
            ...(input.parentLayerId !== undefined ? { parentLayerId: input.parentLayerId } : {}),
          }, modality)}
          {...(defaultLanguageId !== undefined ? { defaultLanguageId } : {})}
          {...(defaultOrthographyId !== undefined ? { defaultOrthographyId } : {})}
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
