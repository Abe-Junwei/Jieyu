import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import {
  buildLayerBundles,
  computeCanonicalLayerOrder,
  flattenLayerBundles,
  repairLayerOrder,
  resolveLayerDragGroup,
  resolveLayerDrop,
  validateLayerOrder,
} from './LayerOrderingService';

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
  const now = '2026-03-28T00:00:00.000Z';
  const { id, layerType, ...rest } = overrides;
  return {
    ...rest,
    id,
    textId: 'text-1',
    key: id,
    name: { zho: id },
    layerType,
    languageId: layerType === 'translation' ? 'eng' : 'zho',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('LayerOrderingService', () => {
  it('groups layers into bundles and flattens root -> dependent transcription -> translation', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childTrcA = makeLayer({ id: 'trc-a-child', layerType: 'transcription', constraint: 'symbolic_association', parentLayerId: rootA.id, sortOrder: 4 });
    const childTrlA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 5 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });

    const bundles = buildLayerBundles([rootA, childTrlA, rootB, childTrcA]);
    expect(bundles).toHaveLength(2);
    expect(flattenLayerBundles(bundles).map((layer) => layer.id)).toEqual([
      'trc-a',
      'trc-a-child',
      'trl-a',
      'trc-b',
    ]);
  });

  it('computes canonical order for newly appended dependent translation layers', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const newTranslation = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 2 });

    const ordered = computeCanonicalLayerOrder([rootA, rootB, newTranslation]);
    expect(ordered.map((layer) => layer.id)).toEqual(['trc-a', 'trc-b', 'trl-b']);
    expect(ordered.map((layer) => layer.sortOrder)).toEqual([0, 1, 2]);
  });

  it('moves an independent transcription root together with its whole bundle', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 1 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 3 });

    const resolved = resolveLayerDrop([rootA, childA, rootB, childB], rootA.id, 4);

    expect(resolved.changed).toBe(true);
    expect(resolved.layers.map((layer) => layer.id)).toEqual(['trc-b', 'trl-b', 'trc-a', 'trl-a']);
  });

  it('moves an upper bundle downward when dropped onto the next bundle start', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 1 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 3 });

    const resolved = resolveLayerDrop([rootA, childA, rootB, childB], rootA.id, 2);

    expect(resolved.changed).toBe(true);
    expect(resolved.layers.map((layer) => layer.id)).toEqual(['trc-b', 'trl-b', 'trc-a', 'trl-a']);
  });

  it('resolves a root drag group as the whole bundle', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childTrcA = makeLayer({ id: 'trc-a-child', layerType: 'transcription', constraint: 'symbolic_association', parentLayerId: rootA.id, sortOrder: 1 });
    const childTrlA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 2 });

    expect(resolveLayerDragGroup([rootA, childTrcA, childTrlA], rootA.id)).toEqual([
      rootA.id,
      childTrcA.id,
      childTrlA.id,
    ]);
    expect(resolveLayerDragGroup([rootA, childTrcA, childTrlA], childTrlA.id)).toEqual([childTrlA.id]);
  });

  it('reparents a dependent translation layer when dropped into another root bundle', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const translation = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 2 });

    const resolved = resolveLayerDrop([rootA, rootB, translation], translation.id, 3);

    const moved = resolved.layers.find((layer) => layer.id === translation.id);
    expect(resolved.changed).toBe(true);
    expect(moved?.parentLayerId).toBe(rootB.id);
    expect(resolved.layers.map((layer) => layer.id)).toEqual(['trc-a', 'trc-b', 'trl-a']);
    expect(resolved.message).toContain('翻译「trl-a」');
    expect(resolved.message).toContain('英语 eng');
    expect(resolved.message).toContain('依赖 转写「trc-b」');
  });

  it('allows dragging a higher dependent layer downward onto the next root bundle', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const translation = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 1 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });

    const resolved = resolveLayerDrop([rootA, translation, rootB], translation.id, 2);

    expect(resolved.changed).toBe(true);
    expect(resolved.layers.map((layer) => layer.id)).toEqual(['trc-a', 'trc-b', 'trl-a']);
    expect(resolved.layers.find((layer) => layer.id === translation.id)?.parentLayerId).toBe(rootB.id);
  });

  it('keeps downward dependent drop at next root when target index lands on following bundle boundary', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const translation = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 1 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });
    const rootC = makeLayer({ id: 'trc-c', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 3 });

    const resolved = resolveLayerDrop([rootA, translation, rootB, rootC], translation.id, 3);

    expect(resolved.changed).toBe(true);
    expect(resolved.layers.find((layer) => layer.id === translation.id)?.parentLayerId).toBe(rootB.id);
    expect(resolved.layers.map((layer) => layer.id)).toEqual(['trc-a', 'trc-b', 'trl-a', 'trc-c']);
  });

  it('validates non-canonical bundle order', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const childA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 2 });

    const issues = validateLayerOrder([rootA, rootB, childA]);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.layerId)).toEqual(['trc-b', 'trl-a']);
  });

  it('repairs non-canonical bundle order back to canonical sortOrder', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const childA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 2 });

    const repaired = repairLayerOrder([rootA, rootB, childA]);

    expect(repaired.layers.map((layer) => layer.id)).toEqual(['trc-a', 'trl-a', 'trc-b']);
    expect(repaired.layers.map((layer) => layer.sortOrder)).toEqual([0, 1, 2]);
    expect(repaired.repairs.map((item) => item.layerId)).toEqual(['trl-a', 'trc-b']);
  });
});