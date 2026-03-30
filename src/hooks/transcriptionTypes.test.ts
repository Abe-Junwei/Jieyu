import { describe, expect, it } from 'vitest';
import { resolveTimelineLayerIdFallback } from './transcriptionTypes';

describe('resolveTimelineLayerIdFallback', () => {
  it('prefers selectedLayerId when provided', () => {
    const result = resolveTimelineLayerIdFallback({
      selectedLayerId: 'layer-selected',
      focusedLayerId: 'layer-focused',
      selectedTimelineUnitLayerId: 'layer-unit',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    });

    expect(result).toBe('layer-selected');
  });

  it('falls back in order: focused -> unit -> default -> first', () => {
    expect(resolveTimelineLayerIdFallback({
      selectedLayerId: '  ',
      focusedLayerId: 'layer-focused',
      selectedTimelineUnitLayerId: 'layer-unit',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-focused');

    expect(resolveTimelineLayerIdFallback({
      selectedLayerId: '',
      focusedLayerId: ' ',
      selectedTimelineUnitLayerId: 'layer-unit',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-unit');

    expect(resolveTimelineLayerIdFallback({
      selectedLayerId: '',
      focusedLayerId: '',
      selectedTimelineUnitLayerId: '',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-default');

    expect(resolveTimelineLayerIdFallback({
      selectedLayerId: '',
      focusedLayerId: '',
      selectedTimelineUnitLayerId: '',
      defaultTranscriptionLayerId: '',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-first');
  });

  it('trims whitespace around candidates', () => {
    const result = resolveTimelineLayerIdFallback({
      selectedLayerId: '  ',
      focusedLayerId: '  layer-focused  ',
    });

    expect(result).toBe('layer-focused');
  });

  it('returns empty string when all candidates are missing', () => {
    const result = resolveTimelineLayerIdFallback({});
    expect(result).toBe('');
  });
});
