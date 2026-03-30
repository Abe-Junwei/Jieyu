import { useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import {
  isSegmentTimelineUnit,
  isUtteranceTimelineUnit,
  type TimelineUnit,
} from '../hooks/transcriptionTypes';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';

type WaveformTimelineItem = LayerSegmentDocType | UtteranceDocType;

interface UseWaveformSelectionControllerInput {
  activeLayerIdForEdits: string;
  layers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  defaultTranscriptionLayerId?: string;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
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
    if (useSegmentWaveformRegions && activeWaveformSegmentSourceLayer) {
      const segments = segmentsByLayer.get(activeWaveformSegmentSourceLayer.id) ?? [];
      return [...segments].sort((a, b) => a.startTime - b.startTime);
    }
    return utterancesOnCurrentMedia;
  }, [activeWaveformSegmentSourceLayer, segmentsByLayer, useSegmentWaveformRegions, utterancesOnCurrentMedia]);

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