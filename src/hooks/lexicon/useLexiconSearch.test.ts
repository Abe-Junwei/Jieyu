// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { entryDoc } from '../../utils/dmlexEntry';
import { useLexiconSearch } from './useLexiconSearch';

const now = '2026-09-27T00:00:00.000Z';
const dog = entryDoc({
  id: 'lex-dog',
  headword: 'dog',
  translation: 'canine',
  langCode: 'en',
  definition: 'domesticated canine',
  createdAt: now,
  updatedAt: now,
});
const run = entryDoc({
  id: 'lex-run',
  headword: 'run',
  translation: 'move quickly',
  langCode: 'en',
  createdAt: now,
  updatedAt: now,
});

describe('useLexiconSearch', () => {
  it('ranks headword hits and can match a translation', () => {
    const { result, rerender } = renderHook(({ query }) => useLexiconSearch([dog, run], query), {
      initialProps: { query: '' },
    });
    expect(result.current.map((row) => row.id)).toEqual(['lex-dog', 'lex-run']);
    rerender({ query: 'move quickly' });
    expect(result.current.map((row) => row.id)).toEqual(['lex-run']);
    rerender({ query: 'dog' });
    expect(result.current.map((row) => row.id)).toEqual(['lex-dog']);
  });

  // RADAR-BUG-1：NFC / NFD 双向 | NFC / NFD both directions
  it.each([
    ['NFC', 'NFD'],
    ['NFD', 'NFC'],
  ] as const)('finds %s-stored headwords with a %s query, entries unchanged', (stored, query) => {
    const words = ['ŋǎ', 'pʰǒ', 'mǎ', 'lê'];
    const entries = words.map((word, index) =>
      entryDoc({
        id: `lex-${index}`,
        headword: word.normalize(stored),
        createdAt: now,
        updatedAt: now,
      }),
    );
    const before = entries.map((row) => row.entry.headword);
    for (const [index, word] of words.entries()) {
      const { result } = renderHook(() => useLexiconSearch(entries, word.normalize(query)));
      expect(result.current.map((row) => row.id)).toContain(`lex-${index}`);
      expect(result.current[0]?.entry.headword).toBe(word.normalize(stored));
    }
    expect(entries.map((row) => row.entry.headword)).toEqual(before);
  });
});
