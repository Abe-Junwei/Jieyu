import type { TranscriptionReadyWorkspaceOrchestratorRawInput } from './transcriptionReadyWorkspaceOrchestratorInput';
import type { BuildSharedLanePropsInput } from './transcriptionReadyWorkspacePropsBuilders';
import type { UseReadyWorkspaceViewModelsInput } from './useReadyWorkspaceViewModels';
import { mergeReadyWorkspaceOrchestratorRawInputSlices } from './readyWorkspaceOrchestratorRawInputSlices';
import {
  buildOrchestratorRawTimelineAnnotationCluster,
  type BuildOrchestratorRawTimelineAnnotationClusterInput,
} from './readyWorkspaceOrchestratorRawInputTimelineAnnotation';
import { packOrchestratorRawWorkspaceTailCluster } from './readyWorkspaceOrchestratorRawInputWorkspaceTail';
import type { TimelineReadModel } from './timelineReadModel';

type Raw = Omit<TranscriptionReadyWorkspaceOrchestratorRawInput, 'sharedLaneProps'>;

export type ReadyWorkspaceOrchestratorRawHeadSlice = Pick<
  Raw,
  | 'selectedMediaUrl'
  | 'player'
  | 'layers'
  | 'locale'
  | 'importFileRef'
  | 'layerAction'
  | 'timelineViewportProjection'
>;

export type ReadyWorkspaceOrchestratorRawWorkspaceTailFields = Pick<
  Raw,
  | 'selectedTimelineMedia'
  | 'waveformDisplayMode'
  | 'setWaveformDisplayMode'
  | 'waveformVisualStyle'
  | 'setWaveformVisualStyle'
  | 'acousticOverlayMode'
  | 'setAcousticOverlayMode'
  | 'globalLoopPlayback'
  | 'setGlobalLoopPlayback'
  | 'handleGlobalPlayPauseAction'
  | 'canUndo'
  | 'canRedo'
  | 'undoLabel'
  | 'activeTextId'
  | 'selectedTimelineUnit'
  | 'notePopover'
  | 'showExportMenu'
  | 'exportMenuRef'
  | 'loadSnapshot'
  | 'undo'
  | 'redo'
  | 'setShowProjectSetup'
  | 'setShowAudioImport'
  | 'handleDeleteCurrentAudio'
  | 'handleDeleteCurrentProject'
  | 'toggleNotes'
  | 'setUttOpsMenu'
  | 'handleAutoSegment'
  | 'autoSegmentBusy'
  | 'setShowExportMenu'
  | 'handleExportEaf'
  | 'handleExportTextGrid'
  | 'handleExportTrs'
  | 'handleExportFlextext'
  | 'handleExportToolbox'
  | 'handleExportJyt'
  | 'handleExportJym'
  | 'handleImportFile'
  | 'unitsOnCurrentMedia'
  | 'isTimelineLaneHeaderCollapsed'
  | 'toggleTimelineLaneHeader'
  | 'waveCanvasRef'
  | 'showSearch'
  | 'searchableItems'
  | 'displayStyleControl'
  | 'activeLayerIdForEdits'
  | 'activeTimelineUnitId'
  | 'searchOverlayRequest'
  | 'manualSelectTsRef'
  | 'selectUnit'
  | 'handleSearchReplace'
  | 'setShowSearch'
  | 'setSearchOverlayRequest'
  | 'isAiPanelCollapsed'
  | 'hubSidebarTab'
  | 'setHubSidebarTab'
  | 'assistantRuntimeProps'
  | 'analysisRuntimeProps'
  | 'selectedAiWarning'
  | 'selectedTranslationGapCount'
  | 'aiSidebarError'
  | 'speakerDialogStateRouted'
  | 'speakerSavingRouted'
  | 'closeSpeakerDialogRouted'
  | 'confirmSpeakerDialogRouted'
  | 'updateSpeakerDialogDraftNameRouted'
  | 'updateSpeakerDialogTargetKeyRouted'
  | 'showProjectSetup'
  | 'handleProjectSetupSubmit'
  | 'showAudioImport'
  | 'handleAudioImport'
  | 'audioImportDisposition'
  | 'mediaFileInputRef'
  | 'handleDirectMediaImport'
  | 'audioDeleteConfirm'
  | 'setAudioDeleteConfirm'
  | 'handleConfirmAudioDelete'
  | 'projectDeleteConfirm'
  | 'setProjectDeleteConfirm'
  | 'handleConfirmProjectDelete'
  | 'showShortcuts'
  | 'closeShortcuts'
  | 'isFocusMode'
  | 'exitFocusMode'
>;

export type BuildReadyWorkspaceViewModelsInputArgs = {
  lane: BuildSharedLanePropsInput;
  head: ReadyWorkspaceOrchestratorRawHeadSlice;
  timelineReadModel: TimelineReadModel;
  segmentRangeGesturePreviewReadModel: Raw['segmentRangeGesturePreviewReadModel'];
  annotation: BuildOrchestratorRawTimelineAnnotationClusterInput;
  tail: ReadyWorkspaceOrchestratorRawWorkspaceTailFields;
};

/**
 * 将 ReadyWorkspace 内分散的 lane / 编排 raw 依赖收敛为 `useReadyWorkspaceViewModels` 单入参，降低主文件行数热点。
 */
export function buildReadyWorkspaceViewModelsInput(
  args: BuildReadyWorkspaceViewModelsInputArgs,
): UseReadyWorkspaceViewModelsInput {
  const { lane, head, timelineReadModel, segmentRangeGesturePreviewReadModel, annotation, tail } = args;
  return {
    lanePropsInput: lane,
    orchestratorRawInput: mergeReadyWorkspaceOrchestratorRawInputSlices(
      {
        selectedMediaUrl: head.selectedMediaUrl,
        playableAcoustic: timelineReadModel.acoustic.globalState === 'playable',
        timelineExtentSec: timelineReadModel.timeline.extentSec,
        player: head.player,
        layers: head.layers,
        locale: head.locale,
        importFileRef: head.importFileRef,
        layerAction: head.layerAction,
        timelineViewportProjection: head.timelineViewportProjection,
      },
      { segmentRangeGesturePreviewReadModel },
      {
        ...buildOrchestratorRawTimelineAnnotationCluster(annotation),
        ...packOrchestratorRawWorkspaceTailCluster(tail),
      },
    ),
  };
}
