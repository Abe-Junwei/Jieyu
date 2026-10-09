// @vitest-environment jsdom
/**
 * LIFT 语言代码往返（JY-09）：词头、变体、例句、发音写真实语言，不再一律 'und'；
 * 导入时把词头语言记进词典，发音语言记成 transcription scheme，例句译文语言取自文件。
 * LIFT language codes round trip (JY-09): headword, variant, example and pronunciation carry the
 * real language instead of 'und'; import records the headword language on the dictionary, the
 * pronunciation language as the transcription scheme and the example translation language.
 */
import { describe, expect, it } from 'vitest';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import { emptyDmlexResource } from './dmlexEntry';
import { resolveLiftObjectLang, serializeLexemesToLift } from './lexiconLiftExport';
import {
  importLexemesFromLiftXml,
  parseLiftXml,
  type LexiconLiftImportDeps,
} from './lexiconLiftImport';

const NOW = '2026-10-09T00:00:00.000Z';

const sehXml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-nyumba">
    <lexical-unit><form lang="seh"><text>nyumba</text></form></lexical-unit>
    <variant><form lang="seh"><text>nyumba, zinyumba</text></form></variant>
    <pronunciation><form lang="seh-fonipa"><text>ɲumba</text></form></pronunciation>
    <sense id="sense-house">
      <gloss lang="en"><text>house</text></gloss>
      <example>
        <form lang="seh"><text>nyumba yanga</text></form>
        <translation><form lang="pt"><text>a minha casa</text></form></translation>
      </example>
    </sense>
  </entry>
</lift>`;

function memoryDeps(textId: string, resource: LexemeResourceDoc | null = null) {
  const rows = new Map<string, LexemeEntryDoc>();
  let saved: LexemeResourceDoc | null = resource;
  const deps: LexiconLiftImportDeps = {
    save: async (doc: LexemeDocType) => {
      rows.set(doc.id, doc as LexemeEntryDoc);
      return doc.id;
    },
    list: async () => [...rows.values()].filter((row) => row.textId === textId),
    loadResource: async () => saved,
    saveResource: async (doc) => {
      saved = doc as LexemeResourceDoc;
      return doc.id;
    },
  };
  return { deps, resource: () => saved };
}

describe('LIFT language codes (JY-09)', () => {
  it('imports the headword, pronunciation and example translation languages', () => {
    const parsed = parseLiftXml(sehXml, 'text-1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.resource.resource.langCode).toBe('seh');
    const entry = parsed.lexemes[0]!.entry;
    expect(entry.inflectedForms).toEqual([{ text: 'nyumba, zinyumba' }]);
    expect(entry.pronunciations).toEqual([
      { transcriptions: [{ text: 'ɲumba', scheme: 'seh-fonipa' }] },
    ]);
    expect(entry.senses?.[0]?.examples?.[0]?.exampleTranslations?.[0]?.langCode).toBe('pt');
  });

  it('exports the dictionary language instead of und and round trips it', () => {
    const parsed = parseLiftXml(sehXml, 'text-1');
    if (!parsed.ok) throw new Error('parse failed');
    const xml = serializeLexemesToLift(parsed.lexemes, parsed.resource.resource.relations ?? [], {
      langCode: parsed.resource.resource.langCode,
    });
    expect(xml).not.toContain('lang="und"');
    expect(xml).toContain('<lexical-unit><form lang="seh"><text>nyumba</text>');
    expect(xml).toContain('<variant><form lang="seh"><text>nyumba, zinyumba</text>');
    expect(xml).toContain('<pronunciation><form lang="seh-fonipa"><text>ɲumba</text>');
    expect(xml).toContain('<example><form lang="seh"><text>nyumba yanga</text>');
    expect(xml).toContain('<translation><form lang="pt"><text>a minha casa</text>');
    expect(xml).toContain('<gloss lang="en"><text>house</text>');

    const again = parseLiftXml(xml, 'text-1');
    if (!again.ok) throw new Error('re-parse failed');
    expect(again.lexemes.map((row) => row.entry)).toEqual(parsed.lexemes.map((row) => row.entry));
    expect(again.resource.resource.langCode).toBe('seh');
  });

  it('falls back to the project language, then und', () => {
    expect(resolveLiftObjectLang('seh', 'por')).toBe('seh');
    expect(resolveLiftObjectLang('und', 'por')).toBe('por');
    expect(resolveLiftObjectLang(undefined, ' ')).toBe('und');
  });

  it('adopts the file language for a dictionary without one and reports other headword languages', async () => {
    const mixed = sehXml.replace(
      '</lift>',
      `<entry id="lex-casa"><lexical-unit><form lang="pt"><text>casa</text></form></lexical-unit></entry>
</lift>`,
    );
    const memory = memoryDeps('text-1', emptyDmlexResource(NOW, 'text-1'));
    const result = await importLexemesFromLiftXml(mixed, 'text-1', memory.deps);
    expect(result.ok).toBe(true);
    expect(memory.resource()?.resource.langCode).toBe('seh');
    if (result.ok) expect(result.losses).toContainEqual({ code: 'mixed-headword-lang', count: 1 });
  });

  it('keeps an existing dictionary language', async () => {
    const existing = emptyDmlexResource(NOW, 'text-1');
    existing.resource.langCode = 'nya';
    const memory = memoryDeps('text-1', existing);
    const result = await importLexemesFromLiftXml(sehXml, 'text-1', memory.deps);
    expect(memory.resource()?.resource.langCode).toBe('nya');
    if (result.ok) expect(result.losses).toContainEqual({ code: 'mixed-headword-lang', count: 1 });
  });
});
