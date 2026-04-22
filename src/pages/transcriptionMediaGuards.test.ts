import { describe, expect, it } from 'vitest';
import { canDeleteCurrentAudio, hasSelectedMediaUrl } from './transcriptionMediaGuards';

describe('transcriptionMediaGuards', () => {
  it('treats null/blank url as unavailable media payload', () => {
    expect(hasSelectedMediaUrl(null)).toBe(false);
    expect(hasSelectedMediaUrl('')).toBe(false);
    expect(hasSelectedMediaUrl('   ')).toBe(false);
  });

  it('requires both selected timeline media row and playable url for delete-audio capability', () => {
    expect(canDeleteCurrentAudio({
      hasSelectedTimelineMedia: false,
      selectedMediaUrl: 'blob:demo',
    })).toBe(false);

    expect(canDeleteCurrentAudio({
      hasSelectedTimelineMedia: true,
      selectedMediaUrl: null,
    })).toBe(false);

    expect(canDeleteCurrentAudio({
      hasSelectedTimelineMedia: true,
      selectedMediaUrl: 'blob:demo',
    })).toBe(true);
  });
});
