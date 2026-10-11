/**
 * RADAR-BUG-1：检索时 NFC / NFD 互相可搜，原文不变。
 * RADAR-BUG-1: NFC and NFD spellings find each other at retrieval time; originals are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { foldSearchText, tokenizeMixedScriptForSearch } from './searchTextNormalization';

const WORDS = ['ŋǎ', 'pʰǒ', 'tsə̃', 'mǎ', 'lê'];

describe('searchTextNormalization', () => {
  it.each(WORDS)('folds NFC and NFD spellings of %s to the same key', (word) => {
    expect(foldSearchText(word.normalize('NFD'))).toBe(foldSearchText(word.normalize('NFC')));
  });

  it('keeps combining marks inside tokens and folds both forms alike', () => {
    const text = WORDS.join(' ');
    const fromNfc = tokenizeMixedScriptForSearch(text.normalize('NFC'));
    const fromNfd = tokenizeMixedScriptForSearch(text.normalize('NFD'));
    expect(fromNfd).toEqual(fromNfc);
    expect(fromNfc).toContain('tsə̃'.normalize('NFC'));
  });

  it('does not touch the input string', () => {
    const nfd = 'ŋǎ'.normalize('NFD');
    const copy = `${nfd}`;
    foldSearchText(nfd);
    tokenizeMixedScriptForSearch(nfd);
    expect(nfd).toBe(copy);
    expect(nfd.normalize('NFC')).not.toBe(nfd);
  });

  it('keeps IPA tone bars ˥˩ inside a word token (FS-1)', () => {
    const tokens = tokenizeMixedScriptForSearch('ˈʔa˥˩');
    expect(tokens.some((t) => t.includes('˥') && t.includes('˩'))).toBe(true);
    expect(tokenizeMixedScriptForSearch('a˥˩b').join('|')).toBe(foldSearchText('a˥˩b'));
  });

  it('does not collapse tone-only contrasts (FS-1)', () => {
    const high = tokenizeMixedScriptForSearch('ma˥');
    const low = tokenizeMixedScriptForSearch('ma˩');
    expect(high).not.toEqual(low);
    expect(high.some((t) => t.includes('˥'))).toBe(true);
    expect(low.some((t) => t.includes('˩'))).toBe(true);
  });
});
