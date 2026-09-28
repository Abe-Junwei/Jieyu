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
});
