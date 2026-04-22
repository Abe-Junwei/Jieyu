import { useMemo } from 'react';
import type { LayerDocType, LayerLinkDocType } from '../db';
import { isSegmentTimelineUnit, isUnitTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';

type WaveformTimelineItem = TimelineUnitView;

interface UseWaveformSelectionControllerInput {
  activeLayerIdForEdits: string;
  layers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  defaultTranscriptionLayerId?: string;
  /** Single read-model source for waveform regions (unit vs segment rows). */
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  selectedTimelineUnit: TimelineUnit | null;
  selectedUnitIds: Set<string>;
}

interface UseWaveformSelectionControllerResult {
  activeWaveformLayer: LayerDocType | undefined;
  activeWaveformSegmentSourceLayer: LayerDocType | undefined;
  useSegmentWaveformRegions: boolean;
  waveformTimelineItems: WaveformTimelineItem[];
  waveformRegions: Array<{ id: string; start: number; end: number; skipProcessing?: boolean }>;
  selectedWaveformRegionId: string;
  waveformActiveRegionIds: Set<string>;
  selectedWaveformTimelineItem: WaveformTimelineItem | null;
}

export function useWaveformSelectionController({
  activeLayerIdForEdits,
  layers,
  layerById,
  layerLinks,
  defaultTranscriptionLayerId,
  timelineUnitViewIndex,
  selectedTimelineUnit,
  selectedUnitIds,
}: UseWaveformSelectionControllerInput): UseWaveformSelectionControllerResult {
  const activeWaveformLayer = useMemo(
    () => layers.find((item) => item.id === activeLayerIdForEdits),
    [activeLayerIdForEdits, layers],
  );

  const activeWaveformSegmentSourceLayer = useMemo(
    () => resolveSegmentTimelineSourceLayer(activeWaveformLayer, layerById, defaultTranscriptionLayerId, layerLinks),
    [activeWaveformLayer, defaultTranscriptionLayerId, layerById, layerLinks],
  );

  const useSegmentWaveformRegions = Boolean(activeWaveformSegmentSourceLayer);

  const waveformTimelineItems = useMemo(() => {
    const unitRowsFromIndex = timelineUnitViewIndex.currentMediaUnits;
    if (useSegmentWaveformRegions && activeWaveformSegmentSourceLayer) {
      return unitRowsFromIndex
        .filter((unit) => unit.kind === 'segment' && unit.layerId === activeWaveformSegmentSourceLayer.id)
        .sort((a, b) => a.startTime - b.startTime);
    }
    return unitRowsFromIndex
      .filter((unit) => unit.kind === 'unit')
      .sort((a, b) => a.startTime - b.startTime);
  }, [
    activeWaveformSegmentSourceLayer,
    timelineUnitViewIndex.currentMediaUnits,
    useSegmentWaveformRegions,
  ]);

  const waveformRegions = useMemo(() =>
    waveformTimelineItems.map((item) => ({
      id: item.id,
      start: item.startTime,
      end: item.endTime,
      ...(item.tags?.skipProcessing === true ? { skipProcessing: true } : {}),
    })),
  [waveformTimelineItems]);

  const selectedWaveformRegionId = useMemo(() => {
    if (!selectedTimelineUnit?.unitId) return '';
    const kindMatchesWaveform = useSegmentWaveformRegions
      ? isSegmentTimelineUnit(selectedTimelineUnit)
      : isUnitTimelineUnit(selectedTimelineUnit);
    if (!kindMatchesWaveform) return '';
    return waveformTimelineItems.some((item) => item.id === selectedTimelineUnit.unitId)
      ? selectedTimelineUnit.unitId
      : '';
  }, [selectedTimelineUnit, useSegmentWaveformRegions, waveformTimelineItems]);

  const waveformActiveRegionIds = useMemo(() => {
    if (useSegmentWaveformRegions) {
      if (selectedUnitIds.size > 0) return selectedUnitIds;
      return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();
    }
    return selectedUnitIds;
  }, [selectedUnitIds, selectedWaveformRegionId, useSegmentWaveformRegions]);

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
    selectedWaveformTimelineItem,
  };
}