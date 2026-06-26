import { describe, expect, it } from 'vitest';
import { buildEmptyTimelinePolicy } from './emptyTimelinePolicy';

describe('buildEmptyTimelinePolicy', () => {
  it('hides empty chrome when current media already has units', () => {
    expect(
      buildEmptyTimelinePolicy({
        layersCount: 2,
        hasSelectedMedia: true,
        currentMediaUnitCount: 3,
      }),
    ).toEqual({
      emptyReason: 'no_units_with_wave',
      primaryCta: 'none',
      showEmptyChrome: false,
    });
  });

  it('prefers create-layer CTA when no layers exist', () => {
    expect(
      buildEmptyTimelinePolicy({
        layersCount: 0,
        hasSelectedMedia: false,
        currentMediaUnitCount: 0,
      }),
    ).toEqual({
      emptyReason: 'no_layers',
      primaryCta: 'create_layer',
      showEmptyChrome: true,
    });
  });

  it('shows waveform drag hint when media exists but no units', () => {
    expect(
      buildEmptyTimelinePolicy({
        layersCount: 1,
        hasSelectedMedia: true,
        currentMediaUnitCount: 0,
      }),
    ).toEqual({
      emptyReason: 'no_units_with_wave',
      primaryCta: 'none',
      showEmptyChrome: true,
    });
  });
});
