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
import { LIST_UNITS_DEFAULT_OFFSET_MAX, normalizeLimit } from './argNormalizers';

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

export interface PersistentListPageScanStats {
  /** Dexie cursor walks of the resolved segment_meta scope. */
  cursorWalks: number;
  /** Rows the cursor yielded, including rows outside the page. */
  rowsVisited: number;
  /** Calls that resolve which layers belong to another annotation document. */
  ownershipReads: number;
  /** Largest page buffer retained during the reads since the last reset. */
  maxRetained: number;
}

const scanStats: PersistentListPageScanStats = {
  cursorWalks: 0,
  rowsVisited: 0,
  ownershipReads: 0,
  maxRetained: 0,
};

export function resetPersistentListPageScanStats(): void {
  scanStats.cursorWalks = 0;
  scanStats.rowsVisited = 0;
  scanStats.ownershipReads = 0;
  scanStats.maxRetained = 0;
}

export function readPersistentListPageScanStats(): PersistentListPageScanStats {
  return { ...scanStats };
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
  scanStats.cursorWalks += 1;
  await collection.each((row) => {
    scanStats.rowsVisited += 1;
    visit(row);
  });
}

async function excludedLayerIdsFor(textIds: ReadonlySet<string>): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (textIds.size === 0) return excluded;
  const database = await getDb();
  for (const textId of textIds) {
    scanStats.ownershipReads += 1;
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
  excluded: ReadonlySet<string> | null,
  sort: ListUnitSort,
  after: ListUnitsQueryCursorKey | null,
  limit: number,
): Promise<{ page: SegmentMetaDocType[]; total: number; textIds: Set<string> }> {
  const textIds = new Set<string>();
  const selector = createBoundedPageSelector<SegmentMetaDocType>({ sort, after, limit });
  await forEachSegmentMeta(query, (row) => {
    if (!matchesQuery(row, query)) return;
    if (row.textId) textIds.add(row.textId);
    if (excluded?.has(row.layerId)) return;
    selector.offer(row);
  });
  const finished = selector.finish();
  if (finished.maxRetained > scanStats.maxRetained) scanStats.maxRetained = finished.maxRetained;
  return { page: finished.page, total: finished.total, textIds };
}

const SINGLE_PASS_WINDOW_MAX = LIST_UNITS_DEFAULT_OFFSET_MAX + 20;

/**
 * One sequential page is one scope cursor walk: `startTime` is not indexed, so the
 * next `limit` rows cannot be chosen without seeing the scope. A second walk happens
 * only when a layer actually belongs to another document. A cold offset inside the
 * no-handle cap is one walk that keeps that window, then returns `limit` rows.
 */
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

  const sort = options.sort;
  const limit = normalizeLimit(options.limit, 8);
  const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset)) : 0;
  let after: ListUnitsQueryCursorKey | null = null;
  let rank = 0;
  if (options.hint && options.hint.nextOffset >= 0 && options.hint.nextOffset <= offset) {
    after = options.hint.after;
    rank = options.hint.nextOffset;
  }

  let excluded: Set<string> | null = query.textId
    ? await excludedLayerIdsFor(new Set([query.textId]))
    : null;

  const emptyAt = (total: number) => ({
    rows: [] as SegmentMetaDocType[],
    total,
    offset,
    endKey: after,
    endOffset: rank,
  });

  const pageFrom = (
    rows: SegmentMetaDocType[],
    total: number,
    pageStart: number,
  ): {
    rows: SegmentMetaDocType[];
    total: number;
    offset: number;
    endKey: ListUnitsQueryCursorKey | null;
    endOffset: number;
  } => {
    if (rows.length === 0) return emptyAt(total);
    const last = rows[rows.length - 1]!;
    return {
      rows,
      total,
      offset,
      endKey: cursorKey(last),
      endOffset: pageStart + rows.length,
    };
  };

  async function scan(take: number, cursor: ListUnitsQueryCursorKey | null) {
    const first = await scanPage(query, excluded, sort, cursor, take);
    if (excluded) return first;
    excluded = await excludedLayerIdsFor(first.textIds);
    if (excluded.size === 0) return first;
    return scanPage(query, excluded, sort, cursor, take);
  }

  if (offset === rank) {
    const page = await scan(limit, after);
    if (offset >= page.total || page.page.length === 0) return emptyAt(page.total);
    return pageFrom(page.page, page.total, rank);
  }

  const window = offset - rank + limit;
  if (window <= SINGLE_PASS_WINDOW_MAX) {
    const selected = await scan(window, after);
    if (offset >= selected.total) return emptyAt(selected.total);
    const start = offset - rank;
    return pageFrom(selected.page.slice(start, start + limit), selected.total, offset);
  }

  const counted = await scan(0, after);
  if (offset >= counted.total) return emptyAt(counted.total);
  const skipChunk = normalizeLimit(20, 20);
  let guard = 0;
  while (rank < offset) {
    guard += 1;
    if (guard > counted.total) return emptyAt(counted.total);
    const step = Math.min(skipChunk, offset - rank);
    const skipped = await scan(step, after);
    if (skipped.page.length === 0) return emptyAt(skipped.total);
    after = cursorKey(skipped.page[skipped.page.length - 1]!);
    rank += skipped.page.length;
    if (skipped.page.length < step) return emptyAt(skipped.total);
  }
  const page = await scan(limit, after);
  if (page.page.length === 0) return emptyAt(page.total);
  return pageFrom(page.page, page.total, rank);
}
