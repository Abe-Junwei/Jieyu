import type { UseTranscriptionWaveformBridgeControllerInput } from './transcriptionWaveformBridge.types';

type B = UseTranscriptionWaveformBridgeControllerInput;

export type ReadyWorkspaceWaveformBridgeInputParams = Omit<
  B,
  'createUnitFromSelection' | 'logicalTimelineDurationSec' | 'mediaId' | 'mediaBlobSize' | 'tierTimelineLassoSuppressed'
> & {
  createUnitFromSelectionRouted: B['createUnitFromSelection'];
  logicalTimelineDurationForZoom: number | undefined;
  selectedTimelineMediaId: string | undefined;
  selectedMediaBlobSize: number | undefined;
  verticalComparisonEnabled: boolean;
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
    ...(typeof p.logicalTimelineDurationForZoom === 'number'
      && Number.isFinite(p.logicalTimelineDurationForZoom)
      && p.logicalTimelineDurationForZoom > 0
      ? { logicalTimelineDurationSec: p.logicalTimelineDurationForZoom }
      : {}),
    ...(p.selectedTimelineMediaId !== undefined ? { mediaId: p.selectedTimelineMediaId } : {}),
    ...(p.selectedMediaBlobSize !== undefined && { mediaBlobSize: p.selectedMediaBlobSize }),
    ...(p.verticalComparisonEnabled ? { tierTimelineLassoSuppressed: true } : {}),
  };
}
