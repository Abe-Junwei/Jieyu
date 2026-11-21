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
  keepCurrentDocumentSegmentMetaRows,
  loadScopedSegmentMetaRows,
  mapSegmentMetaRows,
  resolveExpectedTotalForScope,
  sortNormalizedUnitRows,
  resolveSegmentMetaScopeParams,
  resolveSegmentReadQueryScope,
  type NormalizedUnitRow,
} from './timelineExecutors';
import { readPersistentListUnitsPage } from './segmentMetaListPage';
import {
  createListUnitsQueryHandle,
  createListUnitsSnapshot,
  getListUnitsHandle,
  updateListUnitsQueryHandle,
  LIST_UNITS_SNAPSHOT_ROW_THRESHOLD,
  type ListUnitsPersistentQuery,
  type ListUnitsSnapshotRow,
} from '../localContextListUnitsSnapshotStore';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import type { NoteCategory, LayerUnitStatus } from '../../../db/types';
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
      const allDocumentRows = await SegmentMetaService.searchSegmentMeta({
        ...(segmentMetaScope.kind === 'layer_media'
          ? { layerId: segmentMetaScope.layerId, mediaId: segmentMetaScope.mediaId }
          : {}),
        ...(segmentMetaScope.kind === 'media' ? { mediaId: segmentMetaScope.mediaId } : {}),
        ...(segmentMetaScope.kind === 'all' ? { textId: segmentMetaScope.textId } : {}),
        ...(query.length > 0 ? { query } : {}),
        ...(speakerId ? { speakerId } : {}),
        ...(noteCategory ? { noteCategory: noteCategory as NoteCategory } : {}),
        ...(selfCertainty ? { selfCertainty: selfCertainty as UnitSelfCertainty } : {}),
        ...(annotationStatus ? { annotationStatus: annotationStatus as LayerUnitStatus } : {}),
        ...(typeof hasText === 'boolean' ? { hasText } : {}),
      });
      // 第 5 批：先只保留当前文稿的命中，再截 limit（FS-O2）；searchSegmentMeta 本就在内存里过滤，不多读库
      // Batch 5: keep current-document matches first, then apply the limit (FS-O2). searchSegmentMeta
      // already filters in memory, so dropping its limit reads no extra rows.
      const rows = (await keepCurrentDocumentSegmentMetaRows(allDocumentRows)).slice(0, limit);
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
    /** Rows are already one page. Do not clamp offset or slice again. */
    prepaged?: { offset: number; total: number };
  },
): LocalContextToolResult {
  const limit = normalizeLimit(args.limit, 8);
  const sort =
    normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';
  const offsetMax =
    opts.snapshotPaging || opts.resultHandle
      ? LIST_UNITS_SNAPSHOT_OFFSET_MAX
      : LIST_UNITS_DEFAULT_OFFSET_MAX;
  const offset = opts.prepaged ? opts.prepaged.offset : normalizeOffset(args.offset, 0, offsetMax);
  const normalized = opts.prepaged ? rowsUnsorted : sortNormalizedUnitRows(rowsUnsorted, sort);
  const matches = opts.prepaged ? normalized : normalized.slice(offset, offset + limit);
  const total = opts.prepaged ? opts.prepaged.total : normalized.length;
  const expectedTotal = resolveExpectedTotalForScope(context, scope);
  if (
    typeof expectedTotal === 'number' &&
    Number.isFinite(expectedTotal) &&
    total !== expectedTotal
  ) {
    if (import.meta.env.DEV) {
      log.warn('timeline unit count mismatch', {
        tool: 'list_units',
        total,
        expectedTotal,
      });
    }
    recordMetric({
      id: 'ai.timeline_unit_count_mismatch',
      value: 1,
      tags: createMetricTags('localContextTools', {
        source: 'list_units',
        scope,
        total,
        expectedTotal,
      }),
    });
  }

  const result: Record<string, unknown> = {
    scope,
    count: matches.length,
    total,
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

function readListUnitsSort(args: Record<string, unknown>): 'time_asc' | 'time_desc' {
  return normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';
}

function readPersistentOffset(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

function persistentListQuery(
  context: AiPromptContext,
  scope: LocalUnitScope,
): ListUnitsPersistentQuery | null {
  const resolved = resolveSegmentReadQueryScope(context, scope);
  if (!resolved) return null;
  // textId comes only from this resolver (workspaceTextId first).
  return {
    ...(resolved.textId ? { textId: resolved.textId } : {}),
    ...(resolved.mediaId ? { mediaId: resolved.mediaId } : {}),
    ...(resolved.layerId ? { layerId: resolved.layerId } : {}),
  };
}

function persistentListUnitsResult(
  context: AiPromptContext,
  args: Record<string, unknown>,
  scope: LocalUnitScope,
  query: ListUnitsPersistentQuery,
  page: Awaited<ReturnType<typeof readPersistentListUnitsPage>>,
): LocalContextToolResult {
  const epoch = listUnitsEpoch(context);
  const sort = readListUnitsSort(args);
  const resultHandle =
    page.total > LIST_UNITS_SNAPSHOT_ROW_THRESHOLD
      ? createListUnitsQueryHandle({
          scope,
          query,
          sort,
          after: page.endKey,
          nextOffset: page.endOffset,
          ...(epoch !== undefined ? { epoch } : {}),
        })
      : undefined;
  return buildListUnitsPageResult(context, mapSegmentMetaRows(page.rows), args, scope, {
    ...(resultHandle ? { resultHandle, snapshotPaging: true } : {}),
    readModelSource: 'segment_meta',
    prepaged: { offset: page.offset, total: page.total },
  });
}

function listUnitsEpoch(context: AiPromptContext): number | undefined {
  const epoch = context.shortTerm?.timelineReadModelEpoch;
  return typeof epoch === 'number' && Number.isFinite(epoch) ? epoch : undefined;
}

export async function listUnits(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult> {
  let scope = normalizeUnitScope(args.scope, 'project');
  const handleArg = normalizeTextValue(args.resultHandle);
  if (handleArg.length > 0) {
    const entry = getListUnitsHandle(handleArg);
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
    if (entry.kind === 'rows') {
      return buildListUnitsPageResult(context, entry.rows as NormalizedUnitRow[], args, scope, {
        resultHandle: handleArg,
        snapshotPaging: true,
      });
    }
    if (entry.kind !== 'query') {
      const unreachable: never = entry;
      return unreachable;
    }
    const sort = readListUnitsSort(args);
    const limit = normalizeLimit(args.limit, 8);
    const offset = readPersistentOffset(args.offset);
    try {
      const page = await readPersistentListUnitsPage(entry.query, {
        sort,
        offset,
        limit,
        hint: entry.sort === sort ? { after: entry.after, nextOffset: entry.nextOffset } : null,
      });
      updateListUnitsQueryHandle(handleArg, {
        sort,
        after: page.endKey,
        nextOffset: page.endOffset,
      });
      return buildListUnitsPageResult(context, mapSegmentMetaRows(page.rows), args, scope, {
        resultHandle: handleArg,
        snapshotPaging: true,
        readModelSource: 'segment_meta',
        prepaged: { offset: page.offset, total: page.total },
      });
    } catch {
      return { ok: false, name: 'list_units', result: null, error: 'data_loading' };
    }
  }

  const query = persistentListQuery(context, scope);
  const indexCount = loadNormalizedUnitRows(context).length;
  // segment_meta wins whenever it has rows, including when localUnitIndex holds only
  // 1..51 of them. An empty persistence table leaves the in-memory snapshot contract alone.
  const probePersistedScope =
    indexCount > 0 && SegmentMetaService.listUnitsPersistentProbe === true;
  if (query && (indexCount === 0 || probePersistedScope)) {
    try {
      const sort = readListUnitsSort(args);
      const limit = normalizeLimit(args.limit, 8);
      const offset = normalizeOffset(args.offset, 0, LIST_UNITS_DEFAULT_OFFSET_MAX);
      const page = await readPersistentListUnitsPage(query, { sort, offset, limit });
      if (indexCount === 0 || page.total > 0) {
        return persistentListUnitsResult(context, args, scope, query, page);
      }
    } catch {
      // Dexie is unavailable in some unit tests; the legacy loader below still answers.
    }
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
