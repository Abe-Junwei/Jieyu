import {
  buildReadyWorkspaceTimelineInteractionInput,
  buildReadyWorkspaceTimelineSyncControllerInput,
} from './transcriptionReadyWorkspaceDomainInputBuilder';
import { useReadyWorkspaceTimelineSyncController } from './useReadyWorkspaceTimelineSyncController';

export interface UseReadyWorkspaceTimelineSyncSetupParams {
  data: any;
  locale: string;
  manualSelectTsRef: any;
  player: any;
  activeTimelineUnitId: any;
  waveformTimelineItems: any;
  activeLayerIdForEdits: any;
  useSegmentWaveformRegions: any;
  selectedTimelineUnit: any;
  subSelectDragRef: any;
  waveCanvasRef: any;
  resolveSegmentRoutingForLayer: any;
  segmentsByLayer: any;
  unitsOnCurrentMedia: any;
  selectedUnitIds: any;
  selectedWaveformRegionId: any;
  snapEnabled: boolean;
  creatingSegmentRef: any;
  markingModeRef: any;
  setNotePopover: any;
  setAiSidebarError: any;
  openPdfPreviewRequest: any;
  runSplitAtTime: any;
  createUnitFromSelectionRouted: any;
  setSelectedLayerId: any;
  setFocusedLayerRowId: any;
  setFlashLayerRowId: any;
  selectSegment: any;
  timelineViewportProjection: any;
}

export function useReadyWorkspaceTimelineSyncSetup(
  params: UseReadyWorkspaceTimelineSyncSetupParams,
) {
  const {
    data,
    locale,
    manualSelectTsRef,
    player,
    activeTimelineUnitId,
    waveformTimelineItems,
    activeLayerIdForEdits,
    useSegmentWaveformRegions,
    selectedTimelineUnit,
    subSelectDragRef,
    waveCanvasRef,
    resolveSegmentRoutingForLayer,
    segmentsByLayer,
    unitsOnCurrentMedia,
    selectedUnitIds,
    selectedWaveformRegionId,
    snapEnabled,
    creatingSegmentRef,
    markingModeRef,
    setNotePopover,
    setAiSidebarError,
    openPdfPreviewRequest,
    runSplitAtTime,
    createUnitFromSelectionRouted,
    setSelectedLayerId,
    setFocusedLayerRowId,
    setFlashLayerRowId,
    selectSegment,
    timelineViewportProjection,
  } = params;

  const timelineInteractionInput = buildReadyWorkspaceTimelineInteractionInput({
    readInput: {
      layers: data.layers,
      units: data.units,
      manualSelectTsRef,
      player,
      locale,
      sidePaneRows: data.sidePaneRows,
      activeTimelineUnitId,
      waveformTimelineItems,
      activeLayerIdForEdits,
      useSegmentWaveformRegions,
      selectedTimelineUnit,
      subSelectDragRef,
      waveCanvasRef,
      resolveSegmentRoutingForLayer,
      segmentsByLayer,
      unitsOnCurrentMedia,
      selectedUnitIds,
      selectedWaveformRegionId,
      snapEnabled,
      creatingSegmentRef,
      markingModeRef,
    },
    writeInput: {
      saveUnitText: data.saveUnitText,
      saveUnitLayerText: data.saveUnitLayerText,
      selectUnit: data.selectUnit,
      onSetNotePopover: setNotePopover,
      onSetSidebarError: setAiSidebarError,
      onOpenPdfPreviewRequest: openPdfPreviewRequest,
      runSplitAtTime,
      selectTimelineUnit: data.selectTimelineUnit,
      toggleSegmentSelection: data.toggleSegmentSelection,
      selectSegmentRange: data.selectSegmentRange,
      toggleUnitSelection: data.toggleUnitSelection,
      selectUnitRange: data.selectUnitRange,
      setSubSelectionRange: data.setSubSelectionRange,
      zoomToPercent: data.zoomToPercent,
      zoomToUnit: data.zoomToUnit,
      getNeighborBounds: data.getNeighborBounds,
      reloadSegments: data.reloadSegments,
      saveUnitTiming: data.saveUnitTiming,
      setSaveState: data.setSaveState,
      beginTimingGesture: data.beginTimingGesture,
      endTimingGesture: data.endTimingGesture,
      makeSnapGuide: data.makeSnapGuide,
      setSnapGuide: data.setSnapGuide,
      setDragPreview: data.setDragPreview,
      setCtxMenu: data.setCtxMenu,
      createUnitFromSelection: createUnitFromSelectionRouted,
    },
    revealSchemaLayerHandlers: {
      setSelectedLayerId,
      setFocusedLayerRowId,
      setFlashLayerRowId,
    },
  });

  return useReadyWorkspaceTimelineSyncController(
    buildReadyWorkspaceTimelineSyncControllerInput({
      interactionInput: timelineInteractionInput,
      resizeBridgeInput: {
        timelineZoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
        selectSegment,
        setSelectedLayerId,
        setFocusedLayerRowId,
      },
    }),
  );
}
