import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type LayerDocType, type TierDefinitionDocType } from '../db';
import { persistRepairedLayerConstraints } from './persistRepairedLayerConstraints';

const TEXT_ID = 'text-repair';
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

function transcription(
  overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'key' | 'createdAt'>,
): LayerDocType {
  return {
    textId: TEXT_ID,
    name: { zho: overrides.id, eng: overrides.id },
    layerType: 'transcription',
    languageId: 'zho',
    modality: 'text',
    constraint: 'independent_boundary',
    updatedAt: SEEDED_AT,
    ...overrides,
  };
}

const rootBefore = transcription({
  id: 'trc_root',
  key: 'trc_root',
  createdAt: '2026-01-01T00:00:00.000Z',
  constraint: 'symbolic_association',
  parentLayerId: 'missing',
});

const childBefore = transcription({
  id: 'trc_child',
  key: 'trc_child',
  createdAt: '2026-01-02T00:00:00.000Z',
  constraint: 'symbolic_association',
  parentLayerId: 'gone',
});

async function seed(layers: LayerDocType[]): Promise<void> {
  const jdb = await getDb();
  for (const layer of layers) {
    await jdb.collections.layers.insert(layer);
  }
}

async function readLayer(id: string): Promise<LayerDocType | undefined> {
  const jdb = await getDb();
  return (await jdb.collections.layers.findOne({ selector: { id } }).exec())?.toJSON();
}

async function readTier(id: string): Promise<TierDefinitionDocType | undefined> {
  const jdb = await getDb();
  return jdb.dexie.tier_definitions.get(id);
}

function treeParent(layer: LayerDocType | undefined): string | undefined {
  return layer?.layerType === 'transcription' ? layer.parentLayerId : undefined;
}

describe('persistRepairedLayerConstraints', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('writes both repaired layers and their tiers together', async () => {
    await seed([rootBefore, childBefore]);

    const result = await persistRepairedLayerConstraints({
      layers: [rootBefore, childBefore],
      layerLinks: [],
      locale: 'zh-CN',
    });

    expect(result.changedCount).toBe(2);
    expect(result.issues).toEqual([]);
    const root = await readLayer('trc_root');
    const child = await readLayer('trc_child');
    const rootTier = await readTier('trc_root');
    const childTier = await readTier('trc_child');

    expect(root?.constraint).toBe('independent_boundary');
    expect(treeParent(root)).toBeUndefined();
    expect(child?.constraint).toBe('symbolic_association');
    expect(treeParent(child)).toBe('trc_root');
    expect(root?.updatedAt).toBe(result.layers.find((layer) => layer.id === 'trc_root')?.updatedAt);
    expect(child?.updatedAt).toBe(root?.updatedAt);
    expect(root?.updatedAt).not.toBe(SEEDED_AT);
    expect(rootTier?.tierType).toBe('time-aligned');
    expect(rootTier?.parentTierId).toBeUndefined();
    expect(childTier?.tierType).toBe('symbolic-association');
    expect(childTier?.parentTierId).toBe('trc_root');
    expect(childTier?.updatedAt).toBe(child?.updatedAt);
  });

  it('rolls the first layer back when the second write fails', async () => {
    await seed([rootBefore, childBefore]);
    const jdb = await getDb();
    const insert = jdb.collections.layers.insert.bind(jdb.collections.layers);
    let calls = 0;
    const spy = vi.spyOn(jdb.collections.layers, 'insert').mockImplementation(async (doc) => {
      calls += 1;
      if (calls >= 2) throw new Error('second layer failed');
      return insert(doc);
    });

    try {
      await expect(
        persistRepairedLayerConstraints({
          layers: [rootBefore, childBefore],
          layerLinks: [],
          locale: 'zh-CN',
        }),
      ).rejects.toThrow('second layer failed');
    } finally {
      spy.mockRestore();
    }

    const root = await readLayer('trc_root');
    const child = await readLayer('trc_child');
    const rootTier = await readTier('trc_root');
    const childTier = await readTier('trc_child');
    expect(root?.constraint).toBe('symbolic_association');
    expect(treeParent(root)).toBe('missing');
    expect(root?.updatedAt).toBe(SEEDED_AT);
    expect(child?.constraint).toBe('symbolic_association');
    expect(treeParent(child)).toBe('gone');
    expect(child?.updatedAt).toBe(SEEDED_AT);
    expect(rootTier?.tierType).toBe('symbolic-association');
    expect(rootTier?.parentTierId).toBe('missing');
    expect(childTier?.tierType).toBe('symbolic-association');
    expect(childTier?.parentTierId).toBe('gone');
  });

  it('does not write when the constraint binding is already valid', async () => {
    const root = transcription({
      id: 'trc_root',
      key: 'trc_root',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const child = transcription({
      id: 'trc_child',
      key: 'trc_child',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await seed([root, child]);

    const result = await persistRepairedLayerConstraints({
      layers: [root, child],
      layerLinks: [],
      locale: 'zh-CN',
    });

    expect(result.changedCount).toBe(0);
    expect((await readLayer('trc_root'))?.updatedAt).toBe(SEEDED_AT);
    expect((await readLayer('trc_child'))?.constraint).toBe('independent_boundary');
  });
});
