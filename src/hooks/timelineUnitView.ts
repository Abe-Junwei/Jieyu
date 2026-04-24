import type { AiMetadata, LayerDocType, LayerLinkDocType, LayerSegmentViewDocType, LayerUnitDocType } from '../db';
import { pickDefaultTranscriptionText } from '../utils/transcriptionFormatters';
import {
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
} from '../utils/transcriptionUnitLaneReadScope';
import type { TimelineUnitKind } from './transcriptionTypes';

/**
 * Unified timeline unit for read paths (AI, waveform digest, tools).
 * Timeline mutations route through `dispatchTimelineUnitMutation` (see `src/pages/timelineUnitMutationDispatch.ts`)
 * so `kind` + layer edit mode pick unit-doc vs segment-layer writes deterministically.
 */
export interface TimelineUnitView {
  id: string;
  kind: TimelineUnitKind;
  layerRole?: 'independent' | 'referring';
  mediaId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  /** Primary line text for tools / digest (unit default orthography or segment layer text). */
  text: string;
  /** Carried from unit docs for waveform confidence / overlays. */
  ai_metadata?: AiMetadata;
  speakerId?: string;
  parentUnitId?: string;
  annotationStatus?: string;
  textId?: string;
  tags?: Record<string, boolean>;
}

export interface BuildTimelineUnitViewIndexInput {
  units: ReadonlyArray<LayerUnitDocType>;
  unitsOnCurrentMedia: ReadonlyArray<LayerUnitDocType>;
  segmentsByLayer: ReadonlyMap<string, ReadonlyArray<LayerSegmentViewDocType>> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined;
  currentMediaId: string | undefined;
  activeLayerIdForEdits: string | undefined;
  /** Used as `layerId` for unit-shaped rows when no per-row layer exists. */
  defaultTranscriptionLayerId: string | undefined;
  /**
   * When false, segments may still be loading — tools should not treat empty index as authoritative.
   */
  segmentsLoadComplete?: boolean;
  /** Monotonic snapshot epoch from hook-level rebuilds. */
  epoch?: number;
  /**
   * When set, `byLayer` buckets for each transcription lane include canonical units per ADR 0020
   * (unscoped mirror onto dependent lanes under the default host tree).
   */
  transcriptionLaneReadScope?: Readonly<{
    transcriptionLayers: readonly LayerDocType[];
    allLayersOrdered: readonly LayerDocType[];
    layerLinks?: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  }>;
}

/** Read `byLayer` for a transcription or translation lane id (ADR 0020); returns empty when unknown. */
export function pickTimelineUnitsForTranscriptionLayer(
  index: Pick<TimelineUnitViewIndex, 'byLayer'>,
  layerId: string,
): ReadonlyArray<TimelineUnitView> {
  const k = layerId.trim();
  if (!k.length) return [];
  return index.byLayer.get(k) ?? [];
}

export interface TimelineUnitViewIndex {
  /** Project-scoped rows for tools (same semantics as former effectiveProjectRows). */
  allUnits: ReadonlyArray<TimelineUnitView>;
  /** Current media rows for timeline digest / waveform bounds (former effectiveCurrentMediaRows). */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  /** Exact-id lookup (`unit.id`) over `allUnits`. */
  byId: ReadonlyMap<string, TimelineUnitView>;
  /** Resolve either exact unit id or semantic id (e.g. parent unit id shadowed by segment). */
  resolveBySemanticId: (semanticOrExactId: string) => TimelineUnitView | undefined;
  /** Units grouped by layer id; each bucket follows `allUnits` time order. */
  byLayer: ReadonlyMap<string, ReadonlyArray<TimelineUnitView>>;
  /** Resolve referring units (typically segments) by independent unit id. */
  getReferringUnits: (independentUnitId: string) => ReadonlyArray<TimelineUnitView>;
  totalCount: number;
  currentMediaCount: number;
  epoch: number;
  /**
   * True when the project has no unit rows but segment rows exist (segment-first / transcription-on-segment projects).
   * Diagnostic only; `allUnits` is still the single read-model list.
   */
  fallbackToSegments: boolean;
  isComplete: boolean;
}

function resolveSegmentText(
  segmentId: string,
  activeLayerIdForEdits: string | undefined,
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined,
): string {
  const preferredLayer = activeLayerIdForEdits;
  const fromPreferred = preferredLayer ? segmentContentByLayer?.get(preferredLayer)?.get(segmentId)?.text : undefined;
  if (typeof fromPreferred === 'string' && fromPreferred.trim().length > 0) return fromPreferred.trim();
  if (segmentContentByLayer) {
    for (const contentMap of segmentContentByLayer.values()) {
      const next = contentMap.get(segmentId)?.text;
      if (typeof next === 'string' && next.trim().length > 0) return next.trim();
    }
  }
  return '';
}

export function unitToView(u: LayerUnitDocType, defaultLayerId: string): TimelineUnitView {
  return {
    id: u.id,
    kind: 'unit',
    layerRole: 'independent',
    mediaId: u.mediaId ?? '',
    layerId: defaultLayerId,
    startTime: u.startTime,
    endTime: u.endTime,
    text: pickDefaultTranscriptionText(u.transcription),
    ...(u.ai_metadata ? { ai_metadata: u.ai_metadata } : {}),
    ...(u.speakerId ? { speakerId: u.speakerId } : {}),
    ...(u.status ? { annotationStatus: u.status } : {}),
    ...(u.textId ? { textId: u.textId } : {}),
    ...(u.tags ? { tags: u.tags } : {}),
  };
}

/**
 * Project-wide unit cardinality using the same semantic merge keys as `buildTimelineUnitViewIndex`
 * (unit id vs segment id / parent unit shadowing).
 */
export function mergedTimelineUnitSemanticKeyCount(input: {
  unitIds: readonly string[];
  segments: ReadonlyArray<{ id: string; unitId?: string | undefined }>;
}): number {
  const mergedBySemanticKey = new Map<string, true>();
  for (const rawId of input.unitIds) {
    const id = rawId.trim();
    if (id) mergedBySemanticKey.set(id, true);
  }
  for (const seg of input.segments) {
    const parent = seg.unitId?.trim();
    const key = parent && parent.length > 0 ? parent : seg.id;
    mergedBySemanticKey.set(key, true);
  }
  return mergedBySemanticKey.size;
}

export function segmentToView(
  row: LayerSegmentViewDocType,
  resolveText: (id: string) => string,
): TimelineUnitView {
  const ownerUnitId = (row.parentUnitId ?? row.unitId)?.trim() ?? '';
  return {
    id: row.id,
    kind: 'segment',
    layerRole: ownerUnitId ? 'referring' : 'independent',
    mediaId: row.mediaId ?? '',
    layerId: row.layerId ?? '',
    startTime: row.startTime,
    endTime: row.endTime,
    text: resolveText(row.id),
    ...(row.speakerId ? { speakerId: row.speakerId } : {}),
    ...(ownerUnitId ? { parentUnitId: ownerUnitId } : {}),
    ...(row.tags ? { tags: row.tags } : {}),
  };
}

/**
 * 纯显示路径下，把借来的 segment view 重新标记到当前可见 lane。
 * Re-scope borrowed segment views to the currently visible lane for display-only consumers.
 */
export function scopeTimelineUnitViewToLayer(view: TimelineUnitView, displayLayerId: string): TimelineUnitView {
  const normalizedDisplayLayerId = displayLayerId.trim();
  if (!normalizedDisplayLayerId || view.layerId === normalizedDisplayLayerId) return view;
  return {
    ...view,
    layerId: normalizedDisplayLayerId,
  };
}

/**
 * Builds a single read-model index for unit-first or segment-first projects.
 * Matches prior `useTranscriptionAiController` effective* row selection.
 */
export function buildTimelineUnitViewIndex(input: BuildTimelineUnitViewIndexInput): TimelineUnitViewIndex {
  const defaultLayerId = input.defaultTranscriptionLayerId?.trim() ?? '';
  const resolveText = (segmentId: string) => resolveSegmentText(
    segmentId,
    input.activeLayerIdForEdits,
    input.segmentContentByLayer,
  );

  const segmentRows = input.segmentsByLayer
    ? Array.from(input.segmentsByLayer.values()).flat()
    : [];
  const uniqueSegmentRows = Array.from(new Map(segmentRows.map((row) => [row.id, row])).values());

  const segmentViews = uniqueSegmentRows.map((row) => segmentToView(row, resolveText));
  const unitProjectViews = input.units.map((u) => unitToView(u, defaultLayerId));

  const fallbackToSegments = input.units.length === 0 && segmentViews.length > 0;
  const mergedBySemanticKey = new Map<string, TimelineUnitView>();
  for (const unitView of unitProjectViews) {
    mergedBySemanticKey.set(unitView.id, unitView);
  }
  for (const segmentView of segmentViews) {
    // Independent segments must keep distinct keys so multiple rows on one media are not collapsed
    // when legacy unit rows still exist for speaker overlap / import.
    const semanticKey = segmentView.kind === 'segment' && segmentView.layerRole === 'independent'
      ? segmentView.id
      : (segmentView.parentUnitId?.trim() || segmentView.id);
    // Segment rows shadow unit rows for the same semantic unit (referring / id-collision paths).
    mergedBySemanticKey.set(semanticKey, segmentView);
  }

  const allUnits = Array.from(mergedBySemanticKey.values())
    .sort((a, b) => (a.startTime !== b.startTime ? a.startTime - b.startTime : a.endTime - b.endTime));
  const currentMediaUnits = input.currentMediaId
    ? allUnits.filter((unit) => unit.mediaId === input.currentMediaId)
    : allUnits;

  const byId = new Map<string, TimelineUnitView>();
  const byLayerMutable = new Map<string, TimelineUnitView[]>();
  const referringByParentId = new Map<string, TimelineUnitView[]>();
  for (const unit of allUnits) {
    byId.set(unit.id, unit);
    const layerBucket = byLayerMutable.get(unit.layerId);
    if (layerBucket) layerBucket.push(unit);
    else byLayerMutable.set(unit.layerId, [unit]);
    if (unit.parentUnitId) {
      const referringBucket = referringByParentId.get(unit.parentUnitId);
      if (referringBucket) referringBucket.push(unit);
      else referringByParentId.set(unit.parentUnitId, [unit]);
    }
  }
  const laneReadScope = input.transcriptionLaneReadScope;
  if (laneReadScope && laneReadScope.transcriptionLayers.length > 0) {
    const layerById = new Map(laneReadScope.allLayersOrdered.map((l) => [l.id, l] as const));
    const transcriptionLaneIds = new Set(laneReadScope.transcriptionLayers.map((l) => l.id));
    const primaryUnscopedHostId = resolvePrimaryUnscopedTranscriptionHostId(
      laneReadScope.transcriptionLayers,
      input.defaultTranscriptionLayerId,
    );
    const laneLinks = laneReadScope.layerLinks ?? [];
    const currentMedia = input.currentMediaId?.trim() ?? '';
    const rawForLanes = input.units.filter((u) => {
      if (u.tags?.skipProcessing === true) return false;
      if (u.unitType === 'segment') return false;
      if (!currentMedia) return true;
      return (u.mediaId?.trim() ?? '') === currentMedia;
    });
    for (const lane of laneReadScope.transcriptionLayers) {
      for (const raw of rawForLanes) {
        const resolved = resolveCanonicalUnitForTranscriptionLaneRow({
          unit: raw,
          laneLayer: lane,
          layerById,
          transcriptionLaneIds,
          primaryUnscopedHostId,
          ...(laneLinks.length > 0 ? { layerLinks: laneLinks } : {}),
        });
        if (!resolved.include) continue;
        const v = unitToView(raw, lane.id);
        const existing = byLayerMutable.get(lane.id);
        if (existing?.some((x) => x.id === v.id && x.kind === 'unit' && x.layerId === v.layerId)) continue;
        if (existing) {
          existing.push(v);
        } else {
          byLayerMutable.set(lane.id, [v]);
        }
      }
    }
  }

  const byLayer = new Map<string, ReadonlyArray<TimelineUnitView>>();
  for (const [layerId, units] of byLayerMutable.entries()) {
    byLayer.set(layerId, units);
  }
  const emptyUnits: ReadonlyArray<TimelineUnitView> = [];
  const getReferringUnits = (independentUnitId: string): ReadonlyArray<TimelineUnitView> => {
    const normalizedId = independentUnitId.trim();
    if (!normalizedId) return emptyUnits;
    return referringByParentId.get(normalizedId) ?? emptyUnits;
  };
  const resolveBySemanticId = (semanticOrExactId: string): TimelineUnitView | undefined => {
    const normalized = semanticOrExactId.trim();
    if (!normalized) return undefined;
    return byId.get(normalized) ?? mergedBySemanticKey.get(normalized);
  };

  const totalCount = allUnits.length;
  const currentMediaCount = currentMediaUnits.length;

  const segmentsLoadComplete = input.segmentsLoadComplete !== false;

  return {
    allUnits,
    currentMediaUnits,
    byId,
    resolveBySemanticId,
    byLayer,
    getReferringUnits,
    totalCount,
    currentMediaCount,
    epoch: input.epoch ?? 0,
    fallbackToSegments,
    isComplete: segmentsLoadComplete,
  };
}

/** Minimal shape for `buildWaveformAnalysisPromptSummary` (time bounds + optional confidence). */
export function timelineUnitsToWaveformAnalysisRows(
  units: ReadonlyArray<TimelineUnitView>,
): Array<{ id: string; startTime: number; endTime: number; ai_metadata?: { confidence?: number } }> {
  return units.map((u) => ({
    id: u.id,
    startTime: u.startTime,
    endTime: u.endTime,
    ...(u.ai_metadata ? { ai_metadata: u.ai_metadata } : {}),
  }));
}
