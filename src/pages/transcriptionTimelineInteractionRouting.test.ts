import { describe, expect, it } from 'vitest';
import {
  clampPointerTimeToRegion,
  getNeighborBoundsRouted,
  resolveSubdivisionParentUnit,
  resolveWaveformSurfacePointerTime,
} from './transcriptionTimelineInteractionRouting';

function makeUnit(id: string, start: number, end: number, unitId?: string) {
  return {
    id,
    startTime: start,
    endTime: end,
    ...(unitId !== undefined ? { unitId } : {}),
  };
}

describe('transcriptionTimelineInteractionRouting', () => {
  it('falls back when wavesurfer is missing', () => {
    expect(
      resolveWaveformSurfacePointerTime({
        clientX: 40,
        fallbackTime: 1.5,
        ws: null,
        waveCanvas: null,
        tierScrollLeftPx: 0,
      }),
    ).toBe(1.5);
  });

  it('clamps mapped time to the owning region', () => {
    expect(
      clampPointerTimeToRegion(3, 'r1', [
        { id: 'r1', startTime: 1, endTime: 2 },
        { id: 'r2', startTime: 2, endTime: 4 },
      ]),
    ).toBe(2);
  });

  it('resolves subdivision parent from unitId then overlapping media unit', () => {
    const parent = makeUnit('parent', 0, 10);
    const child = makeUnit('child', 2, 3, 'parent');
    const byId = resolveSubdivisionParentUnit({
      segmentId: 'child',
      layerId: 'seg-layer',
      routing: {
        segmentSourceLayer: { id: 'seg-layer' } as never,
        sourceLayerId: 'seg-layer',
        editMode: 'time-subdivision',
      },
      segmentsByLayer: new Map([['seg-layer', [child]]]),
      unitsOnCurrentMedia: [parent],
    });
    expect(byId?.id).toBe('parent');

    const overlapping = resolveSubdivisionParentUnit({
      segmentId: 'orphan',
      layerId: 'seg-layer',
      proposedStart: 4,
      proposedEnd: 5,
      routing: {
        segmentSourceLayer: { id: 'seg-layer' } as never,
        sourceLayerId: 'seg-layer',
        editMode: 'time-subdivision',
      },
      segmentsByLayer: new Map([['seg-layer', [makeUnit('orphan', 4, 5)]]]),
      unitsOnCurrentMedia: [parent],
    });
    expect(overlapping?.id).toBe('parent');
  });

  it('routes neighbor bounds through subdivision parent clamp', () => {
    const parent = makeUnit('parent', 1, 4);
    const bounds = getNeighborBoundsRouted({
      itemId: 'child',
      mediaId: 'm1',
      probeStart: 0,
      layerId: 'seg-layer',
      routing: {
        segmentSourceLayer: { id: 'seg-layer' } as never,
        sourceLayerId: 'seg-layer',
        editMode: 'time-subdivision',
      },
      segmentsByLayer: new Map([['seg-layer', [makeUnit('child', 2, 3, 'parent')]]]),
      unitsOnCurrentMedia: [parent],
      getNeighborBounds: () => ({ left: 0, right: 99 }),
    });
    expect(bounds.left).toBe(1);
    expect(bounds.right).toBe(4);
  });
});
