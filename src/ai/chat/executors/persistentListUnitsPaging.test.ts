import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeLocalContextToolCall } from '../localContextTools';
import {
  clearListUnitsSnapshotsForTests,
  getListUnitsHandle,
} from '../localContextListUnitsSnapshotStore';
import {
  createBoundedPageSelector,
  readPersistentListPageScanStats,
  resetPersistentListPageScanStats,
} from './segmentMetaListPage';
import { db } from '../../../db/engine';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import type { SegmentMetaDocType } from '../../../db/types';
import type { AiPromptContext } from '../chatDomain.types';

const NOW = '2026-11-19T00:00:00.000Z';
const PAGE = 20;
const COUNT = 530;
const MEDIA = 'media-a';
const OTHER_MEDIA = 'media-b';
const LAYER = 'layer-a';

interface SeedRow {
  id: string;
  segmentId: string;
  startTime: number;
  endTime: number;
  mediaId: string;
  textId?: string;
}

/**
 * Independent of the production comparator. time_asc / time_desc flip only startTime;
 * endTime, segmentId, then id stay ascending so ties match the existing stable list order.
 */
function compareSeed(left: SeedRow, right: SeedRow, sort: 'time_asc' | 'time_desc'): number {
  const start = left.startTime - right.startTime;
  if (start !== 0) return sort === 'time_desc' ? -start : start;
  if (left.endTime !== right.endTime) return left.endTime - right.endTime;
  const segment = left.segmentId.localeCompare(right.segmentId);
  if (segment !== 0) return segment;
  return left.id.localeCompare(right.id);
}

function synthesize(): { inScope: SeedRow[]; outOfScope: SeedRow[] } {
  const inScope: SeedRow[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const segmentId = `seg-${String(i).padStart(4, '0')}`;
    const startTime = i % 11 === 0 ? Math.floor(i / 2) : i;
    const endTime = startTime + (i % 5 === 0 ? 0 : 0.4);
    inScope.push({
      id: `${LAYER}::${segmentId}`,
      segmentId,
      startTime,
      endTime,
      mediaId: MEDIA,
    });
  }
  let state = 591;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state;
  };
  for (let i = inScope.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    const swap = inScope[i]!;
    inScope[i] = inScope[j]!;
    inScope[j] = swap;
  }
  const outOfScope: SeedRow[] = [10, 200, 400, 510].map((startTime, index) => ({
    id: `layer-b::other-${index}`,
    segmentId: `other-${index}`,
    startTime,
    endTime: startTime + 0.2,
    mediaId: OTHER_MEDIA,
  }));
  return { inScope, outOfScope };
}

function toDoc(row: SeedRow): SegmentMetaDocType {
  return {
    id: row.id,
    segmentId: row.segmentId,
    unitKind: 'segment',
    textId: row.textId ?? 'text-a',
    mediaId: row.mediaId,
    layerId: row.mediaId === MEDIA ? LAYER : 'layer-b',
    startTime: row.startTime,
    endTime: row.endTime,
    text: row.segmentId,
    normalizedText: row.segmentId,
    hasText: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function orderedIds(rows: readonly SeedRow[], sort: 'time_asc' | 'time_desc'): string[] {
  return [...rows]
    .sort((left, right) => compareSeed(left, right, sort))
    .map((row) => row.segmentId);
}

const seed = synthesize();
const ascIds = orderedIds(seed.inScope, 'time_asc');
const descIds = orderedIds(seed.inScope, 'time_desc');

function context(epoch = 4, mediaId = MEDIA): AiPromptContext {
  return {
    shortTerm: {
      currentMediaId: mediaId,
      timelineReadModelEpoch: epoch,
    },
    longTerm: {},
  };
}

async function listUnits(
  ref: { current: number },
  args: Record<string, unknown>,
  ctx: AiPromptContext = context(),
) {
  return executeLocalContextToolCall({ name: 'list_units', arguments: args }, ctx, ref, 80);
}

interface ListPayload {
  scope: string;
  total: number;
  count: number;
  offset: number;
  limit: number;
  sort: string;
  resultHandle?: string;
  snapshotPaging?: boolean;
  matches: Array<{ id: string; mediaId?: string }>;
  _readModel?: { source: string };
}

interface PageSample {
  offset: number;
  elapsedMs: number;
  cursorWalks: number;
  rowsVisited: number;
  ownershipReads: number;
  maxRetained: number;
}

const perfSamples: Array<Record<string, unknown>> = [];

function indexContext(count: number): AiPromptContext {
  return {
    shortTerm: {
      currentMediaId: MEDIA,
      timelineReadModelEpoch: 4,
      localUnitIndex: Array.from({ length: count }, (_, index) => ({
        id: `idx-${index}`,
        kind: 'segment' as const,
        mediaId: MEDIA,
        layerId: LAYER,
        textId: 'text-a',
        startTime: index,
        endTime: index + 0.1,
        text: `idx-${index}`,
      })),
    },
    longTerm: {},
  };
}

async function walkAsc(ctx: AiPromptContext = context()): Promise<{
  handle: string;
  elapsedMs: number;
  pages: PageSample[];
}> {
  const ref = { current: 0 };
  const started = performance.now();
  const seen: string[] = [];
  const pages: PageSample[] = [];
  let handle: string | undefined;
  let offset = 0;
  while (seen.length < ascIds.length) {
    resetPersistentListPageScanStats();
    const pageStarted = performance.now();
    const result = await listUnits(
      ref,
      {
        scope: 'current_track',
        limit: PAGE,
        offset,
        sort: 'time_asc',
        ...(handle ? { resultHandle: handle } : {}),
      },
      ctx,
    );
    const scan = readPersistentListPageScanStats();
    pages.push({
      offset,
      elapsedMs: Math.round(performance.now() - pageStarted),
      cursorWalks: scan.cursorWalks,
      rowsVisited: scan.rowsVisited,
      ownershipReads: scan.ownershipReads,
      maxRetained: scan.maxRetained,
    });
    expect(result.ok, result.error).toBe(true);
    const payload = payloadOf(result);
    if (!handle) {
      expect(typeof payload.resultHandle).toBe('string');
      handle = payload.resultHandle;
    }
    expect(payload.total).toBe(COUNT);
    expect(payload.offset).toBe(offset);
    expect(payload.matches.map((row) => row.id)).toEqual(ascIds.slice(offset, offset + PAGE));
    expect(scan.cursorWalks).toBe(1);
    expect(scan.maxRetained).toBeLessThanOrEqual(PAGE);
    if (payload.matches.length === 0) break;
    seen.push(...payload.matches.map((row) => row.id));
    offset += payload.matches.length;
  }
  expect(seen).toEqual(ascIds);
  expect(new Set(seen).size).toBe(COUNT);
  return { handle: handle ?? '', elapsedMs: performance.now() - started, pages };
}

function payloadOf(result: { ok: boolean; result: unknown }): ListPayload {
  return result.result as ListPayload;
}

describe('bounded list_units page selector', () => {
  it('retains at most one page while selecting 530 shuffled rows', () => {
    const first = createBoundedPageSelector<SeedRow>({
      sort: 'time_asc',
      after: null,
      limit: PAGE,
    });
    for (const row of seed.inScope) first.offer(row);
    const opened = first.finish();
    expect(opened.maxRetained).toBeLessThanOrEqual(PAGE);
    expect(opened.total).toBe(COUNT);
    expect(opened.page.map((row) => row.segmentId)).toEqual(ascIds.slice(0, PAGE));

    const cursor = opened.page[opened.page.length - 1]!;
    const next = createBoundedPageSelector<SeedRow>({
      sort: 'time_asc',
      after: {
        startTime: cursor.startTime,
        endTime: cursor.endTime,
        segmentId: cursor.segmentId,
        id: cursor.id,
      },
      limit: PAGE,
    });
    for (const row of seed.inScope) next.offer(row);
    const followed = next.finish();
    expect(followed.maxRetained).toBeLessThanOrEqual(PAGE);
    expect(followed.page.map((row) => row.segmentId)).toEqual(ascIds.slice(PAGE, PAGE * 2));
  });
});

describe('persistent list_units paging past the default offset cap', () => {
  let segmentMetaToArray = 0;
  let toArraySpy: { mockRestore: () => void } | undefined;

  beforeEach(async () => {
    clearListUnitsSnapshotsForTests();
    segmentMetaToArray = 0;
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.segment_meta.bulkAdd([...seed.inScope, ...seed.outOfScope].map(toDoc));
    const sample = db.segment_meta.toCollection();
    const proto = Object.getPrototypeOf(sample) as {
      toArray: (
        this: { _ctx?: { table?: { name?: string } } },
        ...args: unknown[]
      ) => Promise<unknown>;
    };
    const original = proto.toArray;
    toArraySpy = vi.spyOn(proto, 'toArray').mockImplementation(function toArraySpyImpl(
      this: { _ctx?: { table?: { name?: string } } },
      ...args: unknown[]
    ) {
      if (this._ctx?.table?.name === 'segment_meta') segmentMetaToArray += 1;
      return original.apply(this, args);
    });
  });

  afterEach(() => {
    toArraySpy?.mockRestore();
    clearListUnitsSnapshotsForTests();
    vi.restoreAllMocks();
  });

  // fake-indexeddb: 27 pages of 530 rows took 1449ms, slowest page 64ms, selector CPU 2ms.
  // 15s leaves CI cursor overhead without treating a multi-second page as success.
  it('walks every in-scope row once, in stable order, across pages past offset 500', async () => {
    const listAll = vi.spyOn(SegmentMetaService, 'listAll');
    const listByMediaId = vi.spyOn(SegmentMetaService, 'listByMediaId');
    const cpuStarted = performance.now();
    for (let page = 0; page < Math.ceil(COUNT / PAGE); page += 1) {
      const selector = createBoundedPageSelector<SeedRow>({
        sort: 'time_asc',
        after: null,
        limit: PAGE,
      });
      for (const row of seed.inScope) selector.offer(row);
      selector.finish();
    }
    const cpuMs = Math.round(performance.now() - cpuStarted);
    const walked = await walkAsc();
    perfSamples.push({
      case: 'empty-index-time-asc',
      rows: COUNT,
      elapsedMs: Math.round(walked.elapsedMs),
      cpuOnlyMsForSamePageCount: cpuMs,
      cursorWalks: walked.pages.reduce((sum, page) => sum + page.cursorWalks, 0),
      rowsVisited: walked.pages.reduce((sum, page) => sum + page.rowsVisited, 0),
      ownershipReads: walked.pages.reduce((sum, page) => sum + page.ownershipReads, 0),
      maxRetained: Math.max(...walked.pages.map((page) => page.maxRetained)),
      pages: walked.pages,
    });
    const ref = { current: 0 };
    const first = await listUnits(ref, {
      scope: 'current_track',
      limit: PAGE,
      offset: 0,
      sort: 'time_asc',
      resultHandle: walked.handle,
    });
    expect(payloadOf(first).snapshotPaging).toBe(true);
    expect(payloadOf(first)._readModel?.source).toBe('segment_meta');
    const trailing = await listUnits(ref, {
      scope: 'current_track',
      limit: PAGE,
      offset: COUNT,
      sort: 'time_asc',
      resultHandle: walked.handle,
    });
    expect(trailing.ok).toBe(true);
    expect(payloadOf(trailing).matches).toEqual([]);
    expect(payloadOf(trailing).offset).toBe(COUNT);
    expect(listAll).not.toHaveBeenCalled();
    expect(listByMediaId).not.toHaveBeenCalled();
    expect(segmentMetaToArray).toBe(0);
    const stored = getListUnitsHandle(walked.handle);
    expect(stored?.kind).toBe('query');
    if (stored?.kind === 'query') {
      expect(stored).not.toHaveProperty('rows');
      const mentioned = ascIds.filter((id) => JSON.stringify(stored).includes(id));
      expect(mentioned.length).toBeLessThanOrEqual(1);
    }
  }, 15_000);

  it('walks time_desc without dropping tied start times', async () => {
    const ref = { current: 0 };
    const first = await listUnits(ref, {
      scope: 'current_track',
      limit: PAGE,
      offset: 0,
      sort: 'time_desc',
    });
    expect(first.ok).toBe(true);
    const handle = payloadOf(first).resultHandle;
    expect(typeof handle).toBe('string');
    const seen = payloadOf(first).matches.map((row) => row.id);
    let offset = seen.length;
    while (seen.length < COUNT) {
      const result = await listUnits(ref, {
        scope: 'current_track',
        limit: PAGE,
        offset,
        sort: 'time_desc',
        resultHandle: handle,
      });
      expect(result.ok, result.error).toBe(true);
      const page = payloadOf(result);
      expect(page.offset).toBe(offset);
      expect(page.matches.map((row) => row.id)).toEqual(descIds.slice(offset, offset + PAGE));
      if (page.matches.length === 0) break;
      seen.push(...page.matches.map((row) => row.id));
      offset += page.matches.length;
    }
    expect(seen).toEqual(descIds);
    expect(new Set(seen).size).toBe(COUNT);
  }, 15_000);

  it('keeps the no-handle offset cap and reaches past it only with the captured scope handle', async () => {
    const ref = { current: 0 };
    const clamped = await listUnits(ref, {
      scope: 'current_track',
      limit: 3,
      offset: 520,
      sort: 'time_asc',
    });
    expect(clamped.ok).toBe(true);
    const clampedPayload = payloadOf(clamped);
    expect(clampedPayload.offset).toBe(500);
    expect(clampedPayload.limit).toBe(3);
    expect(clampedPayload.matches.map((row) => row.id)).toEqual(ascIds.slice(500, 503));
    expect(typeof clampedPayload.resultHandle).toBe('string');

    const deep = await listUnits(ref, {
      resultHandle: clampedPayload.resultHandle,
      limit: 3,
      offset: 520,
      sort: 'time_asc',
      scope: 'project',
    });
    expect(deep.ok).toBe(true);
    const deepPayload = payloadOf(deep);
    expect(deepPayload.scope).toBe('current_track');
    expect(deepPayload.offset).toBe(520);
    expect(deepPayload.matches.map((row) => row.id)).toEqual(ascIds.slice(520, 523));
    expect(deepPayload.matches.some((row) => row.id.startsWith('other-'))).toBe(false);

    const switchedMedia = await listUnits(
      ref,
      {
        resultHandle: clampedPayload.resultHandle,
        limit: 3,
        offset: 0,
        sort: 'time_asc',
        scope: 'current_track',
      },
      context(4, OTHER_MEDIA),
    );
    expect(switchedMedia.ok).toBe(true);
    const switched = payloadOf(switchedMedia);
    expect(switched.scope).toBe('current_track');
    expect(switched.matches.map((row) => row.id)).toEqual(ascIds.slice(0, 3));
  }, 15_000);

  it('rejects an oversized page limit', async () => {
    const ref = { current: 0 };
    const result = await listUnits(ref, {
      scope: 'current_track',
      limit: 100,
      offset: 0,
      sort: 'time_asc',
    });
    expect(result.ok).toBe(true);
    const payload = payloadOf(result);
    expect(payload.limit).toBe(PAGE);
    expect(payload.matches).toHaveLength(PAGE);
  });

  it('returns invalid_or_expired_handle for an unknown token', async () => {
    const ref = { current: 0 };
    const bad = await listUnits(ref, {
      resultHandle: '00000000-0000-4000-8000-000000000000',
      limit: 5,
      offset: 0,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('invalid_or_expired_handle');
  });

  it('returns stale_list_handle when the timeline epoch changes', async () => {
    const ref = { current: 0 };
    const first = await listUnits(ref, {
      scope: 'current_track',
      limit: 5,
      offset: 0,
      sort: 'time_asc',
    });
    const handle = payloadOf(first).resultHandle;
    expect(typeof handle).toBe('string');
    const stale = await listUnits(
      ref,
      { resultHandle: handle, limit: 5, offset: 0, sort: 'time_asc' },
      context(99),
    );
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe('stale_list_handle');
  });

  it('expires the paging token on the same TTL as in-memory snapshots', async () => {
    let now = 1_700_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const ref = { current: 0 };
      const first = await listUnits(ref, {
        scope: 'current_track',
        limit: 5,
        offset: 0,
        sort: 'time_asc',
      });
      const handle = payloadOf(first).resultHandle;
      expect(typeof handle).toBe('string');
      now += 15 * 60 * 1000 + 1;
      const expired = await listUnits(ref, {
        resultHandle: handle,
        limit: 5,
        offset: 5,
        sort: 'time_asc',
      });
      expect(expired.ok).toBe(false);
      expect(expired.error).toBe('invalid_or_expired_handle');
    } finally {
      spy.mockRestore();
    }
  });

  it('pages all persisted rows when localUnitIndex has 1, 49, 50, or 51 rows', async () => {
    await db.segment_meta.bulkAdd(
      [1, 2, 3, 4, 5].map((n) =>
        toDoc({
          id: `${LAYER}::foreign-${n}`,
          segmentId: `foreign-${n}`,
          startTime: n * 17,
          endTime: n * 17 + 0.3,
          mediaId: MEDIA,
          textId: 'text-b',
        }),
      ),
    );
    const listAll = vi.spyOn(SegmentMetaService, 'listAll');
    const listByMediaId = vi.spyOn(SegmentMetaService, 'listByMediaId');
    let lastHandle = '';
    let lastCtx = indexContext(1);
    for (const indexCount of [1, 49, 50, 51]) {
      clearListUnitsSnapshotsForTests();
      const ctx = indexContext(indexCount);
      const walked = await walkAsc(ctx);
      lastHandle = walked.handle;
      lastCtx = ctx;
      perfSamples.push({
        case: `partial-index-${indexCount}`,
        rows: COUNT,
        indexRows: indexCount,
        elapsedMs: Math.round(walked.elapsedMs),
        cursorWalks: walked.pages.reduce((sum, page) => sum + page.cursorWalks, 0),
        rowsVisited: walked.pages.reduce((sum, page) => sum + page.rowsVisited, 0),
        ownershipReads: walked.pages.reduce((sum, page) => sum + page.ownershipReads, 0),
        maxRetained: Math.max(...walked.pages.map((page) => page.maxRetained)),
        pageCount: walked.pages.length,
        slowestPageMs: Math.max(...walked.pages.map((page) => page.elapsedMs)),
      });
      const stored = getListUnitsHandle(walked.handle);
      expect(stored?.kind).toBe('query');
      if (stored?.kind === 'query') {
        expect(stored.query.textId).toBe('text-a');
        expect(stored.query.mediaId).toBe(MEDIA);
        expect(stored).not.toHaveProperty('rows');
      }
    }
    const sticky = await listUnits(
      { current: 0 },
      {
        resultHandle: lastHandle,
        scope: 'project',
        limit: 3,
        offset: 0,
        sort: 'time_asc',
      },
      lastCtx,
    );
    expect(sticky.ok, sticky.error).toBe(true);
    const stickyPayload = payloadOf(sticky);
    expect(stickyPayload.scope).toBe('current_track');
    expect(stickyPayload.total).toBe(COUNT);
    expect(stickyPayload.matches.map((row) => row.id)).toEqual(ascIds.slice(0, 3));
    expect(stickyPayload.matches.some((row) => row.id.startsWith('foreign-'))).toBe(false);
    expect(stickyPayload.matches.some((row) => row.id.startsWith('idx-'))).toBe(false);
    resetPersistentListPageScanStats();
    const clampStarted = performance.now();
    const clamped = await listUnits(
      { current: 0 },
      { scope: 'current_track', limit: 3, offset: 520, sort: 'time_asc' },
      indexContext(1),
    );
    const clampScan = readPersistentListPageScanStats();
    perfSamples.push({
      case: 'cold-offset-520-clamped-to-500',
      elapsedMs: Math.round(performance.now() - clampStarted),
      ...clampScan,
    });
    expect(clampScan.cursorWalks).toBe(1);
    expect(clampScan.maxRetained).toBe(503);
    expect(clamped.ok).toBe(true);
    expect(payloadOf(clamped).offset).toBe(500);
    expect(payloadOf(clamped).matches.map((row) => row.id)).toEqual(ascIds.slice(500, 503));
    expect(listAll).not.toHaveBeenCalled();
    expect(listByMediaId).not.toHaveBeenCalled();
    expect(segmentMetaToArray).toBe(0);
  }, 30_000);

  it('keeps the in-memory row snapshot when segment_meta is empty', async () => {
    await db.segment_meta.clear();
    const ref = { current: 0 };
    const ctx = indexContext(51);
    const first = await listUnits(
      ref,
      { scope: 'current_track', limit: PAGE, offset: 0, sort: 'time_asc' },
      ctx,
    );
    expect(first.ok).toBe(true);
    const payload = payloadOf(first);
    expect(payload.total).toBe(51);
    expect(payload.matches.map((row) => row.id)).toEqual(
      Array.from({ length: PAGE }, (_, index) => `idx-${index}`),
    );
    expect(payload._readModel?.source).not.toBe('segment_meta');
    const handle = payload.resultHandle;
    expect(typeof handle).toBe('string');
    expect(getListUnitsHandle(handle ?? '')?.kind).toBe('rows');
    const later = await listUnits(
      ref,
      { resultHandle: handle, limit: 20, offset: 40, sort: 'time_asc', scope: 'project' },
      ctx,
    );
    expect(later.ok).toBe(true);
    const laterPayload = payloadOf(later);
    expect(laterPayload.scope).toBe('current_track');
    expect(laterPayload.offset).toBe(40);
    expect(laterPayload.matches.map((row) => row.id)).toEqual(
      Array.from({ length: 11 }, (_, index) => `idx-${40 + index}`),
    );
  });

  afterAll(() => {
    const payload = {
      engine: 'fake-indexeddb',
      note: 'fake-indexeddb wall time includes cursor overhead. cpuOnlyMsForSamePageCount is the selector alone. Sequential pages are one cursor walk; a cold offset inside the 500 cap is one walk that retains the window, then returns limit rows. startTime is not indexed.',
      samples: perfSamples,
    };
    try {
      writeFileSync(
        '/opt/cursor/artifacts/list-units-page-scan-perf.json',
        `${JSON.stringify(payload, null, 2)}\n`,
      );
    } catch {
      // Artifact directory is optional outside the cloud agent.
    }
  });
});
