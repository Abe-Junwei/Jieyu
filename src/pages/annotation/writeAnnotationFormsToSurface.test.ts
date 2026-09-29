import { describe, expect, it } from 'vitest';
import type { LayerUnitContentDocType } from '../../types/jieyuDbDocTypes';
import {
  joinAnnotationTokenForms,
  pickTranscriptionContentForWriteback,
  transcriptionMapWithSurface,
} from './writeAnnotationFormsToSurface';

const now = '2026-09-29T00:00:00.000Z';

function content(
  partial: Partial<LayerUnitContentDocType> & Pick<LayerUnitContentDocType, 'id'>,
): LayerUnitContentDocType {
  return {
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('writeAnnotationFormsToSurface', () => {
  it('joins token forms with spaces and drops blanks', () => {
    expect(joinAnnotationTokenForms([' ŋa ', '', ' tɕhi '])).toBe('ŋa tɕhi');
    expect(joinAnnotationTokenForms([' ', ''])).toBe('');
  });

  it('updates the transcription sentence the surface shows and leaves the translation row', () => {
    const transcription = content({
      id: 'tx-row',
      unitId: 'utt-1',
      layerId: 'tx-1',
      modality: 'text',
      text: 'old sentence',
    });
    const translation = content({
      id: 'ft-row',
      unitId: 'utt-1',
      layerId: 'ft-1',
      modality: 'text',
      text: 'a translation',
    });
    const picked = pickTranscriptionContentForWriteback(
      [translation, transcription],
      ['tx-1'],
      'utt-1',
    );
    expect(picked?.id).toBe('tx-row');
    expect(translation.text).toBe('a translation');
  });

  it('keeps other transcription languages when one key is replaced', () => {
    expect(transcriptionMapWithSurface({ default: 'old', zho: '旧' }, 'bod', 'ŋa tɕhi')).toEqual({
      default: 'old',
      zho: '旧',
      bod: 'ŋa tɕhi',
    });
  });
});
