// @vitest-environment jsdom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLiftXml } from './lexiconLiftImport';

const xmlText = fc.string({ maxLength: 48 }).map((value) => value.replace(/[<>&'"]/g, ' '));

function liftDocument(id: string, headword: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu">
  <entry id="${id}">
    <lexical-unit><form lang="und"><text>${headword}</text></form></lexical-unit>
  </entry>
</lift>`;
}

describe('parseLiftXml properties', () => {
  it('accepts any string without throwing, and keeps only non-empty headwords', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (xml) => {
        const parsed = parseLiftXml(xml, 'text-1');
        if (!parsed.ok) {
          expect(parsed).not.toHaveProperty('lexemes');
          return;
        }
        expect(parsed.lexemes.length).toBeGreaterThan(0);
        for (const lexeme of parsed.lexemes) {
          expect(lexeme.entry.headword.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('projects a trimmed headword and drops a blank one', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{1,8}$/), xmlText, (id, headword) => {
        const parsed = parseLiftXml(liftDocument(id, headword), 'text-1');
        const trimmed = headword.trim();
        if (trimmed.length === 0) {
          expect(parsed).toEqual({ ok: false, reason: 'empty' });
          return;
        }
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.lexemes.map((lexeme) => lexeme.entry.headword)).toEqual([trimmed]);
      }),
      { numRuns: 40 },
    );
  });

  it('parses a few hundred entries without throwing', () => {
    const entry = `<entry id="lex"><lexical-unit><form lang="und"><text>pine</text></form></lexical-unit></entry>`;
    const xml = `<?xml version="1.0"?><lift version="0.13">${entry.repeat(400)}</lift>`;
    const started = performance.now();
    const parsed = parseLiftXml(xml, 'text-1');
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes).toHaveLength(400);
    expect(parsed.lexemes.every((lexeme) => lexeme.entry.headword === 'pine')).toBe(true);
  });
});
