/**
 * timelineExecutors — Timeline data model, segment metadata, row normalization
 * Extracted from localContextToolExecutors.ts
 */

import type { TimelineUnitView } from '../../../hooks/timelineUnitView';
import type { AiPromptContext } from '../chatDomain.types';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import {
  listSegmentSummaries,
  type SegmentReadQueryScope,
  type SegmentSummary,
} from '../../queries/segmentReadQueries';
import type { SegmentMetaDocType } from '../../../db';
import type { LocalUnitScope } from '../localContextToolScopeNormalize';
import { normalizeTextValue } from './argNormalizers';

export function timelineViewsToNormalizedRows(
  views: ReadonlyArray<TimelineUnitView>,
): NormalizedUnitRow[] {
  return views.map((row) => {
    const legacy = row as TimelineUnitView & { transcription?: string };
    return {
      id: row.id,
      kind: row.kind,
      layerId: row.layerId,
      ...(row.textId !== undefined ? { textId: row.textId } : {}),
      ...(row.mediaId !== undefined ? { mediaId: row.mediaId } : {}),
      startTime: row.startTime,
      endTime: row.endTime,
      transcription: row.text ?? legacy.transcription ?? '',
      ...(row.speakerId !== undefined ? { speakerId: row.speakerId } : {}),
      ...(row.annotationStatus !== undefined ? { annotationStatus: row.annotationStatus } : {}),
    };
  });
}

export function filterRowsByScope(
  context: AiPromptContext,
  rows: NormalizedUnitRow[],
  scope: LocalUnitScope,
): NormalizedUnitRow[] {
  if (scope === 'project') return rows;

  let scoped = rows;
  const currentMediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
  if (currentMediaId.length > 0) {
    const onCurrentMedia = scoped.filter(
      (row) => normalizeTextValue(row.mediaId) === currentMediaId,
    );
    scoped = onCurrentMedia;
  }

  if (scope === 'current_scope') {
    const selectedLayerId = normalizeTextValue(context.shortTerm?.selectedLayerId);
    if (selectedLayerId.length > 0) {
      const byLayer = context.shortTerm?.timelineUnitsByLayerId;
      const bucket = byLayer?.get(selectedLayerId);
      if (bucket && bucket.length > 0) {
        let views = [...bucket];
        if (currentMediaId.length > 0) {
          views = views.filter((u) => normalizeTextValue(u.mediaId) === currentMediaId);
        }
        return timelineViewsToNormalizedRows(views);
      }
      const onSelectedLayer = scoped.filter(
        (row) => normalizeTextValue(row.layerId) === selectedLayerId,
      );
      scoped = onSelectedLayer;
    }
  }

  return scoped;
}

export function resolveExpectedTotalForScope(
  context: AiPromptContext,
  scope: LocalUnitScope,
): number | undefined {
  const projectTotal =
    context.longTerm?.projectStats?.unitCount ?? context.shortTerm?.projectUnitCount;
  if (scope === 'project') {
    return typeof projectTotal === 'number' && Number.isFinite(projectTotal)
      ? projectTotal
      : undefined;
  }

  if (scope === 'current_track') {
    const currentTrackTotal = context.shortTerm?.currentMediaUnitCount;
    return typeof currentTrackTotal === 'number' && Number.isFinite(currentTrackTotal)
      ? currentTrackTotal
      : undefined;
  }

  const currentScopeTotal = context.shortTerm?.currentScopeUnitCount;
  if (typeof currentScopeTotal === 'number' && Number.isFinite(currentScopeTotal))
    return currentScopeTotal;
  const currentTrackTotal = context.shortTerm?.currentMediaUnitCount;
  return typeof currentTrackTotal === 'number' && Number.isFinite(currentTrackTotal)
    ? currentTrackTotal
    : undefined;
}

export interface NormalizedUnitRow {
  id: string;
  kind: 'unit' | 'segment';
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
}

export function normalizedUnitRowsFromContext(
  context: AiPromptContext,
): NormalizedUnitRow[] | null {
  const rows = context.shortTerm?.localUnitIndex;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((row) => {
    const legacy = row as TimelineUnitView & { transcription?: string };
    return {
      id: row.id,
      kind: row.kind,
      layerId: row.layerId,
      ...(row.textId !== undefined ? { textId: row.textId } : {}),
      ...(row.mediaId !== undefined ? { mediaId: row.mediaId } : {}),
      startTime: row.startTime,
      endTime: row.endTime,
      transcription: row.text ?? legacy.transcription ?? '',
      ...(row.speakerId !== undefined ? { speakerId: row.speakerId } : {}),
      ...(row.annotationStatus !== undefined ? { annotationStatus: row.annotationStatus } : {}),
    };
  });
}

export function loadNormalizedUnitRows(context: AiPromptContext): NormalizedUnitRow[] {
  const fromContext = normalizedUnitRowsFromContext(context);
  if (fromContext) return fromContext;
  return [];
}

/** scope 解析结果 | Resolved segment_meta scope params */
type SegmentMetaScopeResolution =
  | { kind: 'layer_media'; layerId: string; mediaId: string }
  | { kind: 'media'; mediaId: string }
  | { kind: 'all' };

export function resolveSegmentMetaScopeParams(
  context: AiPromptContext,
  scope: LocalUnitScope,
): SegmentMetaScopeResolution | null {
  if (scope === 'current_scope') {
    const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
    const storageLayer = normalizeTextValue(context.shortTerm?.segmentMetaStorageLayerId);
    const displayLayer = normalizeTextValue(context.shortTerm?.selectedLayerId);
    const layerId = storageLayer.length > 0 ? storageLayer : displayLayer;
    if (layerId.length === 0 || mediaId.length === 0) return null;
    return { kind: 'layer_media', layerId, mediaId };
  }
  if (scope === 'current_track') {
    const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
    if (mediaId.length === 0) return null;
    return { kind: 'media', mediaId };
  }
  // project scope — 全量查询 | full table
  return { kind: 'all' };
}

export function mapSegmentMetaRows(rows: readonly SegmentMetaDocType[]): NormalizedUnitRow[] {
  return rows.map((row) => ({
    id: row.segmentId,
    kind: row.unitKind ?? 'segment',
    layerId: row.layerId,
    ...(row.textId ? { textId: row.textId } : {}),
    ...(row.mediaId ? { mediaId: row.mediaId } : {}),
    startTime: row.startTime,
    endTime: row.endTime,
    transcription: row.text,
    ...(row.effectiveSpeakerId ? { speakerId: row.effectiveSpeakerId } : {}),
    ...(row.annotationStatus ? { annotationStatus: row.annotationStatus } : {}),
  }));
}

export function resolveContextTextId(context: AiPromptContext): string | undefined {
  const directRows = loadNormalizedUnitRows(context);
  const directTextId = directRows.find((row) => normalizeTextValue(row.textId).length > 0)?.textId;
  return normalizeTextValue(directTextId) || undefined;
}

export function resolveSegmentReadQueryScope(
  context: AiPromptContext,
  scope: LocalUnitScope,
): SegmentReadQueryScope | null {
  const base = resolveSegmentMetaScopeParams(context, scope);
  if (!base) return null;
  const textId = resolveContextTextId(context);
  if (base.kind === 'layer_media') {
    return {
      ...(textId ? { textId } : {}),
      mediaId: base.mediaId,
      layerId: base.layerId,
    };
  }
  if (base.kind === 'media') {
    return {
      ...(textId ? { textId } : {}),
      mediaId: base.mediaId,
    };
  }
  return {
    ...(textId ? { textId } : {}),
  };
}

export function mapSegmentSummariesToRows(rows: readonly SegmentSummary[]): SegmentMetaDocType[] {
  return rows.map((row) => ({
    id: `${row.layerId}::${row.id}`,
    segmentId: row.id,
    unitKind: row.kind as Exclude<SegmentMetaDocType['unitKind'], undefined>,
    textId: row.textId ?? '',
    mediaId: row.mediaId ?? '',
    layerId: row.layerId,
    startTime: row.startTime,
    endTime: row.endTime,
    text: row.transcription,
    normalizedText: row.transcription.toLowerCase(),
    hasText: row.transcription.trim().length > 0,
    ...(row.speakerId ? { effectiveSpeakerId: row.speakerId } : {}),
    ...(row.annotationStatus
      ? {
          annotationStatus: row.annotationStatus as Exclude<
            SegmentMetaDocType['annotationStatus'],
            undefined
          >,
        }
      : {}),
    createdAt: '',
    updatedAt: '',
  }));
}

export async function listAllSegmentSummariesForScope(
  scope: SegmentReadQueryScope,
): Promise<SegmentSummary[]> {
  const pageSize = 100;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const rows: SegmentSummary[] = [];

  while (offset < total) {
    const page = await listSegmentSummaries(scope, pageSize, offset);
    total = page.total;
    if (page.segments.length === 0) break;
    rows.push(...page.segments);
    offset += page.segments.length;
  }

  return rows;
}

export async function loadScopedSegmentMetaRows(
  context: AiPromptContext,
  scope: LocalUnitScope,
): Promise<SegmentMetaDocType[] | null> {
  const queryScope = resolveSegmentReadQueryScope(context, scope);
  if (queryScope) {
    try {
      const summaries = await listAllSegmentSummariesForScope(queryScope);
      return mapSegmentSummariesToRows(summaries);
    } catch {
      // fall through to legacy SegmentMetaService path
    }
  }

  const resolution = resolveSegmentMetaScopeParams(context, scope);
  if (!resolution) return null;
  try {
    if (resolution.kind === 'layer_media') {
      // current_scope: rebuild 保证新鲜度，回退到 list | rebuild for freshness, fallback to list
      try {
        return await SegmentMetaService.rebuildForLayerMedia(
          resolution.layerId,
          resolution.mediaId,
        );
      } catch {
        try {
          return await SegmentMetaService.listByLayerMedia(resolution.layerId, resolution.mediaId);
        } catch {
          return null;
        }
      }
    }
    if (resolution.kind === 'media') {
      return await SegmentMetaService.listByMediaId(resolution.mediaId);
    }
    // kind === 'all' — project scope
    return await SegmentMetaService.listAll();
  } catch {
    return null;
  }
}

export function sortNormalizedUnitRows(
  rows: NormalizedUnitRow[],
  sort: 'time_asc' | 'time_desc',
): NormalizedUnitRow[] {
  return [...rows].sort((a, b) =>
    sort === 'time_desc' ? b.startTime - a.startTime : a.startTime - b.startTime,
  );
}
