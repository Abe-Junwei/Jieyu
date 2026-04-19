import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import type { TrackEntityDocType } from '../types';
import { upgradeM42TrackEntityDocumentIds } from './m42TrackEntityDocumentIds';
import { trackEntityDocumentId } from '../trackEntityIds';

class TrackEntityTestDexie extends Dexie {
  track_entities!: Table<TrackEntityDocType, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      track_entities: 'id, textId, mediaId, [textId+mediaId]',
    });
  }
}

describe('upgradeM42TrackEntityDocumentIds', () => {
  it('rewrites legacy track_* ids to te:textId:trackKey', async () => {
    const name = `m42_track_entity_${Date.now()}`;
    const d = new TrackEntityTestDexie(name);
    await d.open();
    await d.track_entities.put({
      id: 'track_m1',
      textId: 'text-1',
      mediaId: 'text-1::m1',
      mode: 'single',
      laneLockMap: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await d.transaction('rw', d.track_entities, async (tx) => {
      await upgradeM42TrackEntityDocumentIds(tx);
    });

    const row = await d.track_entities.get(trackEntityDocumentId('text-1', 'text-1::m1'));
    expect(row?.id).toBe(trackEntityDocumentId('text-1', 'text-1::m1'));
    expect(await d.track_entities.get('track_m1')).toBeUndefined();
    await d.delete();
  });

  it('is a no-op when ids are already canonical', async () => {
    const name = `m42_track_entity_noop_${Date.now()}`;
    const d = new TrackEntityTestDexie(name);
    await d.open();
    const id = trackEntityDocumentId('t', 'k');
    await d.track_entities.put({
      id,
      textId: 't',
      mediaId: 'k',
      mode: 'single',
      laneLockMap: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await d.transaction('rw', d.track_entities, async (tx) => {
      await upgradeM42TrackEntityDocumentIds(tx);
    });
    expect(await d.track_entities.count()).toBe(1);
    expect((await d.track_entities.get(id))?.id).toBe(id);
    await d.delete();
  });
});
