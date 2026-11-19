/**
 * One page of persistent `list_units`.
 * The selector keeps at most `limit` rows. The handle stores a cursor, not the table.
 * Callers without a handle still clamp offset at LIST_UNITS_DEFAULT_OFFSET_MAX.
 */

import { getDb } from '../../../db/engine';
import type { SegmentMetaDocType } from '../../../db/types';
import { readOtherDocumentLayerIds } from '../../../services/annotationDocumentService';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import type {
  ListUnitsPersistentQuery,
  ListUnitsQueryCursorKey,
} from '../localContextListUnitsSnapshotStore';
import { normalizeLimit } from './argNormalizers';

export type ListUnitSort = 'time_asc' | 'time_desc';

export function compareListUnitPageKeys(
  left: ListUnitsQueryCursorKey,
  right: ListUnitsQueryCursorKey,
  sort: ListUnitSort,
): number {
  const start = left.startTime - right.startTime;
  if (start !== 0) return sort === 'time_desc' ? -start : start;
  if (left.endTime !== right.endTime) return left.endTime - right.endTime;
  const segment = left.segmentId.localeCompare(right.segmentId);
  if (segment !== 0) return segment;
  return left.id.localeCompare(right.id);
}

export function createBoundedPageSelector<T extends ListUnitsQueryCursorKey>(options: {
  sort: ListUnitSort;
  after: ListUnitsQueryCursorKey | null;
  limit: number;
}): {
  offer: (row: T) => void;
  finish: () => { page: T[]; total: number; maxRetained: number };
} {
  const limit = Math.max(0, Math.floor(options.limit));
  const page: T[] = [];
  let total = 0;
  let maxRetained = 0;
  let worstIndex = 0;

  const remember = () => {
    if (page.length > maxRetained) maxRetained = page.length;
  };

  return {
    offer(row: T) {
      total += 1;
      if (options.after && compareListUnitPageKeys(options.after, row, options.sort) >= 0) {
        return;
      }
      if (limit === 0) return;
      if (page.length < limit) {
        page.push(row);
        if (
          page.length === 1 ||
          compareListUnitPageKeys(row, page[worstIndex]!, options.sort) > 0
        ) {
          worstIndex = page.length - 1;
        }
        remember();
        return;
      }
      if (compareListUnitPageKeys(row, page[worstIndex]!, options.sort) >= 0) return;
      page[worstIndex] = row;
      worstIndex = 0;
      for (let index = 1; index < page.length; index += 1) {
        if (compareListUnitPageKeys(page[index]!, page[worstIndex]!, options.sort) > 0) {
          worstIndex = index;
        }
      }
      remember();
    },
    finish() {
      page.sort((left, right) => compareListUnitPageKeys(left, right, options.sort));
      return { page, total, maxRetained };
    },
  };
}

function cursorKey(row: SegmentMetaDocType): ListUnitsQueryCursorKey {
  return {
    startTime: row.startTime,
    endTime: row.endTime,
    segmentId: row.segmentId,
    id: row.id,
  };
}

function matchesQuery(row: SegmentMetaDocType, query: ListUnitsPersistentQuery): boolean {
  if (query.textId && row.textId !== query.textId) return false;
  if (query.mediaId && row.mediaId !== query.mediaId) return false;
  if (query.layerId && row.layerId !== query.layerId) return false;
  return true;
}

async function forEachSegmentMeta(
  query: ListUnitsPersistentQuery,
  visit: (row: SegmentMetaDocType) => void,
): Promise<void> {
  const database = await getDb();
  const table = database.dexie.segment_meta;
  const collection =
    query.layerId && query.mediaId
      ? table.where('[layerId+mediaId]').equals([query.layerId, query.mediaId])
      : query.mediaId
        ? table.where('mediaId').equals(query.mediaId)
        : query.textId
          ? table.where('textId').equals(query.textId)
          : table.toCollection();
  await collection.each((row) => {
    visit(row);
  });
}

async function excludedLayerIds(query: ListUnitsPersistentQuery): Promise<Set<string>> {
  const textIds = new Set<string>();
  await forEachSegmentMeta(query, (row) => {
    if (!matchesQuery(row, query)) return;
    if (row.textId) textIds.add(row.textId);
  });
  const excluded = new Set<string>();
  const database = await getDb();
  for (const textId of textIds) {
    try {
      for (const layerId of await readOtherDocumentLayerIds(database, textId)) {
        excluded.add(layerId);
      }
    } catch {
      // Same as keepCurrentDocumentSegmentMetaRows: a failed ownership lookup keeps the rows.
    }
  }
  return excluded;
}

async function scanPage(
  query: ListUnitsPersistentQuery,
  excluded: ReadonlySet<string>,
  sort: ListUnitSort,
  after: ListUnitsQueryCursorKey | null,
  limit: number,
): Promise<{ page: SegmentMetaDocType[]; total: number }> {
  const selector = createBoundedPageSelector<SegmentMetaDocType>({ sort, after, limit });
  await forEachSegmentMeta(query, (row) => {
    if (!matchesQuery(row, query)) return;
    if (excluded.has(row.layerId)) return;
    selector.offer(row);
  });
  const finished = selector.finish();
  return { page: finished.page, total: finished.total };
}

export async function readPersistentListUnitsPage(
  query: ListUnitsPersistentQuery,
  options: {
    sort: ListUnitSort;
    offset: number;
    limit: number;
    hint?: { after: ListUnitsQueryCursorKey | null; nextOffset: number } | null;
  },
): Promise<{
  rows: SegmentMetaDocType[];
  total: number;
  offset: number;
  endKey: ListUnitsQueryCursorKey | null;
  endOffset: number;
}> {
  if (query.layerId && query.mediaId) {
    try {
      await SegmentMetaService.rebuildForLayerMedia(query.layerId, query.mediaId);
    } catch {
      // Keep reading the stored rows when the freshness rebuild fails.
    }
  }

  const excluded = await excludedLayerIds(query);
  const sort = options.sort;
  const limit = normalizeLimit(options.limit, 8);
  const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset)) : 0;
  let after: ListUnitsQueryCursorKey | null = null;
  let rank = 0;
  if (options.hint && options.hint.nextOffset >= 0 && options.hint.nextOffset <= offset) {
    after = options.hint.after;
    rank = options.hint.nextOffset;
  }

  const emptyAt = (total: number) => ({
    rows: [] as SegmentMetaDocType[],
    total,
    offset,
    endKey: after,
    endOffset: rank,
  });

  if (offset === rank) {
    const page = await scanPage(query, excluded, sort, after, limit);
    if (offset >= page.total || page.page.length === 0) return emptyAt(page.total);
    const last = page.page[page.page.length - 1]!;
    return {
      rows: page.page,
      total: page.total,
      offset,
      endKey: cursorKey(last),
      endOffset: rank + page.page.length,
    };
  }

  const counted = await scanPage(query, excluded, sort, after, 0);
  if (offset >= counted.total) return emptyAt(counted.total);

  const skipChunk = normalizeLimit(20, 20);
  let guard = 0;
  while (rank < offset) {
    guard += 1;
    if (guard > counted.total) return emptyAt(counted.total);
    const step = Math.min(skipChunk, offset - rank);
    const skipped = await scanPage(query, excluded, sort, after, step);
    if (skipped.page.length === 0) return emptyAt(skipped.total);
    after = cursorKey(skipped.page[skipped.page.length - 1]!);
    rank += skipped.page.length;
    if (skipped.page.length < step) return emptyAt(skipped.total);
  }

  const page = await scanPage(query, excluded, sort, after, limit);
  if (page.page.length === 0) return emptyAt(page.total);
  const last = page.page[page.page.length - 1]!;
  return {
    rows: page.page,
    total: page.total,
    offset,
    endKey: cursorKey(last),
    endOffset: rank + page.page.length,
  };
}
