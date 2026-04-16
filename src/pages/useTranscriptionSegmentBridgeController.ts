import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getDb, type LayerDocType, type LayerUnitContentDocType, type LayerUnitDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { getLayerEditMode, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { resolveTranscriptionTargetLayerId } from './transcriptionUnitTargetResolver';
import type { SegmentTimelineRoutingResult } from './transcriptionSegmentRouting';
import { type LayerSegmentGraphSnapshot, restoreLayerSegmentGraphSnapshot, snapshotLayerSegmentGraphByLayerIds } from '../services/LayerSegmentGraphService';
import { fireAndForget } from '../utils/fireAndForget';
import { createMetricTags, recordDurationMetric } from '../observability/metrics';

interface SegmentUndoRefValue {
  snapshotLayerSegments?: () => LayerSegmentGraphSnapshot;
  restoreLayerSegments?: (
    units: LayerUnitDocType[],
    contents: LayerUnitContentDocType[],
    links: LayerSegmentGraphSnapshot['links'],
  ) => Promise<void>;
}

interface UseTranscriptionSegmentBridgeControllerInput {
  selectedLayerId?: string;
  focusedLayerId: string;
  selectedTimelineUnit: TimelineUnit | null;
  defaultTranscriptionLayerId?: string;
  firstTranscriptionLayerId?: string;
  layerById: ReadonlyMap<string, LayerDocType>;
  independentLayerIds: ReadonlySet<string>;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, Map<string, LayerUnitContentDocType>>;
  reloadSegments: () => Promise<void>;
  reloadSegmentContents: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  segmentUndoRef: React.MutableRefObject<SegmentUndoRefValue | null>;
}

interface UseTranscriptionSegmentBridgeControllerResult {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentTimelineRoutingResult;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
}

function recordSegmentSaveLatency(layerId: string, status: 'success' | 'error', startedAtMs: number): void {
  try {
    recordDurationMetric(
      'business.transcription.segment_action_latency_ms',
      startedAtMs,
      createMetricTags('transcription', { action: 'save_content', status, layerId }),
    );
  } catch {
    // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
  }
}

export function useTranscriptionSegmentBridgeController(
  input: UseTranscriptionSegmentBridgeControllerInput,
): UseTranscriptionSegmentBridgeControllerResult {
  const activeLayerIdForEdits = useMemo(() => resolveTranscriptionTargetLayerId({
    selectedLayerId: input.selectedLayerId,
    focusedLayerId: input.focusedLayerId,
    selectedTimelineUnitLayerId: input.selectedTimelineUnit?.layerId,
    defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
    firstTranscriptionLayerId: input.firstTranscriptionLayerId,
  }), [input.defaultTranscriptionLayerId, input.firstTranscriptionLayerId, input.focusedLayerId, input.selectedLayerId, input.selectedTimelineUnit?.layerId]);

  const segmentUndoSnapshotRef = useRef<LayerSegmentGraphSnapshot>({
    units: [],
    contents: [],
    links: [],
  });
  const segmentUndoSnapshotRequestIdRef = useRef(0);

  const resolveSegmentRoutingForLayer = useCallback((layerId?: string): SegmentTimelineRoutingResult => {
    const layer = layerId ? input.layerById.get(layerId) : undefined;
    const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, input.layerById, input.defaultTranscriptionLayerId);
    return {
      layer,
      segmentSourceLayer,
      sourceLayerId: segmentSourceLayer?.id ?? '',
      usesSegmentTimeline: Boolean(segmentSourceLayer),
      editMode: getLayerEditMode(segmentSourceLayer ?? layer, input.defaultTranscriptionLayerId),
    };
  }, [input.defaultTranscriptionLayerId, input.layerById]);

  const refreshSegmentUndoSnapshot = useCallback(async () => {
    const requestId = segmentUndoSnapshotRequestIdRef.current + 1;
    segmentUndoSnapshotRequestIdRef.current = requestId;
    if (input.independentLayerIds.size === 0) {
      if (segmentUndoSnapshotRequestIdRef.current === requestId) {
        segmentUndoSnapshotRef.current = { units: [], contents: [], links: [] };
      }
      return;
    }
    const db = await getDb();
    const snapshot = await snapshotLayerSegmentGraphByLayerIds(db, [...input.independentLayerIds]);
    if (segmentUndoSnapshotRequestIdRef.current !== requestId) return;
    segmentUndoSnapshotRef.current = snapshot;
  }, [input.independentLayerIds]);

  useEffect(() => {
    fireAndForget(refreshSegmentUndoSnapshot());

    return () => {
      segmentUndoSnapshotRequestIdRef.current += 1;
    };
  }, [refreshSegmentUndoSnapshot]);

  useEffect(() => {
    input.segmentUndoRef.current = {
      snapshotLayerSegments: () => ({
        units: [...segmentUndoSnapshotRef.current.units],
        contents: [...segmentUndoSnapshotRef.current.contents],
        links: [...segmentUndoSnapshotRef.current.links],
      }),
      restoreLayerSegments: async (units, contents, links) => {
        const db = await getDb();
        await restoreLayerSegmentGraphSnapshot(db, { units, contents, links }, [...input.independentLayerIds]);
        await input.reloadSegments();
        await input.reloadSegmentContents();
        await refreshSegmentUndoSnapshot();
      },
    };

    return () => {
      input.segmentUndoRef.current = null;
    };
  }, [input.independentLayerIds, input.reloadSegmentContents, input.reloadSegments, input.segmentUndoRef, refreshSegmentUndoSnapshot]);

  const saveSegmentContentForLayer = useCallback(async (segmentId: string, layerId: string, value: string) => {
    const startedAtMs = performance.now();
    const layer = input.layerById.get(layerId);
    if (!layer) return;
    const sourceLayer = resolveSegmentTimelineSourceLayer(layer, input.layerById, input.defaultTranscriptionLayerId);
    if (!sourceLayer) return;
    const now = new Date().toISOString();
    const trimmed = value.trim();
    const existing = input.segmentContentByLayer.get(layerId)?.get(segmentId);

    if (!trimmed) {
      try {
        if (existing) {
          await LayerSegmentationV2Service.deleteSegmentContent(existing.id);
        }
        await input.reloadSegmentContents();
        recordSegmentSaveLatency(layerId, 'success', startedAtMs);
      } catch (error) {
        recordSegmentSaveLatency(layerId, 'error', startedAtMs);
        throw error;
      }
      return;
    }

    const segment = (input.segmentsByLayer.get(sourceLayer.id) ?? []).find((item) => item.id === segmentId);
    if (!segment) return;
    const next: LayerUnitContentDocType = {
      id: existing?.id ?? `segc_${layerId}_${segmentId}`,
      textId: segment.textId,
      unitId: segmentId,
      layerId,
      modality: 'text',
      text: trimmed,
      sourceType: 'human',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await LayerSegmentationV2Service.upsertSegmentContent(next);
      await input.reloadSegmentContents();
      await refreshSegmentUndoSnapshot();
      recordSegmentSaveLatency(layerId, 'success', startedAtMs);
    } catch (error) {
      recordSegmentSaveLatency(layerId, 'error', startedAtMs);
      throw error;
    }
  }, [input.defaultTranscriptionLayerId, input.layerById, input.reloadSegmentContents, input.segmentContentByLayer, input.segmentsByLayer, refreshSegmentUndoSnapshot]);

  return {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    refreshSegmentUndoSnapshot,
    saveSegmentContentForLayer,
  };
}