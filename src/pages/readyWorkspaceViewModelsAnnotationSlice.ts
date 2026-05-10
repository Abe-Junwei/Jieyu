import type { BuildOrchestratorRawTimelineAnnotationClusterInput } from './readyWorkspaceOrchestratorRawInputTimelineAnnotation';

export type ReadyWorkspaceViewModelsAnnotationSliceInput = {
  activeTextTimeMapping: BuildOrchestratorRawTimelineAnnotationClusterInput['activeTextTimeMapping'];
  defaultTranscriptionLayerId: BuildOrchestratorRawTimelineAnnotationClusterInput['defaultTranscriptionLayerId'];
  createUnitFromSelectionRouted: NonNullable<
    BuildOrchestratorRawTimelineAnnotationClusterInput['createUnitFromSelectionRouted']
  >;
  handleNoteClick: BuildOrchestratorRawTimelineAnnotationClusterInput['handleNoteClick'];
  resolveNoteIndicatorTarget: BuildOrchestratorRawTimelineAnnotationClusterInput['resolveNoteIndicatorTarget'];
  tierContainerRef: BuildOrchestratorRawTimelineAnnotationClusterInput['tierContainerRef'];
  verticalPaneFocus: NonNullable<
    BuildOrchestratorRawTimelineAnnotationClusterInput['verticalPaneFocus']
  >;
  updateVerticalPaneFocus: NonNullable<
    BuildOrchestratorRawTimelineAnnotationClusterInput['updateVerticalPaneFocus']
  >;
  verticalViewActive: boolean;
  startTimelineResizeDrag: BuildOrchestratorRawTimelineAnnotationClusterInput['startTimelineResizeDrag'];
  navigateUnitFromInput: BuildOrchestratorRawTimelineAnnotationClusterInput['navigateUnitFromInput'];
  annotationController: Pick<
    BuildOrchestratorRawTimelineAnnotationClusterInput,
    'renderAnnotationItem' | 'handleAnnotationClick' | 'handleAnnotationContextMenu'
  >;
  trackDisplayController: Pick<
    BuildOrchestratorRawTimelineAnnotationClusterInput,
    'speakerSortKeyById'
  >;
  timelineController: Pick<
    BuildOrchestratorRawTimelineAnnotationClusterInput,
    'timelineRenderUnits' | 'filteredUnitsOnCurrentMedia'
  >;
  speakerActionScopeController: Pick<
    BuildOrchestratorRawTimelineAnnotationClusterInput,
    'speakerVisualByTimelineUnitId'
  >;
  selfCertaintyController: Pick<
    BuildOrchestratorRawTimelineAnnotationClusterInput,
    'resolveSelfCertaintyForUnit' | 'resolveSelfCertaintyAmbiguityForUnit'
  >;
};

/** Builds the timeline annotation cluster for `buildReadyWorkspaceViewModelsInput` (ReadyWorkspace orchestration). */
export function buildReadyWorkspaceViewModelsAnnotationSlice(
  input: ReadyWorkspaceViewModelsAnnotationSliceInput,
): BuildOrchestratorRawTimelineAnnotationClusterInput {
  return {
    activeTextTimeMapping: input.activeTextTimeMapping ?? null,
    timelineRenderUnits: input.timelineController.timelineRenderUnits,
    defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
    createUnitFromSelectionRouted: input.createUnitFromSelectionRouted,
    renderAnnotationItem: input.annotationController.renderAnnotationItem,
    speakerSortKeyById: input.trackDisplayController.speakerSortKeyById,
    filteredUnitsOnCurrentMedia: input.timelineController.filteredUnitsOnCurrentMedia,
    tierContainerRef: input.tierContainerRef,
    handleAnnotationClick: input.annotationController.handleAnnotationClick,
    handleAnnotationContextMenu: input.annotationController.handleAnnotationContextMenu,
    handleNoteClick: input.handleNoteClick,
    resolveNoteIndicatorTarget: input.resolveNoteIndicatorTarget,
    startTimelineResizeDrag: input.startTimelineResizeDrag,
    navigateUnitFromInput: input.navigateUnitFromInput,
    speakerVisualByTimelineUnitId: input.speakerActionScopeController.speakerVisualByTimelineUnitId,
    resolveSelfCertaintyForUnit: input.selfCertaintyController.resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit:
      input.selfCertaintyController.resolveSelfCertaintyAmbiguityForUnit,
    verticalViewEnabled: input.verticalViewActive,
    verticalPaneFocus: input.verticalPaneFocus,
    updateVerticalPaneFocus: input.updateVerticalPaneFocus,
  };
}
