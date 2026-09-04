// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LexemeDocType } from '../../db';
import { useLexiconSearch } from './useLexiconSearch';

const NOW = '2026-09-04T00:00:00.000Z';

function lexeme(
  partial: Partial<LexemeDocType> & Pick<LexemeDocType, 'id' | 'lemma'>,
): LexemeDocType {
  return {
    senses: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

const LEXEMES: LexemeDocType[] = [
  lexeme({
    id: 'lex-dog',
    lemma: { default: 'dog' },
    citationForm: 'dog',
    senses: [{ gloss: { eng: 'canine' }, category: 'noun' }],
    language: 'eng',
  }),
  lexeme({
    id: 'lex-run',
    lemma: { default: 'run' },
    senses: [{ gloss: { eng: 'move quickly' } }],
    language: 'eng',
    lexemeType: 'verb',
  }),
];

describe('useLexiconSearch', () => {
  it('returns the full list when the query is empty', () => {
    const { result } = renderHook(() => useLexiconSearch(LEXEMES, '  '));
    expect(result.current.map((row) => row.id)).toEqual(['lex-dog', 'lex-run']);
  });

  it('ranks lemma hits and can match gloss text', () => {
    const { result: byLemma } = renderHook(() => useLexiconSearch(LEXEMES, 'dog'));
    expect(byLemma.current.map((row) => row.id)).toEqual(['lex-dog']);

    const { result: byGloss } = renderHook(() => useLexiconSearch(LEXEMES, 'move quickly'));
    expect(byGloss.current.map((row) => row.id)).toEqual(['lex-run']);
  });
});
