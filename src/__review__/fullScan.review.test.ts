/**
 * Full-repo scan review reproductions (read-only against main @ e5581bfc).
 * FS-1 / FS-2 / FS-3 / FS-5 regressions (FS-4 owned by 解语小改进).
 */
import { describe, expect, it } from 'vitest';
import { tokenizeMixedScriptForSearch, foldSearchText } from '../utils/searchTextNormalization';

describe('FULL-SCAN review: tone letters in search tokenization (FS-1)', () => {
  it('keeps IPA tone bars ˥˩ inside a word token (does not split on Sk)', () => {
    // U+02E5..U+02E9 are general category Sk (Symbol, modifier), not Letter/Mark.
    // Current tokenizeMixedScriptForSearch splits on [^L M N], so "a˥˩b" → ["a","b"]
    // and "ˈʔa˥˩" loses the tone bars. Embedding / MiniSearch indexing then cannot
    // distinguish ʔa˥ from ʔa˩.
    const tokens = tokenizeMixedScriptForSearch('ˈʔa˥˩');
    expect(tokens.some((t) => t.includes('˥') && t.includes('˩'))).toBe(true);
    expect(tokenizeMixedScriptForSearch('a˥˩b').join('|')).toBe(
      foldSearchText('a˥˩b'), // ideally one token containing tones
    );
  });

  it('does not drop a tone-only contrast between two forms', () => {
    const high = tokenizeMixedScriptForSearch('ma˥');
    const low = tokenizeMixedScriptForSearch('ma˩');
    expect(high).not.toEqual(low);
    expect(high.some((t) => t.includes('˥'))).toBe(true);
    expect(low.some((t) => t.includes('˩'))).toBe(true);
  });
});

describe('FULL-SCAN review: AutoGlossService loads all lexemes then filters (FS-2)', () => {
  it('documents that lexemes store has no textId index (baselineStores)', async () => {
    // Evidence-only: if this file still declares lexemes without textId, full-table
    // list/search/AutoGloss remains O(all projects).
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../db/baselineStores.ts', import.meta.url), 'utf8');
    const line = text.split('\n').find((l) => l.includes('lexemes:'));
    expect(line, 'lexemes store declaration').toBeTruthy();
    // Should include textId once fixed; currently 'id, updatedAt' only → fail
    expect(line).toMatch(/textId/);
  });
});

describe('FULL-SCAN review: AI AutoGlossService writes without a transaction (FS-3)', () => {
  it('AutoGlossService.executeGloss path has no withTransaction (AI tool uses this)', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../ai/AutoGlossService.ts', import.meta.url), 'utf8');
    // Annotation UI path (applyAnnotationAutoGloss) wraps writes; AI tool path does not.
    // Mid-flight failure leaves a partial gloss + link set with no automatic rollback of earlier rows.
    expect(text).toMatch(/withTransaction/);
  });
});

describe('FULL-SCAN review: searchLexemes skips foldSearchText (FS-5)', () => {
  it('NFD query finds NFC headword (RADAR-BUG-1 incomplete on LinguisticService.lexemes.search)', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(
      new URL('../services/linguisticServiceLexemeOps.ts', import.meta.url),
      'utf8',
    );
    const fn = text.slice(text.indexOf('export async function searchLexemes'));
    const body = fn.slice(0, 500);
    // Must fold with foldSearchText / NFC before includes; today: query.trim().toLowerCase() only
    expect(body).toMatch(/foldSearchText/);
    expect(body).not.toMatch(/query\.trim\(\)\.toLowerCase\(\)/);
  });
});
