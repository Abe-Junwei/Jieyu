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

/** Independent-boundary host segment row (merged segmentation graph) */
function createHostSegment(
  id: string,
  hostLayerId: string,
  parentUnitId: string,
): LayerUnitDocType {
  return {
    ...createUnit(id, hostLayerId),
    unitType: 'segment',
    unitId: parentUnitId,
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

    expect(result).toEqual([]);
    expect(getSegmentTimelineFallbackDiagnosticsForTest()).toEqual({
      total: 1,
      lastEvent: {
        layerId: translation.id,
        layerType: 'translation',
        fallbackUnitsCount: 0,
      },
    });
  });

  it('uses the host independent-boundary segment list for translation, not the unit-timeline fallback', () => {
    const host = createLayer({
      id: 'tr-host-1',
      key: 'tr1',
      layerType: 'transcription',
      constraint: 'independent_boundary',
    });
    const translation = createLayer({
      id: 'tl-1',
      key: 'tl1',
      layerType: 'translation',
    });
    const layerById = new Map<string, LayerDocType>([
      [host.id, host],
      [translation.id, translation],
    ]);
    const hostOnlySegment = createHostSegment('seg-1', host.id, 'u-parent-1');
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([[host.id, [hostOnlySegment]]]);
    // Many canonical units in the "viewport" — would be wrong if used as the translation row list
    const bigFallback: LayerUnitDocType[] = [createUnit('u-1', host.id), createUnit('u-2', host.id), createUnit('u-3', host.id)];
    const layerLinks = [
      {
        layerId: translation.id,
        transcriptionLayerKey: host.key,
        hostTranscriptionLayerId: host.id,
        isPreferred: true,
      },
    ];

    const result = listSegmentTimelineUnitsForLayer(
      translation,
      layerById,
      segmentsByLayer,
      bigFallback,
      host.id,
      layerLinks,
    );

    expect(result).toEqual([hostOnlySegment]);
    expect(getSegmentTimelineFallbackDiagnosticsForTest().total).toBe(0);
  });
});
