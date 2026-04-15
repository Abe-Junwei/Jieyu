import { describe, expect, it, vi } from 'vitest';
import {
  clearListUnitsSnapshotsForTests,
  createListUnitsSnapshot,
  getListUnitsSnapshot,
  LIST_UNITS_SNAPSHOT_TTL_MS,
} from './localContextListUnitsSnapshotStore';

describe('localContextListUnitsSnapshotStore', () => {
  it('stores and retrieves rows', () => {
    clearListUnitsSnapshotsForTests();
    const id = createListUnitsSnapshot([
      { id: 'a', kind: 'utterance', layerId: 'l', mediaId: 'm', startTime: 0, endTime: 1, transcription: 'x' },
    ], 3);
    const got = getListUnitsSnapshot(id);
    expect(got?.rows).toHaveLength(1);
    expect(got?.epoch).toBe(3);
  });

  it('drops entry after TTL', () => {
    clearListUnitsSnapshotsForTests();
    let t = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => t);
    try {
      const id = createListUnitsSnapshot([
        { id: 'a', kind: 'utterance', layerId: 'l', mediaId: 'm', startTime: 0, endTime: 1, transcription: 'x' },
      ]);
      expect(getListUnitsSnapshot(id)).not.toBeNull();
      t = 1_000_000 + LIST_UNITS_SNAPSHOT_TTL_MS + 1;
      expect(getListUnitsSnapshot(id)).toBeNull();
    } finally {
      spy.mockRestore();
      clearListUnitsSnapshotsForTests();
    }
  });
});
