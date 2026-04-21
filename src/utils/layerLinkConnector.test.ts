import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import { buildLayerLinkConnectorLayout, getLayerLinkConnectorColors } from './layerLinkConnector';

const NOW = '2026-03-28T00:00:00.000Z';

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
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
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

describe('layerLinkConnector', () => {
  it('builds connector columns strictly from bundle structure', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const childA1 = makeLayer({ id: 'trc-a-child', layerType: 'transcription', constraint: 'symbolic_association', parentLayerId: rootA.id, sortOrder: 1 });
    const childA2 = makeLayer({ id: 'trl-a', layerType: 'translation', sortOrder: 2 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 3 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', sortOrder: 4 });

    const hostLinks = [
      { layerId: childA2.id, transcriptionLayerKey: rootA.key, hostTranscriptionLayerId: rootA.id, isPreferred: true },
      { layerId: childB.id, transcriptionLayerKey: rootB.key, hostTranscriptionLayerId: rootB.id, isPreferred: true },
    ];
    const layout = buildLayerLinkConnectorLayout([rootA, childA1, childA2, rootB, childB], hostLinks);

    expect(layout.maxColumns).toBe(2);
    expect(layout.segmentsByLayerId[rootA.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childA1.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-middle' }]);
    expect(layout.segmentsByLayerId[childA2.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-end' }]);
    expect(layout.segmentsByLayerId[rootB.id]).toEqual([{ column: 1, colorIndex: 1, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childB.id]).toEqual([{ column: 1, colorIndex: 1, role: 'bundle-child-end' }]);
  });

  it('skips independent roots with no dependents; uses host links for translation bundle membership', () => {
    const rootA = makeLayer({ id: 'trc-a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 0 });
    const rootB = makeLayer({ id: 'trc-b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 });
    const childB = makeLayer({ id: 'trl-b', layerType: 'translation', sortOrder: 2 });

    const layout = buildLayerLinkConnectorLayout(
      [rootA, rootB, childB],
      [{ layerId: childB.id, transcriptionLayerKey: rootB.key, hostTranscriptionLayerId: rootB.id, isPreferred: true }],
    );

    expect(layout.maxColumns).toBe(1);
    expect(layout.segmentsByLayerId[rootA.id]).toBeUndefined();
    expect(layout.segmentsByLayerId[rootB.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-root' }]);
    expect(layout.segmentsByLayerId[childB.id]).toEqual([{ column: 0, colorIndex: 0, role: 'bundle-child-end' }]);
  });

  it('keeps palette stable when resolving connector colors', () => {
    expect(getLayerLinkConnectorColors(0)).toEqual({
      base: 'color-mix(in srgb, var(--state-info-solid) 62%, transparent)',
      active: 'color-mix(in srgb, var(--state-info-solid) 88%, transparent)',
    });
    expect(getLayerLinkConnectorColors(6)).toEqual(getLayerLinkConnectorColors(0));
  });
});