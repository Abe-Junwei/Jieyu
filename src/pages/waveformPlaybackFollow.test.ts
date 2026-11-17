import { describe, expect, it } from 'vitest';
import { findPlaybackFollowInterval } from './waveformPlaybackFollow';

describe('findPlaybackFollowInterval (#546)', () => {
  const items = [
    { id: 'long', startTime: 0, endTime: 10 },
    { id: 'short', startTime: 1, endTime: 2 },
    { id: 'later', startTime: 3, endTime: 4 },
  ];

  it('returns the shortest interval that still covers the playhead', () => {
    expect(findPlaybackFollowInterval(items, 1.5)?.id).toBe('short');
    expect(findPlaybackFollowInterval(items, 5)?.id).toBe('long');
  });

  it('returns undefined when nothing covers the time', () => {
    expect(findPlaybackFollowInterval(items, 11)).toBeUndefined();
  });
});
