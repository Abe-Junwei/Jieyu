import { describe, expect, it } from 'vitest';
import {
  cycleEdge,
  dragTimeMs,
  edgeFocusKind,
  edgeRejectKind,
  neighborTargets,
  parseTimecode,
  selectedPair,
  snapEdgeMs,
  touchingPair,
} from './desktopTranscriptionEdge';

const units = [
  { id: 'a', startMs: 0, endMs: 1000 },
  { id: 'b', startMs: 1000, endMs: 2000 },
  { id: 'c', startMs: 2500, endMs: 3000 },
];

describe('desktop transcription edge math', () => {
  it('parses a finished timecode and leaves a short one alone', () => {
    expect(parseTimecode('00:01:10.200')).toBe(70200);
    expect(parseTimecode('00:01:14.')).toBeNull();
    expect(parseTimecode('00:01:60.000')).toBeNull();
  });

  it('snaps within 8px and leaves Alt alone', () => {
    expect(
      snapEdgeMs({
        timeMs: 1040,
        zoomPxPerSec: 100,
        neighborMs: [1000],
        playheadMs: null,
        alt: false,
      }).timeMs,
    ).toBe(1000);
    expect(
      snapEdgeMs({
        timeMs: 1040,
        zoomPxPerSec: 100,
        neighborMs: [1000],
        playheadMs: null,
        alt: true,
      }),
    ).toEqual({ timeMs: 1040, kind: null });
    expect(dragTimeMs(1000, 50, 100)).toBe(1500);
  });

  it('links only an edge that already touches its neighbor', () => {
    expect(touchingPair(units, 'a', 'end')).toEqual({
      leftId: 'a',
      rightId: 'b',
      timeMs: 1000,
    });
    expect(touchingPair(units, 'b', 'end')).toBeNull();
    expect(neighborTargets(units, ['a', 'b'])).toEqual([2500, 3000]);
  });

  it('names a rejection from the write error', () => {
    expect(edgeRejectKind('same speaker intervals overlap')).toBe('overlap');
    expect(edgeRejectKind('edge is outside the media')).toBe('outside');
    expect(edgeRejectKind('SQLITE_CONSTRAINT')).toBe('failed');
  });
});

describe('keyboard edge cycling', () => {
  it('goes start, end, shared with next, shared with previous, then wraps', () => {
    const seen: string[] = [];
    let current = null as ReturnType<typeof cycleEdge>;
    for (let i = 0; i < 5; i += 1) {
      current = cycleEdge(units, 'b', current);
      seen.push(edgeFocusKind(units, current!));
    }
    expect(seen).toEqual(['start', 'end', 'sharedPrev', 'start', 'end']);
    const middle = [
      { id: 'a', startMs: 0, endMs: 1000 },
      { id: 'b', startMs: 1000, endMs: 2000 },
      { id: 'c', startMs: 2000, endMs: 3000 },
    ];
    const kinds: string[] = [];
    current = null;
    for (let i = 0; i < 4; i += 1) {
      current = cycleEdge(middle, 'b', current);
      kinds.push(edgeFocusKind(middle, current!));
    }
    expect(kinds).toEqual(['start', 'end', 'sharedNext', 'sharedPrev']);
  });

  it('nudges the pair the shared selection names, not just the first touching one', () => {
    const middle = [
      { id: 'a', startMs: 0, endMs: 1000 },
      { id: 'b', startMs: 1000, endMs: 2000 },
      { id: 'c', startMs: 2000, endMs: 3000 },
    ];
    expect(selectedPair(middle, { unitId: 'b', edge: 'shared', otherId: 'a' })).toMatchObject({
      leftId: 'a',
      rightId: 'b',
    });
    expect(selectedPair(middle, { unitId: 'b', edge: 'shared', otherId: 'c' })).toMatchObject({
      leftId: 'b',
      rightId: 'c',
    });
  });
});
