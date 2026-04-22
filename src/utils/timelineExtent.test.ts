import { describe, expect, it } from 'vitest';
import { resolveTimelineExtentSec } from './timelineExtent';

describe('resolveTimelineExtentSec', () => {
  it('uses logical span when no media URL', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: null,
      globalPlaybackReady: false,
      playerDuration: 99,
      logicalTimelineDurationSec: 120,
    })).toBe(120);
  });

  it('uses min(media, logical) when URL present and globally playable', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: true,
      playerDuration: 100,
      logicalTimelineDurationSec: 80,
    })).toBe(80);
  });

  it('uses logical while URL present but not globally playable', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: false,
      playerDuration: 0,
      logicalTimelineDurationSec: 60,
    })).toBe(60);
  });

  it('uses media when playable, logical unset, and media > 0', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: true,
      playerDuration: 90,
    })).toBe(90);
  });
});
