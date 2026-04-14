import { useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import {
  isSegmentTimelineUnit,
  isUtteranceTimelineUnit,
  type TimelineUnit,
} from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';

type WaveformTimelineItem = TimelineUnitView;

interface UseWaveformSelectionControllerInput {
  activeLayerIdForEdits: string;
  layers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  defaultTranscriptionLayerId?: string;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  timelineUnitViewIndex?: TimelineUnitViewIndexWithEpoch;
  selectedTimelineUnit: TimelineUnit | null;
  selectedUtteranceIds: Set<string>;
}

interface UseWaveformSelectionControllerResult {
  activeWaveformLayer: LayerDocType | undefined;
  activeWaveformSegmentSourceLayer: LayerDocType | undefined;
  useSegmentWaveformRegions: boolean;
  waveformTimelineItems: WaveformTimelineItem[];
  waveformRegions: Array<{ id: string; start: number; end: number }>;
  selectedWaveformRegionId: string;
  waveformActiveRegionIds: Set<string>;
  waveformPrimaryRegionId: string;
  selectedWaveformTimelineItem: WaveformTimelineItem | null;
}

export function useWaveformSelectionController({
  activeLayerIdForEdits,
  layers,
  layerById,
  defaultTranscriptionLayerId,
  segmentsByLayer,
  utterancesOnCurrentMedia,
  timelineUnitViewIndex,
  selectedTimelineUnit,
  selectedUtteranceIds,
}: UseWaveformSelectionControllerInput): UseWaveformSelectionControllerResult {
  const activeWaveformLayer = useMemo(
    () => layers.find((item) => item.id === activeLayerIdForEdits),
    [activeLayerIdForEdits, layers],
  );

  const activeWaveformSegmentSourceLayer = useMemo(
    () => resolveSegmentTimelineSourceLayer(activeWaveformLayer, layerById, defaultTranscriptionLayerId),
    [activeWaveformLayer, defaultTranscriptionLayerId, layerById],
  );

  const useSegmentWaveformRegions = Boolean(activeWaveformSegmentSourceLayer);

  const waveformTimelineItems = useMemo(() => {
    const unitRowsFromIndex = timelineUnitViewIndex?.currentMediaUnits;
    if (unitRowsFromIndex && unitRowsFromIndex.length > 0) {
      if (useSegmentWaveformRegions && activeWaveformSegmentSourceLayer) {
        return unitRowsFromIndex
          .filter((unit) => unit.kind === 'segment' && unit.layerId === activeWaveformSegmentSourceLayer.id)
          .sort((a, b) => a.startTime - b.startTime);
      }
      return unitRowsFromIndex
        .filter((unit) => unit.kind === 'utterance')
        .sort((a, b) => a.startTime - b.startTime);
    }
    if (useSegmentWaveformRegions && activeWaveformSegmentSourceLayer) {
      const segments = segmentsByLayer.get(activeWaveformSegmentSourceLayer.id) ?? [];
      return [...segments]
        .sort((a, b) => a.startTime - b.startTime)
        .map((segment) => ({
          id: segment.id,
          kind: 'segment',
          mediaId: segment.mediaId,
          layerId: segment.layerId,
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: '',
          ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
          ...(segment.utteranceId ? { parentUtteranceId: segment.utteranceId } : {}),
        } satisfies TimelineUnitView));
    }
    return utterancesOnCurrentMedia.map((utterance) => ({
      id: utterance.id,
      kind: 'utterance',
      mediaId: utterance.mediaId ?? '',
      layerId: defaultTranscriptionLayerId ?? activeLayerIdForEdits,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      text: '',
      ...(utterance.speakerId ? { speakerId: utterance.speakerId } : {}),
    } satisfies TimelineUnitView));
  }, [
    activeLayerIdForEdits,
    activeWaveformSegmentSourceLayer,
    defaultTranscriptionLayerId,
    segmentsByLayer,
    timelineUnitViewIndex?.currentMediaUnits,
    useSegmentWaveformRegions,
    utterancesOnCurrentMedia,
  ]);

  const waveformRegions = useMemo(() =>
    waveformTimelineItems.map((item) => ({
      id: item.id,
      start: item.startTime,
      end: item.endTime,
    })),
  [waveformTimelineItems]);

  const selectedWaveformRegionId = useMemo(() => {
    if (!selectedTimelineUnit?.unitId) return '';
    const kindMatchesWaveform = useSegmentWaveformRegions
      ? isSegmentTimelineUnit(selectedTimelineUnit)
      : isUtteranceTimelineUnit(selectedTimelineUnit);
    if (!kindMatchesWaveform) return '';
    return waveformTimelineItems.some((item) => item.id === selectedTimelineUnit.unitId)
      ? selectedTimelineUnit.unitId
      : '';
  }, [selectedTimelineUnit, useSegmentWaveformRegions, waveformTimelineItems]);

  const waveformActiveRegionIds = useMemo(() => {
    if (useSegmentWaveformRegions) {
      if (selectedUtteranceIds.size > 0) return selectedUtteranceIds;
      return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();
    }
    return selectedUtteranceIds;
  }, [selectedUtteranceIds, selectedWaveformRegionId, useSegmentWaveformRegions]);

  const waveformPrimaryRegionId = selectedWaveformRegionId;

  const selectedWaveformTimelineItem = useMemo(() => {
    if (!selectedWaveformRegionId) return null;
    return waveformTimelineItems.find((item) => item.id === selectedWaveformRegionId) ?? null;
  }, [selectedWaveformRegionId, waveformTimelineItems]);

  return {
    activeWaveformLayer,
    activeWaveformSegmentSourceLayer,
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
    waveformPrimaryRegionId,
    selectedWaveformTimelineItem,
  };
}