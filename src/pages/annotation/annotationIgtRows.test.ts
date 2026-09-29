import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import { buildAnnotationIgtRows } from './annotationIgtRows';

const now = '2026-09-29T00:00:00.000Z';

function unit(partial: Partial<LayerUnitDocType> & Pick<LayerUnitDocType, 'id'>): LayerUnitDocType {
  return {
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('buildAnnotationIgtRows surface', () => {
  it('reads the transcription-layer sentence as source and keeps the translation layer separate', () => {
    const rows = buildAnnotationIgtRows({
      units: [unit({ id: 'utt-1' })],
      tokens: [],
      textId: 'text-1',
      mediaId: '',
      surfaces: new Map([['utt-1', 'ŋa tɕhi']]),
      translations: new Map([['utt-1', 'Now that we have a son']]),
    });
    expect(rows[0]?.surface).toBe('ŋa tɕhi');
    expect(rows[0]?.translation).toBe('Now that we have a son');
    expect(rows[0]?.tokens).toEqual([]);
  });

  it('prefers the transcription layer language over a non-empty default gloss', () => {
    const rows = buildAnnotationIgtRows({
      units: [unit({ id: 'utt-1', layerId: 'layer-tr' })],
      tokens: [
        {
          id: 'tok-1',
          textId: 'text-1',
          unitId: 'utt-1',
          form: { default: 'default-form', bod: 'bod-form' },
          gloss: { default: 'default-gloss', bod: 'bod-gloss' },
          tokenIndex: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      textId: 'text-1',
      mediaId: '',
      languageId: 'bod',
    });
    expect(rows[0]?.tokens[0]?.form).toBe('bod-form');
    expect(rows[0]?.tokens[0]?.languageId).toBeUndefined();
    expect(rows[0]?.tokens[0]?.gloss).toBe('bod-gloss');
    expect(rows[0]?.tokens[0]?.glossLang).toBe('bod');
    expect(rows[0]?.transcriptionHref).toContain('layerId=layer-tr');
  });

  it('shows the speaker name and leaves the row blank when the unit has none', () => {
    const rows = buildAnnotationIgtRows({
      units: [unit({ id: 'utt-1', speakerId: 'spk-1' }), unit({ id: 'utt-2', startTime: 2 })],
      tokens: [],
      textId: 'text-1',
      mediaId: '',
      speakerNames: new Map([['spk-1', '白玛']]),
    });
    expect(rows[0]?.speakerName).toBe('白玛');
    expect(rows[1]?.speakerName).toBeUndefined();
  });

  it('uses the unit transcription when the transcription layer has no segment text', () => {
    const rows = buildAnnotationIgtRows({
      units: [unit({ id: 'utt-1', transcription: { default: 'ŋa tɕhi' } })],
      tokens: [],
      textId: 'text-1',
      mediaId: '',
      surfaces: new Map(),
      translations: new Map([['utt-1', 'Now that we have a son']]),
    });
    expect(rows[0]?.surface).toBe('ŋa tɕhi');
  });
});
