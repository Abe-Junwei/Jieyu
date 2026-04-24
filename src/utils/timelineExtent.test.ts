import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC, resolveTimelineExtentSec } from './timelineExtent';

describe('resolveTimelineExtentSec', () => {
  it('uses logical span when no media URL', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: null,
      globalPlaybackReady: false,
      playerDuration: 99,
      documentSpanSec: 120,
    })).toBe(120);
  });

  it('uses max(media, logical) when URL present and globally playable', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: true,
      playerDuration: 100,
      documentSpanSec: 80,
    })).toBe(100);
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: true,
      playerDuration: 100,
      documentSpanSec: 200,
    })).toBe(200);
  });

  it('uses logical while URL present but not globally playable', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: false,
      playerDuration: 0,
      documentSpanSec: 60,
    })).toBe(60);
  });

  it('uses media when playable, logical unset, and media > 0', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:x',
      globalPlaybackReady: true,
      playerDuration: 90,
    })).toBe(90);
  });

  it('falls back to default document span when URL present but not playable and both logical and media are 0', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: 'blob:pending',
      globalPlaybackReady: false,
      playerDuration: 0,
    })).toBe(DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC);
  });

  it('falls back when no media URL and logical unset', () => {
    expect(resolveTimelineExtentSec({
      selectedMediaUrl: null,
      globalPlaybackReady: false,
      playerDuration: 0,
    })).toBe(DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC);
  });
});
