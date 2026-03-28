import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import { buildLayerLinkConnectorLayout, getLayerLinkConnectorColors } from './layerLinkConnector';

const NOW = '2026-03-28T00:00:00.000Z';

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
  return {
    id: overrides.id,
    textId: 'text-1',
    key: overrides.id,
    name: { zho: overrides.id },
    layerType: overrides.layerType,
    languageId: overrides.layerType === 'translation' ? 'eng' : 'zho',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerDocType;
}

describe('layerLinkConnector', () => {
  it('builds connector columns strictly from bundle structure', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childA1 = makeLayer({ id: 'trc-a-child', layerType: 'transcription', constraint: 'symbolic_association', parentLayerId: rootA.id, sortOrder: 1 });
    const childA2 = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 2 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 3 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 4 });

    const layout = buildLayerLinkConnectorLayout([rootA, childA1, childA2, rootB, childB], []);

    expect(layout.maxColumns).toBe(2);
    expect(layout.segmentsByLayerId[rootA.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childA1.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-middle' }]);
    expect(layout.segmentsByLayerId[childA2.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-end' }]);
    expect(layout.segmentsByLayerId[rootB.id]).toEqual([{ column: 1, colorIndex: 1, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childB.id]).toEqual([{ column: 1, colorIndex: 1, role: 'bundle-child-end' }]);
  });

  it('ignores semantic layer links and skips bundles without dependents', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 2 });

    const layout = buildLayerLinkConnectorLayout(
      [rootA, rootB, childB],
      [{ transcriptionLayerKey: rootA.id, targetLayerId: childB.id }],
    );

    expect(layout.maxColumns).toBe(1);
    expect(layout.segmentsByLayerId[rootA.id]).toBeUndefined();
    expect(layout.segmentsByLayerId[rootB.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childB.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-end' }]);
  });

  it('keeps palette stable when resolving connector colors', () => {
    expect(getLayerLinkConnectorColors(0)).toEqual({
      base: 'rgba(14, 116, 144, 0.62)',
      active: 'rgba(8, 145, 178, 0.88)',
    });
    expect(getLayerLinkConnectorColors(6)).toEqual(getLayerLinkConnectorColors(0));
  });
});