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
}

export interface TimelineUnitViewIndex {
  /** Project-scoped rows for tools (same semantics as former effectiveProjectRows). */
  allUnits: ReadonlyArray<TimelineUnitView>;
  /** Current media rows for timeline digest / waveform bounds (former effectiveCurrentMediaRows). */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  byId: ReadonlyMap<string, TimelineUnitView>;
  totalCount: number;
  currentMediaCount: number;
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

function utteranceToView(u: UtteranceDocType, defaultLayerId: string): TimelineUnitView {
  return {
    id: u.id,
    kind: 'utterance',
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

function segmentToView(
  row: LayerSegmentDocType,
  resolveText: (id: string) => string,
): TimelineUnitView {
  return {
    id: row.id,
    kind: 'segment',
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
  const allUnits = fallbackToSegments ? segmentViews : utteranceProjectViews;

  const currentMediaId = input.currentMediaId;
  const segmentOnMedia = currentMediaId
    ? segmentViews.filter((v) => v.mediaId === currentMediaId)
    : segmentViews;

  const utteranceOnMediaViews = input.utterancesOnCurrentMedia.map((u) => utteranceToView(u, defaultLayerId));

  const currentMediaUnits = utteranceOnMediaViews.length > 0
    ? utteranceOnMediaViews
    : segmentOnMedia;

  const byId = new Map<string, TimelineUnitView>();
  for (const u of allUnits) {
    byId.set(u.id, u);
  }

  const totalCount = input.utteranceCount > 0 ? input.utteranceCount : allUnits.length;
  const currentMediaCount = currentMediaUnits.length;

  const segmentsLoadComplete = input.segmentsLoadComplete !== false;

  return {
    allUnits,
    currentMediaUnits,
    byId,
    totalCount,
    currentMediaCount,
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
