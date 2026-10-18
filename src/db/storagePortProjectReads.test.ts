import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { storagePort } from './storagePort';

const NOW = '2026-10-18T00:00:00.000Z';

describe('storage port project reads', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.texts.bulkAdd([
      { id: 'text-a', title: { default: 'A' }, createdAt: NOW, updatedAt: NOW },
      { id: 'text-b', title: { default: 'B' }, createdAt: NOW, updatedAt: NOW },
    ]);
  });

  it('reads a project row back and ignores a blank id', async () => {
    await expect(storagePort().readProject('text-a')).resolves.toMatchObject({ id: 'text-a' });
    await expect(storagePort().readProject('missing')).resolves.toBeUndefined();
    await expect(storagePort().readProject('  ')).resolves.toBeUndefined();
  });

  it('lists rows owned by another project and skips missing ids', async () => {
    await db.layer_units.bulkPut([
      {
        id: 'unit-a',
        textId: 'text-a',
        layerId: 'layer-a',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'unit-b',
        textId: 'text-b',
        layerId: 'layer-b',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.tier_definitions.put({
      id: 'layer-b',
      textId: 'text-b',
      key: 'tx',
      name: { default: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    await db.media_items.put({
      id: 'media-b',
      textId: 'text-b',
      filename: 'b.wav',
      duration: 1,
      isOfflineCached: false,
      createdAt: NOW,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
    });

    await expect(
      storagePort().listForeignOwnedUnits(['unit-a', 'unit-b', 'gone'], 'text-a'),
    ).resolves.toEqual([{ id: 'unit-b', textId: 'text-b' }]);
    await expect(storagePort().listForeignOwnedLayers(['layer-b'], 'text-a')).resolves.toEqual([
      { id: 'layer-b', textId: 'text-b' },
    ]);
    await expect(storagePort().listForeignOwnedMedia(['media-b', ''], 'text-a')).resolves.toEqual([
      { id: 'media-b', textId: 'text-b' },
    ]);
    await expect(storagePort().listForeignOwnedUnits([], 'text-a')).resolves.toEqual([]);
  });

  it('writes a track entity and reads it back for that project only', async () => {
    const doc = {
      id: 'track-1',
      textId: 'text-a',
      mediaId: 'text-a::media-1',
      mode: 'multi-locked' as const,
      laneLockMap: { s1: 1 },
      updatedAt: NOW,
    };
    await storagePort().putTrackEntity(doc);
    await expect(storagePort().listTrackEntities('text-a')).resolves.toEqual([doc]);
    await expect(storagePort().listTrackEntities('text-b')).resolves.toEqual([]);
    await expect(storagePort().putTrackEntity({ ...doc, textId: 'text-b' })).rejects.toBeInstanceOf(
      CatalogOwnershipMismatchError,
    );
    const stored = await db.track_entities.get('track-1');
    expect(stored?.textId).toBe('text-a');
  });

  it('reads each overlapping track-entity write back against the row that call wrote', async () => {
    const writes = Array.from({ length: 8 }, (_, index) =>
      storagePort().putTrackEntity({
        id: 'track-race',
        textId: 'text-a',
        mediaId: 'text-a::media-1',
        mode: 'single',
        laneLockMap: { lane: index, other: 1 },
        updatedAt: `2026-01-01T00:00:0${index}.000Z`,
      }),
    );
    await expect(Promise.all(writes)).resolves.toHaveLength(8);
    await expect(db.track_entities.get('track-race')).resolves.toMatchObject({
      textId: 'text-a',
      mediaId: 'text-a::media-1',
    });
  });
});
