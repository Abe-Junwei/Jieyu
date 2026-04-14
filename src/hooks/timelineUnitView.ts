import type { AiMetadata, LayerSegmentDocType, UtteranceDocType } from '../db';
import { pickDefaultTranscriptionText } from '../utils/transcriptionFormatters';
import type { TimelineUnitKind } from './transcriptionTypes';

/**
 * Unified timeline unit for read paths (AI, waveform digest, tools).
 * Write paths still branch on `kind` to the correct service.
 */
export interface TimelineUnitView {
  id: string;
  kind: TimelineUnitKind;
  layerRole?: 'independent' | 'referring';
  mediaId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  /** Primary line text for tools / digest (utterance default orthography or segment layer text). */
  text: string;
  /** Carried from utterance docs for waveform confidence / overlays. */
  ai_metadata?: AiMetadata;
  speakerId?: string;
  parentUtteranceId?: string;
  annotationStatus?: string;
  textId?: string;
}

export interface BuildTimelineUnitViewIndexInput {
  utterances: ReadonlyArray<UtteranceDocType>;
  utterancesOnCurrentMedia: ReadonlyArray<UtteranceDocType>;
  segmentsByLayer: ReadonlyMap<string, ReadonlyArray<LayerSegmentDocType>> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined;
  currentMediaId: string | undefined;
  activeLayerIdForEdits: string | undefined;
  /** Used as `layerId` for utterance-shaped rows when no per-row layer exists. */
  defaultTranscriptionLayerId: string | undefined;
  utteranceCount: number;
  /**
   * When false, segments may still be loading — tools should not treat empty index as authoritative.
   */
  segmentsLoadComplete?: boolean;
  /** Monotonic snapshot epoch from hook-level rebuilds. */
  epoch?: number;
}

export interface TimelineUnitViewIndex {
  /** Project-scoped rows for tools (same semantics as former effectiveProjectRows). */
  allUnits: ReadonlyArray<TimelineUnitView>;
  /** Current media rows for timeline digest / waveform bounds (former effectiveCurrentMediaRows). */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  /**
   * Union of ids from `allUnits` plus any `currentMediaUnits` ids missing there
   * (utterance-first project can show segment rows on the current track only).
   */
  byId: ReadonlyMap<string, TimelineUnitView>;
  /** Units grouped by layer id; each bucket follows `allUnits` time order. */
  byLayer: ReadonlyMap<string, ReadonlyArray<TimelineUnitView>>;
  /** Resolve referring units (typically segments) by independent unit id. */
  getReferringUnits: (independentUnitId: string) => ReadonlyArray<TimelineUnitView>;
  totalCount: number;
  currentMediaCount: number;
  epoch: number;
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

export function utteranceToView(u: UtteranceDocType, defaultLayerId: string): TimelineUnitView {
  return {
    id: u.id,
    kind: 'utterance',
    layerRole: 'independent',
    mediaId: u.mediaId ?? '',
    layerId: defaultLayerId,
    startTime: u.startTime,
    endTime: u.endTime,
    text: pickDefaultTranscriptionText(u.transcription),
    ...(u.ai_metadata ? { ai_metadata: u.ai_metadata } : {}),
    ...(u.speakerId ? { speakerId: u.speakerId } : {}),
    ...(u.annotationStatus ? { annotationStatus: u.annotationStatus } : {}),
    ...(u.textId ? { textId: u.textId } : {}),
  };
}

export function segmentToView(
  row: LayerSegmentDocType,
  resolveText: (id: string) => string,
): TimelineUnitView {
  return {
    id: row.id,
    kind: 'segment',
    layerRole: row.utteranceId ? 'referring' : 'independent',
    mediaId: row.mediaId,
    layerId: row.layerId,
    startTime: row.startTime,
    endTime: row.endTime,
    text: resolveText(row.id),
    ...(row.speakerId ? { speakerId: row.speakerId } : {}),
    ...(row.utteranceId ? { parentUtteranceId: row.utteranceId } : {}),
  };
}

/**
 * Builds a single read-model index for utterance-first or segment-first projects.
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
  const utteranceProjectViews = input.utterances.map((u) => utteranceToView(u, defaultLayerId));

  const fallbackToSegments = input.utterances.length === 0 && segmentViews.length > 0;
  const mergedBySemanticKey = new Map<string, TimelineUnitView>();
  for (const utteranceView of utteranceProjectViews) {
    mergedBySemanticKey.set(utteranceView.id, utteranceView);
  }
  for (const segmentView of segmentViews) {
    const semanticKey = segmentView.parentUtteranceId?.trim() || segmentView.id;
    // Segment rows shadow utterance rows for the same semantic unit.
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
    // Keep alias lookup for referring segments addressed by parent utterance id.
    if (unit.parentUtteranceId && !byId.has(unit.parentUtteranceId)) {
      byId.set(unit.parentUtteranceId, unit);
    }
    if (unit.parentUtteranceId) {
      const referringBucket = referringByParentId.get(unit.parentUtteranceId);
      if (referringBucket) referringBucket.push(unit);
      else referringByParentId.set(unit.parentUtteranceId, [unit]);
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

  const totalCount = allUnits.length;
  const currentMediaCount = currentMediaUnits.length;

  const segmentsLoadComplete = input.segmentsLoadComplete !== false;

  return {
    allUnits,
    currentMediaUnits,
    byId,
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
