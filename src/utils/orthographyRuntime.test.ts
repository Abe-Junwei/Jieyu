import { describe, expect, it } from 'vitest';
import { resolveFallbackSourceOrthographyId } from './orthographyRuntime';

describe('resolveFallbackSourceOrthographyId', () => {
  it('returns the first transcription orthography when no layer is explicitly selected', () => {
    expect(resolveFallbackSourceOrthographyId({
      layers: [
        { layerType: 'translation', orthographyId: 'orth-target' },
        { layerType: 'transcription', orthographyId: ' orth-source ' },
      ],
      selectedLayerId: null,
    })).toBe('orth-source');
  });

  it('still returns the transcription orthography when a non-source layer is explicitly selected', () => {
    expect(resolveFallbackSourceOrthographyId({
      layers: [
        { layerType: 'transcription', orthographyId: 'orth-source' },
      ],
      selectedLayerId: 'layer-selected',
    })).toBe('orth-source');
  });

  it('returns undefined when the transcription orthography is empty', () => {
    expect(resolveFallbackSourceOrthographyId({
      layers: [
        { layerType: 'transcription', orthographyId: '   ' },
      ],
      selectedLayerId: '',
    })).toBeUndefined();
  });
});
