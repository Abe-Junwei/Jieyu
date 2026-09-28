import { describe, expect, it } from 'vitest';
import {
  findMediaIdByFilename,
  findReimportUnitId,
  glossLanguageKey,
  matchUnitByAnnotationRef,
} from './eafImportAlign';

describe('eaf import alignment helpers', () => {
  it('rejoins a unit only when text, layer, and annotation id match', () => {
    const units = [
      { id: 'utt-a', textId: 'text-a', externalRef: 'a1' },
      { id: 'utt-b', textId: 'text-b', externalRef: 'a1' },
    ];
    const contents = [
      { unitId: 'utt-a', layerId: 'layer-a', externalRef: 'a1' },
      { unitId: 'utt-b', layerId: 'layer-b', externalRef: 'a1' },
    ];
    expect(
      findReimportUnitId({
        textId: 'text-a',
        layerId: 'layer-a',
        annotationId: 'a1',
        units,
        contents,
      }),
    ).toBe('utt-a');
    expect(
      findReimportUnitId({
        textId: 'text-a',
        layerId: 'layer-b',
        annotationId: 'a1',
        units,
        contents,
      }),
    ).toBeUndefined();
    expect(
      findReimportUnitId({
        textId: 'text-a',
        layerId: 'layer-a',
        annotationId: 'a1',
        units: [
          ...units,
          { id: 'seg-a', textId: 'text-a', unitType: 'segment', parentUnitId: 'utt-a' },
        ],
        contents: [{ unitId: 'seg-a', layerId: 'layer-a', externalRef: 'a1' }],
      }),
    ).toBe('utt-a');
  });

  it('matches a parent by annotation id and ignores unknown.wav', () => {
    expect(matchUnitByAnnotationRef([{ annotationId: 'a1', id: 'utt-a' }], 'a1')?.id).toBe('utt-a');
    expect(
      findMediaIdByFilename(
        [
          { id: 'media-1', filename: 'Speech.WAV' },
          { id: 'media-2', filename: 'other.wav' },
        ],
        './speech.wav',
      ),
    ).toBe('media-1');
    expect(findMediaIdByFilename([{ id: 'media-1', filename: 'speech.wav' }], 'unknown.wav')).toBe(
      undefined,
    );
  });

  it('uses und when a gloss tier has no language', () => {
    expect(glossLanguageKey(undefined)).toBe('und');
    expect(glossLanguageKey(' cmn ')).toBe('cmn');
  });
});
