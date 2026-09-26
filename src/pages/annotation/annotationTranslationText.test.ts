import { describe, expect, it } from 'vitest';
import { pickAnnotationTranslationText } from './annotationTranslationText';

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

  it('returns nothing when no translation layer is in scope', () => {
    const picked = pickAnnotationTranslationText({
      translationLayerIds: [],
      contents: [{ unitId: 'uid-1', layerId: 'tl-1', text: '你好' }],
    });
    expect(picked.size).toBe(0);
  });
});
