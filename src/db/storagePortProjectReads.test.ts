import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
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
});
