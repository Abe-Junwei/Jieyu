import { afterEach, describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import {
  getSegmentTimelineFallbackDiagnosticsForTest,
  listSegmentTimelineUnitsForLayer,
  resetSegmentTimelineFallbackDiagnosticsForTest,
} from './timelineLaneSegmentIteration';

function createLayer(overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'key' | 'layerType'>): LayerDocType {
  const now = '2026-04-21T00:00:00.000Z';
  const base = {
    id: overrides.id,
    textId: 'text-1',
    key: overrides.key,
    name: { 'zh-CN': overrides.id, en: overrides.id },
    languageId: 'zh-CN',
    modality: 'text' as const,
    createdAt: now,
    updatedAt: now,
    layerType: overrides.layerType,
    constraint: 'symbolic_association' as const,
  };
  if (overrides.layerType === 'transcription') {
    return { ...base, ...overrides, layerType: 'transcription' };
  }
  return { ...base, ...overrides, layerType: 'translation' };
}

function createUnit(id: string, layerId: string): LayerUnitDocType {
  const now = '2026-04-21T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(() => {
  resetSegmentTimelineFallbackDiagnosticsForTest();
});

describe('listSegmentTimelineUnitsForLayer', () => {
  it('records a diagnostic event when source layer cannot be resolved and fallback is used', () => {
    const translation = createLayer({
      id: 'tl-1',
      key: 'tl1',
      layerType: 'translation',
      constraint: 'symbolic_association',
    });
    const layerById = new Map<string, LayerDocType>([[translation.id, translation]]);
    const fallbackUnits = [createUnit('u-1', translation.id)];

    const result = listSegmentTimelineUnitsForLayer(
      translation,
      layerById,
      new Map(),
      fallbackUnits,
    );

    expect(result).toEqual(fallbackUnits);
    expect(getSegmentTimelineFallbackDiagnosticsForTest()).toEqual({
      total: 1,
      lastEvent: {
        layerId: translation.id,
        layerType: 'translation',
        fallbackUnitsCount: 1,
      },
    });
  });
});
