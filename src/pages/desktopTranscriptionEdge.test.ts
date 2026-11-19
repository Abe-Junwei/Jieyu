import { describe, expect, it } from 'vitest';
import {
  dragTimeMs,
  edgeRejectKind,
  neighborTargets,
  parseTimecode,
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
