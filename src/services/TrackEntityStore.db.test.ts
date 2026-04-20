import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { loadTrackEntityStateMapFromDb, saveTrackEntityStateToDb } from './TrackEntityStore';
import { trackEntityDocumentId } from '../db/trackEntityIds';

describe('TrackEntityStore (Dexie)', () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.dexie.open();
    await db.dexie.track_entities.clear();
  });

  it('does not cross-write when two texts reuse the same raw media id in the track key', async () => {
    const scopedA = 'text-a::media-1';
    const scopedB = 'text-b::media-1';
    await saveTrackEntityStateToDb('text-a', scopedA, {
      mode: 'single',
      laneLockMap: { lane: 1 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await saveTrackEntityStateToDb('text-b', scopedB, {
      mode: 'multi-auto',
      laneLockMap: { lane: 2 },
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const mapA = await loadTrackEntityStateMapFromDb('text-a');
    const mapB = await loadTrackEntityStateMapFromDb('text-b');

    expect(mapA[scopedA]?.mode).toBe('single');
    expect(mapA[scopedA]?.laneLockMap.lane).toBe(1);
    expect(mapB[scopedB]?.mode).toBe('multi-auto');
    expect(mapB[scopedB]?.laneLockMap.lane).toBe(2);
  });

  it('uses stable te: primary keys for bare track keys per text', async () => {
    await saveTrackEntityStateToDb('t1', 'm1', {
      mode: 'single',
      laneLockMap: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await saveTrackEntityStateToDb('t2', 'm1', {
      mode: 'multi-locked',
      laneLockMap: { x: 1 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const db = await getDb();
    const keys = (await db.dexie.track_entities.toArray()).map((r) => r.id).sort();
    expect(keys).toEqual([trackEntityDocumentId('t1', 'm1'), trackEntityDocumentId('t2', 'm1')].sort());
  });
});
