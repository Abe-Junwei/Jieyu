import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import type { AiLocalToolReadModelMeta } from '../chatDomain.types';
import { normalizeUnitScope, type LocalUnitScope } from '../localContextToolScopeNormalize';
import { buildReadModelMetaWithSource } from './readModelMeta';
import {
  normalizeTextValue,
  tokenizeLocalSearchQuery,
  normalizeLimit,
  normalizeOffset,
  LIST_UNITS_SNAPSHOT_OFFSET_MAX,
  LIST_UNITS_DEFAULT_OFFSET_MAX,
} from './argNormalizers';
import {
  loadNormalizedUnitRows,
  filterRowsByScope,
  loadScopedSegmentMetaRows,
  mapSegmentMetaRows,
  resolveExpectedTotalForScope,
  sortNormalizedUnitRows,
  resolveSegmentMetaScopeParams,
  type NormalizedUnitRow,
} from './timelineExecutors';
import {
  createListUnitsSnapshot,
  getListUnitsSnapshot,
  LIST_UNITS_SNAPSHOT_ROW_THRESHOLD,
  type ListUnitsSnapshotRow,
} from '../localContextListUnitsSnapshotStore';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import type { NoteCategory, LayerUnitStatus } from '../../../db';
import type { UnitSelfCertainty } from '../../../utils/unitSelfCertainty';
import { createLogger } from '../../../observability/logger';
import { createMetricTags, recordMetric } from '../../../observability/metrics';

const log = createLogger('localContextTools');

export async function searchUnits(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const query = normalizeTextValue(args.query);
  const limit = normalizeLimit(args.limit);
  const speakerId = normalizeTextValue(args.speakerId) || undefined;
  const noteCategory = normalizeTextValue(args.noteCategory) || undefined;
  const selfCertainty = normalizeTextValue(args.selfCertainty) || undefined;
  const annotationStatus = normalizeTextValue(args.annotationStatus) || undefined;
  const hasText = typeof args.hasText === 'boolean' ? args.hasText : undefined;
  const hasStructuredFilter = Boolean(
    speakerId || noteCategory || selfCertainty || annotationStatus || typeof hasText === 'boolean',
  );

  const segmentMetaScope = resolveSegmentMetaScopeParams(context, scope);
  if (segmentMetaScope && (query.length > 0 || hasStructuredFilter)) {
    try {
      if (segmentMetaScope.kind === 'layer_media') {
        await SegmentMetaService.rebuildForLayerMedia(
          segmentMetaScope.layerId,
          segmentMetaScope.mediaId,
        );
      }
      const rows = await SegmentMetaService.searchSegmentMeta({
        ...(segmentMetaScope.kind === 'layer_media'
          ? { layerId: segmentMetaScope.layerId, mediaId: segmentMetaScope.mediaId }
          : {}),
        ...(segmentMetaScope.kind === 'media' ? { mediaId: segmentMetaScope.mediaId } : {}),
        ...(query.length > 0 ? { query } : {}),
        ...(speakerId ? { speakerId } : {}),
        ...(noteCategory ? { noteCategory: noteCategory as NoteCategory } : {}),
        ...(selfCertainty ? { selfCertainty: selfCertainty as UnitSelfCertainty } : {}),
        ...(annotationStatus ? { annotationStatus: annotationStatus as LayerUnitStatus } : {}),
        ...(typeof hasText === 'boolean' ? { hasText } : {}),
        limit,
      });
      const matches = mapSegmentMetaRows(rows);
      if (matches.length > 0 || loadNormalizedUnitRows(context).length === 0) {
        return {
          ok: true,
          name: 'search_units',
          result: {
            scope,
            query,
            count: matches.length,
            matches,
            _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
          },
        };
      }
    } catch {
      // fall through to timeline snapshot lookup
    }
  }

  if (query.length === 0) {
    const listFallback = await listUnits(context, args);
    return {
      ok: listFallback.ok,
      name: 'search_units',
      result: listFallback.ok
        ? {
            mode: 'list_fallback',
            ...(listFallback.result as Record<string, unknown>),
          }
        : listFallback.result,
      ...(listFallback.error ? { error: listFallback.error } : {}),
    };
  }

  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'search_units', result: null, error: 'data_loading' };
  }
  const rows = filterRowsByScope(context, allRows, scope);
  if (rows.length === 0) {
    return {
      ok: true,
      name: 'search_units',
      result: {
        scope,
        query,
        count: 0,
        matches: [],
      },
    };
  }
  const lowered = query.toLowerCase();
  const tokens = tokenizeLocalSearchQuery(query);

  const scoredMatches = rows
    .map((row) => {
      const text = row.transcription.toLowerCase();
      if (!text) return null;
      const phraseHit = text.includes(lowered);
      const tokenHitCount = tokens.reduce(
        (count, token) => (text.includes(token) ? count + 1 : count),
        0,
      );
      if (!phraseHit && tokenHitCount === 0) return null;
      const tokenScore = tokens.length > 0 ? tokenHitCount / tokens.length : 0;
      const score = (phraseHit ? 1 : 0) + tokenScore;
      return { row, score };
    })
    .filter((item): item is { row: NormalizedUnitRow; score: number } => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.startTime - b.row.startTime;
    })
    .slice(0, limit);

  const matches = scoredMatches.map((item) => item.row);

  return {
    ok: true,
    name: 'search_units',
    result: {
      scope,
      query,
      count: matches.length,
      matches,
      ranking: {
        strategy: 'hybrid_local',
      },
    },
  };
}

function buildListUnitsPageResult(
  context: AiPromptContext,
  rowsUnsorted: NormalizedUnitRow[],
  args: Record<string, unknown>,
  scope: LocalUnitScope,
  opts: {
    resultHandle?: string;
    snapshotPaging?: boolean;
    readModelSource?: AiLocalToolReadModelMeta['source'];
  },
): LocalContextToolResult {
  const limit = normalizeLimit(args.limit, 8);
  const offsetMax =
    opts.snapshotPaging || opts.resultHandle
      ? LIST_UNITS_SNAPSHOT_OFFSET_MAX
      : LIST_UNITS_DEFAULT_OFFSET_MAX;
  const offset = normalizeOffset(args.offset, 0, offsetMax);
  const sort =
    normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';
  const normalized = sortNormalizedUnitRows(rowsUnsorted, sort);
  const matches = normalized.slice(offset, offset + limit);
  const expectedTotal = resolveExpectedTotalForScope(context, scope);
  if (
    typeof expectedTotal === 'number' &&
    Number.isFinite(expectedTotal) &&
    normalized.length !== expectedTotal
  ) {
    if (import.meta.env.DEV) {
      log.warn('timeline unit count mismatch', {
        tool: 'list_units',
        total: normalized.length,
        expectedTotal,
      });
    }
    recordMetric({
      id: 'ai.timeline_unit_count_mismatch',
      value: 1,
      tags: createMetricTags('localContextTools', {
        source: 'list_units',
        scope,
        total: normalized.length,
        expectedTotal,
      }),
    });
  }

  const result: Record<string, unknown> = {
    scope,
    count: matches.length,
    total: normalized.length,
    offset,
    limit,
    sort,
    matches,
    ...(opts.readModelSource
      ? { _readModel: buildReadModelMetaWithSource(context, opts.readModelSource) }
      : {}),
  };
  if (opts.resultHandle) {
    result.resultHandle = opts.resultHandle;
  }
  if (opts.snapshotPaging) {
    result.snapshotPaging = true;
  }
  return {
    ok: true,
    name: 'list_units',
    result: result,
  };
}

export async function listUnits(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult> {
  let scope = normalizeUnitScope(args.scope, 'project');
  const handleArg = normalizeTextValue(args.resultHandle);
  if (handleArg.length > 0) {
    const entry = getListUnitsSnapshot(handleArg);
    if (!entry) {
      return { ok: false, name: 'list_units', result: null, error: 'invalid_or_expired_handle' };
    }
    scope = entry.scope ?? scope;
    const ctxEpoch = context.shortTerm?.timelineReadModelEpoch;
    if (
      typeof entry.epoch === 'number' &&
      Number.isFinite(entry.epoch) &&
      typeof ctxEpoch === 'number' &&
      Number.isFinite(ctxEpoch) &&
      entry.epoch !== ctxEpoch
    ) {
      return { ok: false, name: 'list_units', result: null, error: 'stale_list_handle' };
    }
    return buildListUnitsPageResult(context, entry.rows as NormalizedUnitRow[], args, scope, {
      resultHandle: handleArg,
      snapshotPaging: true,
    });
  }

  const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
  if (
    scopedSegmentMetaRows &&
    (scopedSegmentMetaRows.length > 0 || loadNormalizedUnitRows(context).length === 0)
  ) {
    const rows = mapSegmentMetaRows(scopedSegmentMetaRows);
    return buildListUnitsPageResult(context, rows, args, scope, {
      readModelSource: 'segment_meta',
    });
  }

  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'list_units', result: null, error: 'data_loading' };
  }
  const rows = filterRowsByScope(context, allRows, scope);
  if (rows.length === 0) {
    return buildListUnitsPageResult(context, rows, args, scope, {});
  }

  if (rows.length > LIST_UNITS_SNAPSHOT_ROW_THRESHOLD) {
    const epoch = context.shortTerm?.timelineReadModelEpoch;
    const newHandle = createListUnitsSnapshot(
      rows as ListUnitsSnapshotRow[],
      typeof epoch === 'number' && Number.isFinite(epoch) ? epoch : undefined,
      scope,
    );
    recordMetric({
      id: 'ai.list_units_snapshot_created',
      value: 1,
      tags: createMetricTags('localContextTools', {
        rowCount: rows.length,
      }),
    });
    return buildListUnitsPageResult(context, rows, args, scope, {
      resultHandle: newHandle,
      snapshotPaging: true,
    });
  }

  return buildListUnitsPageResult(context, rows, args, scope, {});
}
