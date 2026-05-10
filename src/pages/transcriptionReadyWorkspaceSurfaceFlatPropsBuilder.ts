import type { UseReadyWorkspaceSurfacePropsInput } from './useReadyWorkspaceSurfaceProps';

export type ReadyWorkspaceSurfaceFlatLayeredContext = {
  shell: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'locale'
    | 'activeTextId'
    | 'selectedTimelineMedia'
    | 'selectedMediaUrl'
    | 'segmentScopeMediaId'
    | 'verticalViewActive'
    | 'activeTextTimelineMode'
    | 'activeTextTimeMapping'
  >;
  undo: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'canUndo'
    | 'canRedo'
    | 'undoLabel'
    | 'undoHistory'
    | 'showUndoHistory'
    | 'setShowUndoHistory'
    | 'redo'
    | 'selectedTimelineUnit'
    | 'activeTimelineUnitId'
    | 'recordTimelineEdit'
    | 'undoToHistoryIndex'
    | 'setShowProjectSetup'
    | 'setShowAudioImport'
    | 'applyTextTimeMapping'
  >;
  selectionZoom: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'selectedUnitIds'
    | 'batchPreviewTextPropsByLayerId'
    | 'showBatchOperationPanel'
    | 'setShowBatchOperationPanel'
    | 'selectedWaveformRegionId'
    | 'waveformTimelineItems'
    | 'zoomToPercent'
    | 'zoomToUnit'
    | 'snapEnabled'
    | 'autoScrollEnabled'
    | 'setSnapEnabled'
    | 'setAutoScrollEnabled'
  >;
  workspaceChrome: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'setIsAiPanelCollapsed'
    | 'handleAiPanelToggle'
    | 'handleAiPanelResizeStart'
    | 'handleLassoPointerDown'
    | 'handleLassoPointerMove'
    | 'handleLassoPointerUp'
    | 'handleTimelineScroll'
    | 'recoveryAvailable'
    | 'recoveryDiffSummary'
    | 'applyRecoveryBanner'
    | 'dismissRecoveryBanner'
    | 'toolbarPropsWithCollaboration'
    | 'observerResult'
    | 'actionableObserverRecommendations'
    | 'handleExecuteObserverRecommendation'
    | 'deferredAiRuntime'
    | 'vadCacheStatus'
    | 'collaborationProtocolGuard'
    | 'assistantBridgeControllerInput'
    | 'handleDeferredAiRuntimeChange'
    | 'selectUnit'
    | 'formatTime'
  >;
  layerProject: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'defaultTranscriptionLayerId'
    | 'translationLayers'
    | 'orderedLayers'
    | 'handleFocusLayerRow'
    | 'layerLinks'
    | 'toggleLayerLink'
    | 'deletableLayers'
    | 'updateLayerMetadata'
    | 'layerCreateMessage'
    | 'layerAction'
    | 'segmentsByLayer'
    | 'segmentContentByLayer'
    | 'unitsOnCurrentMedia'
    | 'speakers'
    | 'listProjectAssets'
    | 'removeProjectAsset'
    | 'getProjectAssetSignedUrl'
    | 'listProjectSnapshots'
    | 'restoreProjectSnapshotToLocalById'
    | 'queryProjectChangeTimeline'
    | 'listAccessibleCloudProjects'
    | 'listCloudProjectMembers'
    | 'getUnitTextForLayer'
    | 'selectTimelineUnit'
    | 'reorderLayers'
    | 'onSelectWorkspaceHorizontalLayout'
    | 'onSelectWorkspaceVerticalLayout'
  >;
  notesMenus: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'units'
    | 'notePopover'
    | 'setNotePopover'
    | 'currentNotes'
    | 'addNote'
    | 'updateNote'
    | 'deleteNote'
    | 'ctxMenu'
    | 'setCtxMenu'
    | 'uttOpsMenu'
    | 'setUttOpsMenu'
    | 'runOverlayDeleteSelection'
    | 'runOverlayMergeSelection'
    | 'runSelectBefore'
    | 'runSelectAfter'
    | 'runOverlayDeleteOne'
    | 'runOverlayMergePrev'
    | 'runOverlayMergeNext'
    | 'runOverlaySplitAtTime'
    | 'deleteConfirmState'
    | 'muteDeleteConfirmInSession'
    | 'setMuteDeleteConfirmInSession'
    | 'closeDeleteConfirmDialog'
    | 'confirmDeleteFromDialog'
  >;
  stageMedia: Pick<
    UseReadyWorkspaceSurfacePropsInput,
    | 'displayStyleControl'
    | 'toggleSkipProcessingRouted'
    | 'player'
    | 'timelineViewportProjection'
    | 'waveformAcousticRuntimeStatus'
    | 'waveformVadCacheStatus'
    | 'assistantSidebarController'
    | 'assistantController'
    | 'readyWorkspaceViewModels'
    | 'readyWorkspaceRenderController'
    | 'readyWorkspaceAxisStatusController'
    | 'workspacePanelEffectsController'
    | 'timelineResizeController'
  >;
  layerRowFocus: {
    focusedLayerRowId?: string | null;
    flashLayerRowId?: string | null;
  };
};

export function buildReadyWorkspaceSurfaceFlatPropsFromLayeredContext(
  ctx: ReadyWorkspaceSurfaceFlatLayeredContext,
): Omit<UseReadyWorkspaceSurfacePropsInput, 'layout' | 'waveform' | 'overlays' | 'controllers'> &
  Pick<UseReadyWorkspaceSurfacePropsInput, 'focusedLayerRowId' | 'flashLayerRowId'> {
  return {
    ...ctx.shell,
    ...ctx.undo,
    ...ctx.selectionZoom,
    ...ctx.workspaceChrome,
    ...ctx.layerProject,
    ...ctx.notesMenus,
    ...ctx.stageMedia,
    focusedLayerRowId: ctx.layerRowFocus.focusedLayerRowId ?? null,
    flashLayerRowId: ctx.layerRowFocus.flashLayerRowId ?? null,
  };
}
