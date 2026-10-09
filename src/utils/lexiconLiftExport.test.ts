// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { entryDoc } from './dmlexEntry';
import { serializeLexemesToLift } from './lexiconLiftExport';

describe('serializeLexemesToLift', () => {
  it('writes the headword and escapes text', () => {
    const xml = serializeLexemesToLift([
      entryDoc({
        id: 'lex-dog',
        headword: 'a & b <c>',
        translation: 'canine',
        langCode: 'en',
        createdAt: '2026-09-27T00:00:00.000Z',
        updatedAt: '2026-09-27T00:00:00.000Z',
      }),
    ]);
    expect(xml).toContain('<lift version="0.13" producer="Jieyu">');
    expect(xml).toContain('a &amp; b &lt;c&gt;');
    expect(xml).toContain('<gloss lang="en"><text>canine</text></gloss>');
  });

  it('returns an empty failure from the downloader when there are no entries', async () => {
    const { exportLexemesAsLift } = await import('./lexiconLiftExport');
    expect(exportLexemesAsLift([])).toEqual({ ok: false, reason: 'empty' });
  });

  it('writes a file that parses back when the text has XML-illegal characters (JY-08)', async () => {
    const { parseLiftXml } = await import('./lexiconLiftImport');
    const reports: unknown[] = [];
    const xml = serializeLexemesToLift(
      [
        entryDoc({
          id: 'lex-ctl',
          headword: 'ʔa˥\u0301 bad\u0001char\u000Bnext',
          translation: 'gloss\u0002',
          langCode: 'en',
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        }),
      ],
      [],
      { onXmlSanitized: (report) => reports.push(report) },
    );
    expect(reports).toEqual([{ lineBreaks: 1, removed: 2 }]);
    const parsed = parseLiftXml(xml, 'text-1');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.lexemes[0]?.entry.headword).toBe('ʔa˥\u0301 badchar\nnext');
  });
});
