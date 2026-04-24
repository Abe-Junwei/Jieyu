import type { BuildReadyWorkspaceSidePanePropsInput } from './transcriptionReadyWorkspacePropsBuilders';

type SidePaneSpeakerActionScope = {
  selectedSpeakerUnitIdsForActionsSet: BuildReadyWorkspaceSidePanePropsInput['selectedUnitIds'];
  speakerVisualByTimelineUnitId: BuildReadyWorkspaceSidePanePropsInput['speakerVisualByUnitId'];
  speakerFilterOptionsForActions: BuildReadyWorkspaceSidePanePropsInput['speakerFilterOptions'];
};

type SidePaneSpeakerController = {
  handleAssignSpeakerToSelectedRouted: BuildReadyWorkspaceSidePanePropsInput['handleAssignSpeakerToSelectedRouted'];
  handleClearSpeakerOnSelectedRouted: BuildReadyWorkspaceSidePanePropsInput['handleClearSpeakerOnSelectedRouted'];
  speakerOptions: BuildReadyWorkspaceSidePanePropsInput['speakerOptions'];
  speakerDraftName: BuildReadyWorkspaceSidePanePropsInput['speakerDraftName'];
  setSpeakerDraftName: BuildReadyWorkspaceSidePanePropsInput['setSpeakerDraftName'];
  batchSpeakerId: BuildReadyWorkspaceSidePanePropsInput['batchSpeakerId'];
  setBatchSpeakerId: BuildReadyWorkspaceSidePanePropsInput['setBatchSpeakerId'];
  speakerSavingRouted: BuildReadyWorkspaceSidePanePropsInput['speakerSaving'];
  activeSpeakerFilterKey: BuildReadyWorkspaceSidePanePropsInput['activeSpeakerFilterKey'];
  setActiveSpeakerFilterKey: BuildReadyWorkspaceSidePanePropsInput['setActiveSpeakerFilterKey'];
  speakerDialogStateRouted: BuildReadyWorkspaceSidePanePropsInput['speakerDialogState'];
  speakerReferenceStats: BuildReadyWorkspaceSidePanePropsInput['speakerReferenceStats'];
  speakerReferenceUnassignedStats: BuildReadyWorkspaceSidePanePropsInput['speakerReferenceUnassignedStats'];
  speakerReferenceStatsMediaScoped: BuildReadyWorkspaceSidePanePropsInput['speakerReferenceStatsMediaScoped'];
  speakerReferenceStatsReady: BuildReadyWorkspaceSidePanePropsInput['speakerReferenceStatsReady'];
  selectedSpeakerSummaryForActions: BuildReadyWorkspaceSidePanePropsInput['selectedSpeakerSummary'];
  handleSelectSpeakerUnitsRouted: BuildReadyWorkspaceSidePanePropsInput['handleSelectSpeakerUnits'];
  handleClearSpeakerAssignmentsRouted: BuildReadyWorkspaceSidePanePropsInput['handleClearSpeakerAssignments'];
  handleExportSpeakerSegmentsRouted: BuildReadyWorkspaceSidePanePropsInput['handleExportSpeakerSegments'];
  handleRenameSpeaker: BuildReadyWorkspaceSidePanePropsInput['handleRenameSpeaker'];
  handleMergeSpeaker: BuildReadyWorkspaceSidePanePropsInput['handleMergeSpeaker'];
  handleDeleteSpeaker: BuildReadyWorkspaceSidePanePropsInput['handleDeleteSpeaker'];
  handleDeleteUnusedSpeakers: BuildReadyWorkspaceSidePanePropsInput['handleDeleteUnusedSpeakers'];
  handleCreateSpeakerAndAssignRouted: BuildReadyWorkspaceSidePanePropsInput['handleCreateSpeakerAndAssign'];
  handleCreateSpeakerOnly: BuildReadyWorkspaceSidePanePropsInput['handleCreateSpeakerOnly'];
  closeSpeakerDialogRouted: BuildReadyWorkspaceSidePanePropsInput['closeSpeakerDialog'];
  updateSpeakerDialogDraftNameRouted: BuildReadyWorkspaceSidePanePropsInput['updateSpeakerDialogDraftName'];
  updateSpeakerDialogTargetKeyRouted: BuildReadyWorkspaceSidePanePropsInput['updateSpeakerDialogTargetKey'];
  confirmSpeakerDialogRouted: BuildReadyWorkspaceSidePanePropsInput['confirmSpeakerDialog'];
};

type SidePaneCollaborationCloudPanelProps = NonNullable<BuildReadyWorkspaceSidePanePropsInput['collaborationCloudPanelProps']>;
type SidePaneCollaborationDirectory = NonNullable<SidePaneCollaborationCloudPanelProps['directory']>;

export type BuildReadyWorkspaceSidePanePropsInputFromControllers = {
  speakerActionScopeController: SidePaneSpeakerActionScope;
  speakerController: SidePaneSpeakerController;
  sidePaneRows: BuildReadyWorkspaceSidePanePropsInput['sidePaneRows'];
  focusedLayerRowId: BuildReadyWorkspaceSidePanePropsInput['focusedLayerRowId'];
  flashLayerRowId: BuildReadyWorkspaceSidePanePropsInput['flashLayerRowId'];
  onFocusLayer: BuildReadyWorkspaceSidePanePropsInput['onFocusLayer'];
  transcriptionLayers: BuildReadyWorkspaceSidePanePropsInput['transcriptionLayers'];
  layerLinks: BuildReadyWorkspaceSidePanePropsInput['layerLinks'];
  toggleLayerLink: BuildReadyWorkspaceSidePanePropsInput['toggleLayerLink'];
  deletableLayers: BuildReadyWorkspaceSidePanePropsInput['deletableLayers'];
  updateLayerMetadata: BuildReadyWorkspaceSidePanePropsInput['updateLayerMetadata'];
  layerCreateMessage: BuildReadyWorkspaceSidePanePropsInput['layerCreateMessage'];
  layerAction: BuildReadyWorkspaceSidePanePropsInput['layerAction'];
  defaultTranscriptionLayerId?: BuildReadyWorkspaceSidePanePropsInput['defaultTranscriptionLayerId'];
  segmentsByLayer: BuildReadyWorkspaceSidePanePropsInput['segmentsByLayer'];
  segmentContentByLayer: BuildReadyWorkspaceSidePanePropsInput['segmentContentByLayer'];
  unitsOnCurrentMedia: BuildReadyWorkspaceSidePanePropsInput['unitsOnCurrentMedia'];
  speakers: BuildReadyWorkspaceSidePanePropsInput['speakers'];
  listProjectAssets: SidePaneCollaborationCloudPanelProps['listProjectAssets'];
  removeProjectAsset: SidePaneCollaborationCloudPanelProps['removeProjectAsset'];
  getProjectAssetSignedUrl: SidePaneCollaborationCloudPanelProps['getProjectAssetSignedUrl'];
  listProjectSnapshots: SidePaneCollaborationCloudPanelProps['listProjectSnapshots'];
  restoreProjectSnapshotToLocalById: SidePaneCollaborationCloudPanelProps['restoreProjectSnapshotToLocalById'];
  queryProjectChangeTimeline: SidePaneCollaborationCloudPanelProps['queryProjectChangeTimeline'];
  supabaseConfigured: boolean;
  activeTextId?: string | null;
  listAccessibleCloudProjects: SidePaneCollaborationDirectory['listAccessibleProjects'];
  listCloudProjectMembers: SidePaneCollaborationDirectory['listProjectMembers'];
  getUnitTextForLayer: BuildReadyWorkspaceSidePanePropsInput['getUnitTextForLayer'];
  onSelectTimelineUnit: BuildReadyWorkspaceSidePanePropsInput['onSelectTimelineUnit'];
  onReorderLayers: BuildReadyWorkspaceSidePanePropsInput['onReorderLayers'];
  locale: BuildReadyWorkspaceSidePanePropsInput['locale'];
  verticalViewActive: BuildReadyWorkspaceSidePanePropsInput['verticalViewActive'];
  translationLayerCount: BuildReadyWorkspaceSidePanePropsInput['translationLayerCount'];
  onSelectWorkspaceHorizontalLayout: BuildReadyWorkspaceSidePanePropsInput['onSelectWorkspaceHorizontalLayout'];
  onSelectWorkspaceVerticalLayout: BuildReadyWorkspaceSidePanePropsInput['onSelectWorkspaceVerticalLayout'];
};

export function buildReadyWorkspaceSidePanePropsInput(
  input: BuildReadyWorkspaceSidePanePropsInputFromControllers,
): BuildReadyWorkspaceSidePanePropsInput {
  const collaborationCloudPanelProps: SidePaneCollaborationCloudPanelProps = {
    listProjectAssets: input.listProjectAssets,
    removeProjectAsset: input.removeProjectAsset,
    getProjectAssetSignedUrl: input.getProjectAssetSignedUrl,
    listProjectSnapshots: input.listProjectSnapshots,
    restoreProjectSnapshotToLocalById: input.restoreProjectSnapshotToLocalById,
    queryProjectChangeTimeline: input.queryProjectChangeTimeline,
    ...(input.supabaseConfigured && typeof input.activeTextId === 'string' && input.activeTextId.length > 0
      ? {
        directory: {
          workspaceProjectId: input.activeTextId,
          listAccessibleProjects: input.listAccessibleCloudProjects,
          listProjectMembers: input.listCloudProjectMembers,
        },
      }
      : {}),
  };

  return {
    selectedUnitIds: input.speakerActionScopeController.selectedSpeakerUnitIdsForActionsSet,
    handleAssignSpeakerToSelectedRouted: input.speakerController.handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted: input.speakerController.handleClearSpeakerOnSelectedRouted,
    speakerOptions: input.speakerController.speakerOptions,
    speakerDraftName: input.speakerController.speakerDraftName,
    setSpeakerDraftName: input.speakerController.setSpeakerDraftName,
    batchSpeakerId: input.speakerController.batchSpeakerId,
    setBatchSpeakerId: input.speakerController.setBatchSpeakerId,
    speakerSaving: input.speakerController.speakerSavingRouted,
    activeSpeakerFilterKey: input.speakerController.activeSpeakerFilterKey,
    setActiveSpeakerFilterKey: input.speakerController.setActiveSpeakerFilterKey,
    speakerDialogState: input.speakerController.speakerDialogStateRouted,
    speakerVisualByUnitId: input.speakerActionScopeController.speakerVisualByTimelineUnitId,
    speakerFilterOptions: input.speakerActionScopeController.speakerFilterOptionsForActions,
    speakerReferenceStats: input.speakerController.speakerReferenceStats,
    speakerReferenceUnassignedStats: input.speakerController.speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped: input.speakerController.speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady: input.speakerController.speakerReferenceStatsReady,
    selectedSpeakerSummary: input.speakerController.selectedSpeakerSummaryForActions,
    handleSelectSpeakerUnits: input.speakerController.handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignments: input.speakerController.handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegments: input.speakerController.handleExportSpeakerSegmentsRouted,
    handleRenameSpeaker: input.speakerController.handleRenameSpeaker,
    handleMergeSpeaker: input.speakerController.handleMergeSpeaker,
    handleDeleteSpeaker: input.speakerController.handleDeleteSpeaker,
    handleDeleteUnusedSpeakers: input.speakerController.handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelected: input.speakerController.handleAssignSpeakerToSelectedRouted,
    handleCreateSpeakerAndAssign: input.speakerController.handleCreateSpeakerAndAssignRouted,
    handleCreateSpeakerOnly: input.speakerController.handleCreateSpeakerOnly,
    closeSpeakerDialog: input.speakerController.closeSpeakerDialogRouted,
    updateSpeakerDialogDraftName: input.speakerController.updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKey: input.speakerController.updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialog: input.speakerController.confirmSpeakerDialogRouted,
    sidePaneRows: input.sidePaneRows,
    focusedLayerRowId: input.focusedLayerRowId,
    flashLayerRowId: input.flashLayerRowId,
    onFocusLayer: input.onFocusLayer,
    transcriptionLayers: input.transcriptionLayers,
    layerLinks: input.layerLinks,
    toggleLayerLink: input.toggleLayerLink,
    deletableLayers: input.deletableLayers,
    updateLayerMetadata: input.updateLayerMetadata,
    layerCreateMessage: input.layerCreateMessage,
    layerAction: input.layerAction,
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    speakers: input.speakers,
    collaborationCloudPanelProps,
    getUnitTextForLayer: input.getUnitTextForLayer,
    onSelectTimelineUnit: input.onSelectTimelineUnit,
    onReorderLayers: input.onReorderLayers,
    locale: input.locale,
    verticalViewActive: input.verticalViewActive,
    translationLayerCount: input.translationLayerCount,
    onSelectWorkspaceHorizontalLayout: input.onSelectWorkspaceHorizontalLayout,
    onSelectWorkspaceVerticalLayout: input.onSelectWorkspaceVerticalLayout,
  };
}
