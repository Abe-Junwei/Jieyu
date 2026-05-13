import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { buildTimelineUnitViewIndex } from '../hooks/transcription/timelineUnitView';

const coverageRelaxed = process.env.npm_lifecycle_event === 'test:coverage';

function buildUnits(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `utt-${index}`,
    textId: `text-${index}`,
    mediaId: index < count / 2 ? 'media-a' : 'media-b',
    startTime: index,
    endTime: index + 0.8,
    transcription: { default: `unit ${index}` },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

function transcriptionLayer(
  id: string,
  constraint: LayerDocType['constraint'],
  parentLayerId?: string,
): LayerDocType {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint,
    ...(typeof parentLayerId === 'string' && parentLayerId.trim().length > 0
      ? { parentLayerId }
      : {}),
  } as LayerDocType;
}

function buildUnitsOnMedia(count: number, mediaId: string): LayerUnitDocType[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `scope-utt-${index}`,
    textId: `text-${index}`,
    mediaId,
    unitType: 'unit',
    startTime: index,
    endTime: index + 0.8,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    transcription: { default: `unit ${index}` },
  }));
}

function shadowingSegmentsForUnits(
  count: number,
  layerId: string,
  mediaId: string,
): Map<string, LayerUnitDocType[]> {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `shadow-seg-${index}`,
    textId: 't1',
    mediaId,
    layerId,
    unitType: 'segment' as const,
    unitId: `scope-utt-${index}`,
    startTime: index,
    endTime: index + 0.8,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  return new Map([[layerId, rows]]);
}

describe('TimelineUnitViewIndex performance baseline', () => {
  it.each([
    [1_000, 80],
    [5_000, 250],
    [10_000, 500],
  ])('builds %i units under %ims on local baseline', (count, maxMs) => {
    const units = buildUnits(count);
    const startedAt = performance.now();
    const index = buildTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units.filter((item) => item.mediaId === 'media-a'),
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'media-a',
      activeLayerIdForEdits: 'layer-default',
      defaultTranscriptionLayerId: 'layer-default',
      segmentsLoadComplete: true,
    });
    const elapsed = performance.now() - startedAt;

    expect(index.totalCount).toBe(count);
    expect(elapsed).toBeLessThan(maxMs);

    // Warm repeat: catch obvious allocation/retention regressions on a second build.
    const warmStart = performance.now();
    const index2 = buildTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units.filter((item) => item.mediaId === 'media-a'),
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'media-a',
      activeLayerIdForEdits: 'layer-default',
      defaultTranscriptionLayerId: 'layer-default',
      segmentsLoadComplete: true,
    });
    const warmElapsed = performance.now() - warmStart;
    expect(index2.totalCount).toBe(count);
    expect(warmElapsed).toBeLessThan(maxMs);
  });

  it('builds with transcriptionLaneReadScope (3 lanes × current-media units) under baseline', () => {
    const unitCount = coverageRelaxed ? 400 : 900;
    const maxMs = coverageRelaxed ? 8_000 : 550;
    const parent = transcriptionLayer('tr-main', 'independent_boundary');
    const dep1 = transcriptionLayer('tr-dep1', 'symbolic_association', 'tr-main');
    const dep2 = transcriptionLayer('tr-dep2', 'symbolic_association', 'tr-main');
    const units = buildUnitsOnMedia(unitCount, 'media-a');
    const startedAt = performance.now();
    const index = buildTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units,
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'media-a',
      activeLayerIdForEdits: parent.id,
      defaultTranscriptionLayerId: parent.id,
      segmentsLoadComplete: true,
      transcriptionLaneReadScope: {
        transcriptionLayers: [parent, dep1, dep2],
        allLayersOrdered: [parent, dep1, dep2],
      },
    });
    const elapsed = performance.now() - startedAt;
    expect(index.totalCount).toBe(unitCount);
    expect(index.byLayer.get(dep1.id)?.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(maxMs);
  });

  it('builds segment-shadowed rows with lane read scope under baseline', () => {
    const n = coverageRelaxed ? 350 : 700;
    const maxMs = coverageRelaxed ? 10_000 : 900;
    const parent = transcriptionLayer('tr-shadow-main', 'independent_boundary');
    const dep = transcriptionLayer('tr-shadow-dep', 'symbolic_association', 'tr-shadow-main');
    const units = buildUnitsOnMedia(n, 'media-scope');
    const segmentsByLayer = shadowingSegmentsForUnits(n, 'layer-seg', 'media-scope');
    const startedAt = performance.now();
    const index = buildTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units,
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'media-scope',
      activeLayerIdForEdits: 'layer-seg',
      defaultTranscriptionLayerId: parent.id,
      segmentsLoadComplete: true,
      transcriptionLaneReadScope: {
        transcriptionLayers: [parent, dep],
        allLayersOrdered: [parent, dep],
      },
    });
    const elapsed = performance.now() - startedAt;
    expect(index.totalCount).toBe(n);
    expect(index.byLayer.get(dep.id)?.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(maxMs);
  });
});
