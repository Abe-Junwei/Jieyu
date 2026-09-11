import { describe, expect, it } from 'vitest';
import { previewAutoGlossMatches } from './autoGlossPreview';

describe('autoGlossPreview', () => {
  const now = '2026-09-11T08:00:00.000Z';

  it('returns exact matches without requiring a service write', () => {
    const result = previewAutoGlossMatches(
      [
        {
          id: 'tok',
          textId: 't',
          unitId: 'u',
          form: { default: 'cat' },
          tokenIndex: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      [
        {
          id: 'lex',
          lemma: { default: 'dog' },
          senses: [{ gloss: { default: 'canine' } }],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'lex-cat',
          lemma: { default: 'cat' },
          senses: [{ gloss: { default: 'feline' } }],
          createdAt: now,
          updatedAt: now,
        },
      ],
    );
    expect(result.matches).toEqual([
      expect.objectContaining({
        tokenId: 'tok',
        lexemeId: 'lex-cat',
        matchType: 'exact',
        gloss: { default: 'feline' },
      }),
    ]);
  });
});
