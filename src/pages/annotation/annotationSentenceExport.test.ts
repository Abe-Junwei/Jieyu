import { describe, expect, it } from 'vitest';
import { buildAnnotationSentenceExport } from './annotationSentenceExport';

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
  });
});
