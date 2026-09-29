import { describe, expect, it } from 'vitest';
import { glossSuggestionForToken, majorityGloss } from './annotationGlossSuggestion';

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
