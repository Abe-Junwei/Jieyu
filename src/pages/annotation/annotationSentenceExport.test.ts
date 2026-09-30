import { describe, expect, it } from 'vitest';
import {
  buildAnnotationSentenceExport,
  readAnnotationSentenceExport,
} from './annotationSentenceExport';

describe('buildAnnotationSentenceExport', () => {
  it('keeps the sentence, times, speaker, and sense id on the token', () => {
    const exported = buildAnnotationSentenceExport({
      textId: 'text-1',
      unitId: 'utt-1',
      speakerId: 'spk-1',
      startTime: 1,
      endTime: 2,
      surface: 'ŋa tɕhi',
      translation: '我去',
      tokens: [{ id: 'tok-1', form: 'ŋa', gloss: 'I', pos: 'PRON', senseId: 'sense-1' }],
    });
    expect(exported.surface).toBe('ŋa tɕhi');
    expect(exported.unitId).toBe('utt-1');
    expect(exported.tokens[0]?.senseId).toBe('sense-1');
    expect(exported.startTime).toBe(1);
    expect(exported.morphemes).toEqual([]);
  });

  it('keeps sense and morpheme pos on their ids when the columns move', () => {
    const exported = buildAnnotationSentenceExport({
      textId: 'text-1',
      unitId: 'utt-1',
      mediaId: 'media-1',
      startTime: 1.25,
      endTime: 2.5,
      surface: 'boy-s',
      translation: 'boys',
      tokens: [{ id: 'tok-1', form: 'boys', gloss: 'boy-PL', pos: 'NOUN' }],
      morphemes: [
        { id: 'mor-1', tokenId: 'tok-1', form: 'boy', gloss: 'boy', pos: 'N' },
        { id: 'mor-2', tokenId: 'tok-1', form: 's', gloss: 'PL', pos: '' },
      ],
    });
    const shuffled = {
      ...exported,
      tokens: [...exported.tokens].reverse(),
      morphemes: [...exported.morphemes].reverse(),
    };
    const read = readAnnotationSentenceExport(JSON.parse(JSON.stringify(shuffled)));
    expect(read?.unitId).toBe('utt-1');
    expect(read?.mediaId).toBe('media-1');
    expect(read?.startTime).toBe(1.25);
    expect(read?.tokens.find((token) => token.id === 'tok-1')?.pos).toBe('NOUN');
    expect(read?.morphemes.find((morph) => morph.id === 'mor-1')?.pos).toBe('N');
    expect(read?.morphemes.find((morph) => morph.id === 'mor-1')?.tokenId).toBe('tok-1');
  });
});
