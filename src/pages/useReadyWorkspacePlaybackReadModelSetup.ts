import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useTranscriptionActionRefBindings } from './useTranscriptionActionRefBindings';
import { useTranscriptionPlaybackKeyboardController } from './useTranscriptionPlaybackKeyboardController';
import { useTimelineReadModel } from './timelineReadModel';

export interface UseReadyWorkspacePlaybackReadModelSetupParams {
  data: any;
  player: any;
  waveformBridge: any;
  selectedTimelineOwnerUnit: any;
  selectedTimelineUnitForTime: any;
  selectedTimelineUnit: any;
  selectedUnitIds: any;
  selectedMediaUrl: any;
  createUnitFromSelectionRouted: any;
  runDeleteSelection: any;
  runMergePrev: any;
  runMergeNext: any;
  runSplitAtTime: any;
  runSelectBefore: any;
  runSelectAfter: any;
  timelineUnitViewIndex: any;
  activeTextTimelineMode: any;
  documentSpanSec: number;
  zoomPxPerSec: any;
  fitPxPerSec: any;
  verticalViewActive: boolean;
  executeActionRef: any;
  openSearchRef: any;
  seekToTimeRef: any;
  splitAtTimeRef: any;
  zoomToSegmentRef: any;
  timelineSyncController: any;
  activeLayerIdForEdits: any;
}

export function useReadyWorkspacePlaybackReadModelSetup(
  params: UseReadyWorkspacePlaybackReadModelSetupParams,
) {
  const {
    data,
    player,
    waveformBridge,
    selectedTimelineOwnerUnit,
    selectedTimelineUnitForTime,
    selectedTimelineUnit,
    selectedUnitIds,
    selectedMediaUrl,
    createUnitFromSelectionRouted,
    runDeleteSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    timelineUnitViewIndex,
    activeTextTimelineMode,
    documentSpanSec,
    zoomPxPerSec,
    fitPxPerSec,
    verticalViewActive,
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    timelineSyncController,
    activeLayerIdForEdits,
  } = params;

  const playbackKeyboardController = useTranscriptionPlaybackKeyboardController({
    player,
    subSelectionRange: waveformBridge.subSelectionRange,
    setSubSelectionRange: waveformBridge.setSubSelectionRange,
    selectedUnit: selectedTimelineOwnerUnit ?? undefined,
    selectedPlayableRange: selectedTimelineUnitForTime,
    selectedTimelineUnit,
    selectedUnitIds,
    selectedMediaUrl,
    segMarkStart: waveformBridge.segMarkStart,
    setSegMarkStart: waveformBridge.setSegMarkStart,
    segmentLoopPlayback: waveformBridge.segmentLoopPlayback,
    setSegmentLoopPlayback: waveformBridge.setSegmentLoopPlayback,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    markingModeRef: waveformBridge.markingModeRef,
    skipSeekForIdRef: waveformBridge.skipSeekForIdRef,
    creatingSegmentRef: waveformBridge.creatingSegmentRef,
    manualSelectTsRef: waveformBridge.manualSelectTsRef,
    waveformAreaRef: waveformBridge.waveformAreaRef,
    createUnitFromSelection: createUnitFromSelectionRouted,
    selectTimelineUnit: data.selectTimelineUnit,
    selectUnit: data.selectUnit,
    selectAllUnits: data.selectAllUnits,
    runDeleteSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    undo: data.undo,
    redo: data.redo,
    setShowSearch: data.setShowSearch,
    toggleNotes: data.toggleNotes,
  });

  useJKLShuttle(player);

  useTranscriptionActionRefBindings({
    executeActionRef,
    executeAction: playbackKeyboardController.executeAction,
    openSearchRef,
    openSearchFromRequest: waveformBridge.openSearchFromRequest,
    seekToTimeRef,
    seekToTime: (timeSeconds: number) => {
      player.seekTo(timeSeconds);
    },
    splitAtTimeRef,
    handleSplitAtTimeRequest: timelineSyncController.handleSplitAtTimeRequest,
    zoomToSegmentRef,
    handleZoomToSegmentRequest: timelineSyncController.handleZoomToSegmentRequest,
    waveformInteractionHandlerRefs: waveformBridge.waveformInteractionHandlerRefs,
    handleWaveformRegionAltPointerDown: timelineSyncController.handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick: timelineSyncController.handleWaveformRegionClick,
    handleWaveformRegionDoubleClick: timelineSyncController.handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate: timelineSyncController.handleWaveformRegionCreate,
    handleWaveformRegionContextMenu: timelineSyncController.handleWaveformRegionContextMenu,
    handleWaveformRegionUpdate: timelineSyncController.handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd: timelineSyncController.handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate: timelineSyncController.handleWaveformTimeUpdate,
  });

  const timelineReadModel = useTimelineReadModel({
    unitIndex: timelineUnitViewIndex,
    transcriptionLayerIds: data.transcriptionLayers.map((layer: { id: string }) => layer.id),
    translationLayerIds: data.translationLayers.map((layer: { id: string }) => layer.id),
    selectedTimelineUnit,
    selectedUnitIds: Array.from(selectedUnitIds),
    ...(activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits } : {}),
    ...(activeTextTimelineMode !== undefined ? { activeTextTimelineMode } : {}),
    ...(documentSpanSec > 0 ? { documentSpanSec } : {}),
    ...(zoomPxPerSec !== undefined ? { zoomPxPerSec } : {}),
    ...(fitPxPerSec !== undefined ? { fitPxPerSec } : {}),
    selectedMediaUrl: selectedMediaUrl ?? null,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    verticalViewEnabled: verticalViewActive,
    orchestratorLayersCount: data.layers.length,
  });

  return { playbackKeyboardController, timelineReadModel };
}
