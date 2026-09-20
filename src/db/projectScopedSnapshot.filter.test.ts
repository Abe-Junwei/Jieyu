import { describe, expect, it } from 'vitest';
import {
  COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS,
  filterCollectionsForProject,
} from './projectScopedSnapshot';

describe('filterCollectionsForProject', () => {
  it('keeps only the requested text and drops lexemes from a mixed dump', () => {
    const filtered = filterCollectionsForProject(
      {
        texts: [
          { id: 'text-a', title: { default: 'A' } },
          { id: 'text-b', title: { default: 'B' } },
        ],
        layer_units: [
          { id: 'u-a', textId: 'text-a' },
          { id: 'u-b', textId: 'text-b' },
        ],
        unit_tokens: [
          { id: 'tok-a', textId: 'text-a', unitId: 'u-a' },
          { id: 'tok-b', textId: 'text-b', unitId: 'u-b' },
        ],
        lexemes: [{ id: 'lex-dog', lemma: { default: 'dog' } }],
        token_lexeme_links: [{ id: 'link-1', lexemeId: 'lex-dog', targetId: 'tok-a' }],
        languages: [{ id: 'cmn' }],
      },
      'text-a',
    );

    expect(filtered.texts).toEqual([{ id: 'text-a', title: { default: 'A' } }]);
    expect(filtered.layer_units).toEqual([{ id: 'u-a', textId: 'text-a' }]);
    expect(filtered.unit_tokens).toEqual([{ id: 'tok-a', textId: 'text-a', unitId: 'u-a' }]);
    expect(filtered.lexemes).toBeUndefined();
    expect(filtered.token_lexeme_links).toBeUndefined();
    expect(filtered.languages).toBeUndefined();
    expect(COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS.has('lexemes')).toBe(true);
  });

  it('keeps only speakers referenced by the project units', () => {
    const filtered = filterCollectionsForProject(
      {
        texts: [{ id: 'text-a' }],
        layer_units: [{ id: 'u-a', textId: 'text-a', speakerId: 'spk-1' }],
        speakers: [
          { id: 'spk-1', name: 'Ada' },
          { id: 'spk-other', name: 'Other' },
        ],
      },
      'text-a',
    );
    expect(filtered.speakers).toEqual([{ id: 'spk-1', name: 'Ada' }]);
  });
});
