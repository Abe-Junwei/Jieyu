import { describe, expect, it } from 'vitest';
import { buildTimelineUnitViewIndex } from '../hooks/timelineUnitView';

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
});
