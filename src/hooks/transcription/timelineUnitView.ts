import type {
  AiMetadata,
  LayerDocType,
  LayerLinkDocType,
  LayerSegmentViewDocType,
  LayerUnitDocType,
} from '../../db';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import {
  buildTranscriptionLaneReadScopeResolutionCache,
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
} from '../../utils/transcriptionUnitLaneReadScope';
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
    layerLinks?: ReadonlyArray<
      Pick<
        LayerLinkDocType,
        'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'
      >
    >;
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

const UNBOUND_TIMELINE_MEDIA_ID = '__unknown_media__';

export function isUnboundTimelineMedia(mediaId: string): boolean {
  const id = mediaId.trim();
  return id.length === 0 || id === UNBOUND_TIMELINE_MEDIA_ID;
}

function resolveSegmentText(
  segmentId: string,
  activeLayerIdForEdits: string | undefined,
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined,
): string {
  const preferredLayer = activeLayerIdForEdits;
  const fromPreferred = preferredLayer
    ? segmentContentByLayer?.get(preferredLayer)?.get(segmentId)?.text
    : undefined;
  if (typeof fromPreferred === 'string' && fromPreferred.trim().length > 0)
    return fromPreferred.trim();
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
  segments: ReadonlyArray<{
    id: string;
    layerId: string;
    parentUnitId?: string | undefined;
    unitId?: string | undefined;
  }>;
}): number {
  const rows = input.segments.map((seg) => ({
    id: seg.id,
    layerId: seg.layerId,
    parentKey: (seg.parentUnitId ?? seg.unitId)?.trim() ?? '',
  }));
  // 被语段引用的父 unit 由语段代表（遮住）| a parent unit referenced by segments is shadowed by them
  const referencedParents = new Set(rows.map((row) => row.parentKey).filter(Boolean));
  const mergedBySemanticKey = new Map<string, true>();
  for (const rawId of input.unitIds) {
    const id = rawId.trim();
    if (id && !referencedParents.has(id)) mergedBySemanticKey.set(id, true);
  }
  const segmentSemanticKey = buildSegmentSemanticKeyResolver(rows);
  for (const row of rows) mergedBySemanticKey.set(segmentSemanticKey(row), true);
  return mergedBySemanticKey.size;
}

/**
 * WS8-X3：先按 (层, 父 unit) 数语段。某层在该父 unit 下只有 1 个语段（投影）时用父键，跨层合并并遮住
 * unit；有 2 个及以上（细分）时每个语段用自己的 id。结果与层的顺序无关，也不会丢语段。
 * WS8-X3: count segments per (layer, parent unit). A layer with exactly one segment under that parent
 * (a projection) uses the parent key, merging across layers and shadowing the unit; a layer with two or
 * more (a subdivision) keeps each segment's own id. Order-independent and never drops a segment.
 */
function buildSegmentSemanticKeyResolver(
  rows: ReadonlyArray<{ layerId: string; parentKey: string }>,
): (row: { id: string; layerId: string; parentKey: string }) => string {
  const perLayerParent = (row: { layerId: string; parentKey: string }) =>
    `${row.layerId}\u0000${row.parentKey}`;
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.parentKey.length === 0) continue;
    const key = perLayerParent(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (row) =>
    row.parentKey.length > 0 && counts.get(perLayerParent(row)) === 1 ? row.parentKey : row.id;
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
export function scopeTimelineUnitViewToLayer(
  view: TimelineUnitView,
  displayLayerId: string,
): TimelineUnitView {
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
export function buildTimelineUnitViewIndex(
  input: BuildTimelineUnitViewIndexInput,
): TimelineUnitViewIndex {
  const defaultLayerId = input.defaultTranscriptionLayerId?.trim() ?? '';
  const resolveText = (segmentId: string) =>
    resolveSegmentText(segmentId, input.activeLayerIdForEdits, input.segmentContentByLayer);

  const segmentRows = input.segmentsByLayer
    ? Array.from(input.segmentsByLayer.values()).flat()
    : [];
  const uniqueSegmentRows = Array.from(new Map(segmentRows.map((row) => [row.id, row])).values());

  const segmentViews = uniqueSegmentRows.map((row) => segmentToView(row, resolveText));
  const unitProjectViews = input.units.map((u) => unitToView(u, defaultLayerId));

  const fallbackToSegments = input.units.length === 0 && segmentViews.length > 0;
  const mergedBySemanticKey = new Map<string, TimelineUnitView>();
  const segmentKeyRows = segmentViews.map((view) => ({
    id: view.id,
    layerId: view.layerId,
    parentKey: view.parentUnitId?.trim() ?? '',
  }));
  // Segment rows shadow the unit rows they refer to (projection or subdivision alike).
  const referencedParents = new Set(segmentKeyRows.map((row) => row.parentKey).filter(Boolean));
  for (const unitView of unitProjectViews) {
    if (!referencedParents.has(unitView.id)) mergedBySemanticKey.set(unitView.id, unitView);
  }
  const segmentSemanticKey = buildSegmentSemanticKeyResolver(segmentKeyRows);
  segmentViews.forEach((segmentView, index) => {
    const semanticKey = segmentSemanticKey(segmentKeyRows[index]!);
    // Segment rows shadow unit rows for the same semantic unit (referring / id-collision paths).
    mergedBySemanticKey.set(semanticKey, segmentView);
  });

  const allUnits = Array.from(mergedBySemanticKey.values()).sort((a, b) =>
    a.startTime !== b.startTime ? a.startTime - b.startTime : a.endTime - b.endTime,
  );
  const currentMediaId = input.currentMediaId?.trim() ?? '';
  const currentMediaUnits =
    currentMediaId.length > 0
      ? allUnits.filter(
          (unit) => unit.mediaId === currentMediaId || isUnboundTimelineMedia(unit.mediaId),
        )
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
    const readScopeCache = buildTranscriptionLaneReadScopeResolutionCache({
      transcriptionLanes: laneReadScope.transcriptionLayers,
      layerById,
      transcriptionLaneIds,
      primaryUnscopedHostId,
      ...(laneLinks.length > 0 ? { layerLinks: laneLinks } : {}),
    });
    const currentMedia = input.currentMediaId?.trim() ?? '';
    const rawForLanes = input.units.filter((u) => {
      if (u.tags?.skipProcessing === true) return false;
      if (u.unitType === 'segment') return false;
      if (!currentMedia) return true;
      const mediaId = u.mediaId?.trim() ?? '';
      return mediaId === currentMedia || isUnboundTimelineMedia(mediaId);
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
          readScopeCache,
        });
        if (!resolved.include) continue;
        const v = unitToView(raw, lane.id);
        const existing = byLayerMutable.get(lane.id);
        if (existing?.some((x) => x.id === v.id && x.kind === 'unit' && x.layerId === v.layerId))
          continue;
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
export function timelineUnitsToWaveformAnalysisRows(units: ReadonlyArray<TimelineUnitView>): Array<{
  id: string;
  startTime: number;
  endTime: number;
  ai_metadata?: { confidence?: number };
}> {
  return units.map((u) => ({
    id: u.id,
    startTime: u.startTime,
    endTime: u.endTime,
    ...(u.ai_metadata ? { ai_metadata: u.ai_metadata } : {}),
  }));
}
