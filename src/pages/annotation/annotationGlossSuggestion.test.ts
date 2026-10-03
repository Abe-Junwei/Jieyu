import { describe, expect, it } from 'vitest';
import {
  collectBlankSameFormGlossWrites,
  glossSuggestionForToken,
  majorityGloss,
} from './annotationGlossSuggestion';

describe('annotationGlossSuggestion', () => {
  it('returns nothing on a tie', () => {
    expect(majorityGloss(['run', 'go'])).toBeNull();
  });

  it('suggests the majority gloss for a blank token and ignores suggested values', () => {
    const tokens = [
      { id: 'a', form: 'k’a', gloss: '' },
      { id: 'b', form: 'k’a', gloss: 'eat' },
      { id: 'c', form: 'k\u2019a', gloss: 'eat' },
      { id: 'd', form: 'k’a', gloss: 'bite', reviewStatus: 'suggested' },
    ];
    expect(glossSuggestionForToken(tokens, 'a')).toBe('eat');
  });

  it('prefers a confirmed sense gloss and does not fall through on a tie', () => {
    const tokens = [
      { id: 'a', form: 'k’a', gloss: '' },
      { id: 'b', form: 'k’a', gloss: 'eat', senseGloss: 'consume', linkReviewStatus: 'confirmed' },
      { id: 'c', form: 'k’a', gloss: 'eat', senseGloss: 'bite', linkReviewStatus: 'confirmed' },
    ];
    expect(glossSuggestionForToken(tokens, 'a')).toBeNull();
  });

  it('uses one confirmed sense before the corpus gloss', () => {
    const tokens = [
      { id: 'a', form: 'k’a', gloss: '' },
      { id: 'b', form: 'k’a', gloss: 'eat', senseGloss: 'consume', linkReviewStatus: 'confirmed' },
      { id: 'c', form: 'k’a', gloss: 'eat' },
    ];
    expect(glossSuggestionForToken(tokens, 'a')).toBe('consume');
  });

  it('fills only blank same-form words and does not copy a link', () => {
    const writes = collectBlankSameFormGlossWrites({
      sourceTokenId: 'src',
      gloss: 'eat',
      tokens: [
        {
          id: 'src',
          unitId: 'u1',
          form: 'k’a',
          gloss: 'eat',
          pos: '',
          glossLang: 'eng',
          hasLink: true,
          morphForms: ['k’a'],
        },
        {
          id: 'blank',
          unitId: 'u2',
          form: 'k’a',
          gloss: '',
          pos: '',
          glossLang: 'eng',
          hasLink: false,
          morphForms: [],
        },
        {
          id: 'glossed',
          unitId: 'u3',
          form: 'k’a',
          gloss: 'bite',
          pos: '',
          glossLang: 'eng',
          hasLink: false,
          morphForms: [],
        },
        {
          id: 'linked',
          unitId: 'u4',
          form: 'k’a',
          gloss: '',
          pos: '',
          glossLang: 'eng',
          hasLink: true,
          morphForms: [],
        },
        {
          id: 'split',
          unitId: 'u5',
          form: 'k’a',
          gloss: '',
          pos: '',
          glossLang: 'eng',
          hasLink: false,
          morphForms: ['k', 'a'],
        },
      ],
    });
    expect(writes.map((write) => write.tokenId)).toEqual(['blank']);
    expect(writes[0]).not.toHaveProperty('lexemeId');
  });

  it('does not suggest over a gloss that is already written', () => {
    expect(
      glossSuggestionForToken(
        [
          { id: 'a', form: 'k’a', gloss: 'drink' },
          { id: 'b', form: 'k’a', gloss: 'eat' },
          { id: 'c', form: 'k’a', gloss: 'eat' },
        ],
        'a',
      ),
    ).toBeNull();
  });
});
