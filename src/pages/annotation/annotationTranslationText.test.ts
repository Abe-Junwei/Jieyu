import { describe, expect, it } from 'vitest';
import {
  pickAnnotationLayerText,
  pickAnnotationTranslationText,
} from './annotationTranslationText';

describe('pickAnnotationTranslationText', () => {
  it('keeps the first text row on a translation layer and skips audio', () => {
    const picked = pickAnnotationTranslationText({
      translationLayerIds: ['tl-1'],
      contents: [
        { unitId: 'uid-1', layerId: 'tl-1', modality: 'text', text: ' 你好 ' },
        { unitId: 'uid-1', layerId: 'tl-1', modality: 'text', text: 'older' },
        { unitId: 'uid-1', layerId: 'lane-1', modality: 'text', text: 'hello' },
        { unitId: 'uid-2', layerId: 'tl-1', modality: 'audio', text: 'spoken' },
        { unitId: 'uid-3', layerId: 'tl-1', modality: 'mixed', text: 'clip' },
      ],
    });
    expect(picked.get('uid-1')).toBe('你好');
    expect(picked.has('uid-2')).toBe(false);
    expect(picked.has('uid-3')).toBe(false);
  });

  it('keeps transcription-layer text off the translation map', () => {
    const source = pickAnnotationLayerText({
      layerIds: ['tx-1'],
      contents: [
        { unitId: 'uid-1', layerId: 'tx-1', modality: 'text', text: 'ŋa tɕhi' },
        { unitId: 'uid-1', layerId: 'ft-1', modality: 'text', text: 'Now that we have a son' },
      ],
    });
    const translation = pickAnnotationTranslationText({
      translationLayerIds: ['ft-1'],
      contents: [
        { unitId: 'uid-1', layerId: 'tx-1', modality: 'text', text: 'ŋa tɕhi' },
        { unitId: 'uid-1', layerId: 'ft-1', modality: 'text', text: 'Now that we have a son' },
      ],
    });
    expect(source.get('uid-1')).toBe('ŋa tɕhi');
    expect(translation.get('uid-1')).toBe('Now that we have a son');
  });

  it('does not fall through when the selected translation layer is empty', () => {
    const picked = pickAnnotationTranslationText({
      translationLayerIds: ['ft-empty'],
      contents: [
        { unitId: 'uid-1', layerId: 'ft-empty', modality: 'text', text: '   ' },
        { unitId: 'uid-1', layerId: 'ft-other', modality: 'text', text: 'other language' },
      ],
    });
    expect(picked.has('uid-1')).toBe(false);
  });

  it('returns nothing when no translation layer is in scope', () => {
    const picked = pickAnnotationTranslationText({
      translationLayerIds: [],
      contents: [{ unitId: 'uid-1', layerId: 'tl-1', text: '你好' }],
    });
    expect(picked.size).toBe(0);
  });
});
