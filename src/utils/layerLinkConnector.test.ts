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
  it('builds colored connector columns per bundle from structural parent relations', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childA = makeLayer({ id: 'trl-a', layerType: 'translation', parentLayerId: rootA.id, sortOrder: 1 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', parentLayerId: rootB.id, sortOrder: 3 });

    const layout = buildLayerLinkConnectorLayout([rootA, childA, rootB, childB], []);

    expect(layout.maxColumns).toBe(2);
    expect(layout.segmentsByLayerId[rootA.id]?.some((segment) => segment.colorIndex === 0)).toBe(true);
    expect(layout.segmentsByLayerId[childA.id]?.some((segment) => segment.colorIndex === 0)).toBe(true);
    expect(layout.segmentsByLayerId[rootB.id]?.some((segment) => segment.colorIndex === 1)).toBe(true);
    expect(layout.segmentsByLayerId[childB.id]?.some((segment) => segment.colorIndex === 1)).toBe(true);
  });

  it('keeps palette stable when resolving connector colors', () => {
    expect(getLayerLinkConnectorColors(0)).toEqual({
      base: 'rgba(14, 116, 144, 0.62)',
      active: 'rgba(8, 145, 178, 0.88)',
    });
    expect(getLayerLinkConnectorColors(6)).toEqual(getLayerLinkConnectorColors(0));
  });
});