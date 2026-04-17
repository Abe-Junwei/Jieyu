import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType, SpeakerDocType } from '../db';
import type { CollaborationPresenceLiveMember } from '../collaboration/cloud/CollaborationPresenceService';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { formatSidePaneLayerLabel, getLayerHeaderLanguageName } from '../utils/transcriptionFormatters';
import { ContextMenu } from './ContextMenu';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { LayerActionPopover } from './LayerActionPopover';
import { SidePaneSidebarOverview } from './SidePaneSidebarOverview';
import { CollaborationCloudPanel } from './transcription/CollaborationCloudPanel';
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
import { buildLayerBundles } from '../services/LayerOrderingService';
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
  updateLayerMetadata?: (layerId: string, input: { dialect?: string; vernacular?: string; alias?: string }) => Promise<boolean>;
  layerCreateMessage: string;
  layerAction: LayerActionResult;
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  defaultTranscriptionLayerId?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  unitsOnCurrentMedia?: LayerUnitDocType[];
  speakers?: SpeakerDocType[];
  presenceMembers?: CollaborationPresenceLiveMember[];
  presenceCurrentUserId?: string;
  collaborationCloudPanelProps?: React.ComponentProps<typeof CollaborationCloudPanel>;
  getUnitTextForLayer?: (unit: LayerUnitDocType, layerId?: string) => string;
  onSelectTimelineUnit?: (unit: TimelineUnit) => void;
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
  updateLayerMetadata,
  layerCreateMessage,
  layerAction,
  defaultLanguageId,
  defaultOrthographyId,
  defaultTranscriptionLayerId,
  segmentsByLayer,
  segmentContentByLayer,
  unitsOnCurrentMedia,
  speakers,
  presenceMembers,
  presenceCurrentUserId,
  collaborationCloudPanelProps,
  getUnitTextForLayer,
  onSelectTimelineUnit,
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
    quickDeleteKeepUnits, setQuickDeleteKeepUnits,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = layerAction;

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [createLayerPopoverAction, setCreateLayerPopoverAction] = useState<{
    action: 'create-transcription' | 'create-translation' | 'edit-transcription-metadata' | 'edit-translation-metadata';
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
    deleteConfirmKeepUnits,
    setDeleteConfirmKeepUnits,
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

  const openMetadataLayerPopover = useCallback((layerId: string) => {
    if (!updateLayerMetadata) return;
    const layer = sidePaneRows.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    setLayerActionPanel(null);
    setCreateLayerPopoverAction({
      action: layer.layerType === 'translation' ? 'edit-translation-metadata' : 'edit-transcription-metadata',
      layerId,
    });
  }, [setLayerActionPanel, sidePaneRows, updateLayerMetadata]);

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
  const layerLabelById = useMemo(
    () => new Map(sidePaneRows.map((layer) => [layer.id, formatSidePaneLayerLabel(layer)] as const)),
    [sidePaneRows],
  );
  const layerLanguageNameById = useMemo(
    () => new Map(sidePaneRows.map((layer) => [layer.id, getLayerHeaderLanguageName(layer, locale)] as const)),
    [locale, sidePaneRows],
  );
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
    allLayers: sidePaneRows,
    deletableLayers,
    canOpenLayerMetadata: Boolean(updateLayerMetadata),
    requestOpenLayerMetadata: openMetadataLayerPopover,
    requestDeleteLayer,
  }), [
    contextMenu?.layerId,
    deletableLayers,
    messages,
    sidePaneRows,
    updateLayerMetadata,
    openMetadataLayerPopover,
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
      layerLanguageNameById={layerLanguageNameById}
      resolveTargetBundleRange={resolveTargetBundleRange}
      {...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {})}
      {...(segmentsByLayer !== undefined ? { segmentsByLayer } : {})}
      {...(segmentContentByLayer !== undefined ? { segmentContentByLayer } : {})}
      {...(unitsOnCurrentMedia !== undefined ? { unitsOnCurrentMedia } : {})}
      {...(speakers !== undefined ? { speakers } : {})}
      {...(getUnitTextForLayer !== undefined ? { getUnitTextForLayer } : {})}
      {...(onSelectTimelineUnit !== undefined ? { onSelectTimelineUnit } : {})}
      onFocusLayer={onFocusLayer}
      onContextMenu={handleLayerContextMenu}
      onMouseDown={handleDragStart}
      onKeyboardReorder={handleKeyboardReorder}
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
    layerLanguageNameById,
    resolveTargetBundleRange,
    defaultTranscriptionLayerId,
    segmentsByLayer,
    segmentContentByLayer,
    unitsOnCurrentMedia,
    speakers,
    getUnitTextForLayer,
    onSelectTimelineUnit,
    onFocusLayer,
    handleLayerContextMenu,
    handleDragStart,
    handleKeyboardReorder,
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
      quickDeleteKeepUnits={quickDeleteKeepUnits}
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
      setQuickDeleteKeepUnits={setQuickDeleteKeepUnits}
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
    quickDeleteKeepUnits,
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
    setQuickDeleteKeepUnits,
    requestDeleteLayer,
    setConstraintRepairDetailsCollapsed,
  ]);

  const visiblePresenceMembers = useMemo(() => {
    const members = (presenceMembers ?? []).filter((member) => member.state !== 'offline');
    return members.slice().sort((left, right) => {
      const leftTimestamp = left.lastSeenAt ? Date.parse(left.lastSeenAt) : 0;
      const rightTimestamp = right.lastSeenAt ? Date.parse(right.lastSeenAt) : 0;
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return left.userId.localeCompare(right.userId);
    });
  }, [presenceMembers]);

  const sidePanePresenceNode = useMemo(() => (
    <section className="app-side-pane-group app-side-pane-layer-group app-side-pane-presence-group" aria-label={messages.presenceCardAria}>
      <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
        <span className="app-side-pane-section-title">{messages.presenceCardTitle}</span>
      </div>
      <div className="app-side-pane-nav app-side-pane-presence-wrap">
        {visiblePresenceMembers.length === 0 ? (
          <p className="transcription-side-pane-presence-empty">{messages.presenceEmpty}</p>
        ) : (
          <ul className="transcription-side-pane-presence-list">
            {visiblePresenceMembers.map((member) => {
              const displayName = member.displayName?.trim() || member.userId;
              const isCurrentUser = Boolean(presenceCurrentUserId) && member.userId === presenceCurrentUserId;
              const focusHint = member.focusedEntityType && member.focusedEntityId
                ? messages.presenceFocusLabel(messages.presenceEntityLabel(member.focusedEntityType), member.focusedEntityId)
                : '';

              return (
                <li key={member.userId} className="transcription-side-pane-presence-item">
                  <div className="transcription-side-pane-presence-item-header">
                    <span className="transcription-side-pane-presence-name">
                      {displayName}
                      {isCurrentUser ? ` ${messages.presenceSelfSuffix}` : ''}
                    </span>
                    <span className={`transcription-side-pane-presence-state transcription-side-pane-presence-state-${member.state}`}>
                      {messages.presenceStateLabel(member.state)}
                    </span>
                  </div>
                  {focusHint ? (
                    <div className="transcription-side-pane-presence-focus">
                      {focusHint}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  ), [messages, presenceCurrentUserId, visiblePresenceMembers]);

  const sidePaneCollaborationNode = useMemo(() => (
    collaborationCloudPanelProps ? <CollaborationCloudPanel {...collaborationCloudPanelProps} /> : null
  ), [collaborationCloudPanelProps]);

  const sidePanePortaledNode = useMemo(() => (
    <div className="transcription-side-pane-portaled-stack" data-layer-pane-interactive="true">
      {sidePaneOverviewNode}
      {sidePanePresenceNode}
      {sidePaneCollaborationNode}
      <section className="app-side-pane-group app-side-pane-layer-group app-side-pane-layer-actions-group" aria-label={messages.quickActionsCardAria}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{messages.quickActionsCardTitle}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-layer-actions-wrap">
          {sidePaneActionsNode}
        </div>
      </section>
    </div>
  ), [messages.quickActionsCardAria, messages.quickActionsCardTitle, sidePaneActionsNode, sidePaneCollaborationNode, sidePaneOverviewNode, sidePanePresenceNode]);

  const sidePaneInlineFallbackNode = useMemo(() => (
    <div
      className="transcription-side-pane"
      aria-label={messages.inlinePaneAria}
      data-layer-pane-interactive="true"
    >
      {sidePaneOverviewNode}
      {sidePanePresenceNode}
      {sidePaneCollaborationNode}
      {sidePaneActionsNode}
    </div>
  ), [messages.inlinePaneAria, sidePaneActionsNode, sidePaneCollaborationNode, sidePaneOverviewNode, sidePanePresenceNode]);

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
          {...(updateLayerMetadata ? { updateLayerMetadata } : {})}
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
        keepUnits={deleteConfirmKeepUnits}
        onKeepUnitsChange={setDeleteConfirmKeepUnits}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => { fireAndForget(confirmDeleteLayer()); }}
      />
    </SidePaneLayerProvider>
  );
}
