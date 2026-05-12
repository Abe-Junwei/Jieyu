import type { Dispatch, SetStateAction } from 'react';
import type { UseTranscriptionTimelineInteractionControllerInput } from '../types/useTranscriptionTimelineInteractionController.types';
import {
  buildReadyWorkspaceTimelineInteractionInput,
  buildReadyWorkspaceTimelineSyncControllerInput,
} from './transcriptionReadyWorkspaceDomainInputBuilder';
import { useReadyWorkspaceTimelineSyncController } from './useReadyWorkspaceTimelineSyncController';

/**
 * `data` 仅为 `useTranscriptionData` 的文档域 API；波形视口、右键菜单、视口缩放、段落重载等由 ReadyWorkspace
 * 其它 hook 持有。若把后者误从 `data.xxx` 拼进 `useTranscriptionTimelineInteractionController`，运行期会得到
 * `undefined` 并在首次调用时报「is not a function」。
 */
export interface UseReadyWorkspaceTimelineSyncSetupParams {
  data: ReturnType<typeof import('../hooks/useTranscriptionData').useTranscriptionData>;
  /** 来自波形桥 `useReadyWorkspaceWaveformBridgeController`，不在 `useTranscriptionData` 上。 */
  setSubSelectionRange: Dispatch<SetStateAction<{ start: number; end: number } | null>>;
  /** 来自波形桥；拖拽语段边界时 `handleWaveformRegionUpdate` 需要。 */
  setDragPreview: Dispatch<SetStateAction<{ id: string; start: number; end: number } | null>>;
  /** 来自波形桥 `useTimelineViewport` 路径，不在 `data` 上。 */
  zoomToPercent: UseTranscriptionTimelineInteractionControllerInput['zoomToPercent'];
  zoomToUnit: UseTranscriptionTimelineInteractionControllerInput['zoomToUnit'];
  /** 来自 `useTranscriptionUIState`，不在 `data` 上。 */
  setCtxMenu: UseTranscriptionTimelineInteractionControllerInput['setCtxMenu'];
  /** 来自 `useReadyWorkspaceSegmentScope`（或等价段落读模型），不在 `data` 上。 */
  reloadSegments: UseTranscriptionTimelineInteractionControllerInput['reloadSegments'];
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
    setSubSelectionRange,
    setDragPreview,
    zoomToPercent,
    zoomToUnit,
    setCtxMenu,
    reloadSegments,
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
    domainWrite: {
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
      getNeighborBounds: data.getNeighborBounds,
      saveUnitTiming: data.saveUnitTiming,
      setSaveState: data.setSaveState,
      beginTimingGesture: data.beginTimingGesture,
      endTimingGesture: data.endTimingGesture,
      makeSnapGuide: data.makeSnapGuide,
      setSnapGuide: data.setSnapGuide,
      createUnitFromSelection: createUnitFromSelectionRouted,
    },
    hostWrite: {
      setSubSelectionRange,
      setDragPreview,
      zoomToPercent,
      zoomToUnit,
      setCtxMenu,
      reloadSegments,
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
