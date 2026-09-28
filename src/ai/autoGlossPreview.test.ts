import { describe, expect, it } from 'vitest';
import { entryDoc } from '../utils/dmlexEntry';
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
        entryDoc({
          id: 'lex',
          headword: 'dog',
          definition: 'canine',
          createdAt: now,
          updatedAt: now,
        }),
        entryDoc({
          id: 'lex-cat',
          headword: 'cat',
          definition: 'feline',
          createdAt: now,
          updatedAt: now,
        }),
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
