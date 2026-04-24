import type { UseTranscriptionWaveformBridgeControllerInput } from './transcriptionWaveformBridge.types';

type B = UseTranscriptionWaveformBridgeControllerInput;

export type ReadyWorkspaceWaveformBridgeInputParams = Omit<
  B,
  'createUnitFromSelection' | 'mediaId' | 'mediaBlobSize' | 'tierTimelineLassoSuppressed'
> & {
  createUnitFromSelectionRouted: B['createUnitFromSelection'];
  activeTextTimeLogicalDurationSec?: number;
  selectedTimelineMediaId: string | undefined;
  selectedMediaBlobSize: number | undefined;
  verticalComparisonEnabled: boolean;
  tierIndependentSegmentCreateRangeClamp?: B['tierIndependentSegmentCreateRangeClamp'];
};

export function buildReadyWorkspaceWaveformBridgeControllerInput(
  p: ReadyWorkspaceWaveformBridgeInputParams,
): UseTranscriptionWaveformBridgeControllerInput {
  return {
    activeLayerIdForEdits: p.activeLayerIdForEdits,
    layers: p.layers,
    layerById: p.layerById,
    layerLinks: p.layerLinks,
    ...(p.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: p.defaultTranscriptionLayerId } : {}),
    timelineUnitViewIndex: p.timelineUnitViewIndex,
    selectedTimelineUnit: p.selectedTimelineUnit,
    selectedTimelineUnitForTime: p.selectedTimelineUnitForTime,
    selectedUnitIds: p.selectedUnitIds,
    selectedMediaUrl: p.selectedMediaUrl,
    waveformHeight: p.waveformHeight,
    amplitudeScale: p.amplitudeScale,
    setAmplitudeScale: p.setAmplitudeScale,
    waveformDisplayMode: p.waveformDisplayMode,
    waveformVisualStyle: p.waveformVisualStyle,
    acousticOverlayMode: p.acousticOverlayMode,
    zoomMode: p.zoomMode,
    setZoomMode: p.setZoomMode,
    clearUnitSelection: p.clearUnitSelection,
    createUnitFromSelection: p.createUnitFromSelectionRouted,
    setUnitSelection: p.setUnitSelection,
    resolveNoteIndicatorTarget: p.resolveNoteIndicatorTarget,
    tierContainerRef: p.tierContainerRef,
    ...(typeof p.activeTextTimeLogicalDurationSec === 'number'
    && Number.isFinite(p.activeTextTimeLogicalDurationSec)
      ? { activeTextTimeLogicalDurationSec: p.activeTextTimeLogicalDurationSec }
      : {}),
    unitsOnCurrentMedia: p.unitsOnCurrentMedia,
    ...(p.selectedTimelineMediaId !== undefined ? { mediaId: p.selectedTimelineMediaId } : {}),
    ...(p.selectedMediaBlobSize !== undefined && { mediaBlobSize: p.selectedMediaBlobSize }),
    ...(p.verticalComparisonEnabled ? { tierTimelineLassoSuppressed: true, verticalComparisonEnabled: true } : {}),
    ...(p.tierIndependentSegmentCreateRangeClamp
      ? { tierIndependentSegmentCreateRangeClamp: p.tierIndependentSegmentCreateRangeClamp }
      : {}),
  };
}
