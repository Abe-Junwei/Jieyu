import { describe, expect, it } from 'vitest';
import {
  occurrenceCitationStatus,
  upsertOccurrenceCitation,
  type OccurrenceCitation,
} from './annotationOccurrenceCitation';

const citation: OccurrenceCitation = {
  textId: 'text-1',
  unitId: 'utt-1',
  tokenId: 'tok-1',
  lexemeId: 'lex-1',
  senseId: 'sense-2',
};

describe('annotationOccurrenceCitation', () => {
  it('replaces a citation for the same token and leaves typed examples alone', () => {
    const stored = upsertOccurrenceCitation([{ ...citation, senseId: 'sense-1' }], citation);
    expect(stored).toEqual([citation]);
  });

  it('marks a citation broken when the token link moves', () => {
    expect(occurrenceCitationStatus(citation, { lexemeId: 'lex-1', senseId: 'sense-2' })).toBe(
      'live',
    );
    expect(occurrenceCitationStatus(citation, { lexemeId: 'lex-1', senseId: 'sense-9' })).toBe(
      'broken',
    );
    expect(occurrenceCitationStatus(citation, undefined)).toBe('broken');
  });
});
