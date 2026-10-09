// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importLexemesFromLiftXml, liftCopyId, parseLiftXml } from './lexiconLiftImport';
import { serializeLexemesToLift } from './lexiconLiftExport';
import type { LexemeEntryDoc, LexemeResourceDoc } from '../db/types';

const fox = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu">
  <entry id="lex-fox">
    <lexical-unit>
      <form lang="eng"><text>fox</text></form>
      <form lang="zho"><text>狐狸</text></form>
    </lexical-unit>
    <trait name="morph-type" value="stem"/>
    <sense id="sense-fox">
      <grammatical-info value="noun"/>
      <gloss lang="en"><text>vulpine</text></gloss>
      <definition><form lang="eng"><text>a wild canine</text></form></definition>
      <note><form lang="en"><text>general note</text></form></note>
      <reversal type="en"><form lang="en"><text>fox</text></form></reversal>
      <subsense id="sense-kit">
        <gloss lang="en"><text>young fox</text></gloss>
      </subsense>
    </sense>
  </entry>
</lift>`;

describe('parseLiftXml', () => {
  it('projects headword, translation, definition, and a subsense', () => {
    const parsed = parseLiftXml(fox, 'text-1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const entry = parsed.lexemes[0]!;
    expect(entry.id).toBe('lex-fox');
    expect(entry.entry.headword).toBe('fox');
    expect(entry.entry.partsOfSpeech).toEqual(['noun']);
    expect(entry.entry.senses?.[0]?.headwordTranslations?.[0]?.text).toBe('vulpine');
    expect(entry.entry.senses?.[0]?.definitions?.[0]?.text).toBe('a wild canine');
    expect(entry.entry.senses?.map((sense) => sense.id)).toEqual(['sense-fox', 'sense-kit']);
    expect(parsed.resource.resource.relations).toEqual([
      { type: 'subsense', members: [{ ref: 'sense-fox' }, { ref: 'sense-kit' }] },
    ]);
    expect(parsed.diagnostics.map((row) => row.code)).toEqual([
      'morph-type',
      'extra-headword',
      'note',
      'reversal',
    ]);
    expect(JSON.stringify(entry.entry)).not.toContain('general note');
  });

  it('splits senses that disagree on part of speech into homograph entries', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13"><entry id="lex-bank">
  <lexical-unit><form lang="eng"><text>bank</text></form></lexical-unit>
  <sense id="sense-money"><grammatical-info value="noun"/><gloss lang="en"><text>money</text></gloss></sense>
  <sense id="sense-verb"><grammatical-info value="verb"/><gloss lang="en"><text>tilt</text></gloss></sense>
</entry></lift>`;
    const parsed = parseLiftXml(xml, 'text-1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes.map((row) => row.entry.partsOfSpeech?.[0])).toEqual(['noun', 'verb']);
    expect(parsed.lexemes.map((row) => row.entry.headword)).toEqual(['bank', 'bank']);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.losses).toEqual([]);
    expect(parsed.resource.resource.relations?.some((row) => row.type === 'homograph')).toBe(true);
  });

  it('rejects a file that is not LIFT 0.13', () => {
    expect(parseLiftXml('<not-lift/>', 'text-1').ok).toBe(false);
    expect(parseLiftXml('<lift version="0.15"></lift>', 'text-1')).toMatchObject({
      ok: false,
      reason: 'unsupported-version',
    });
  });
});

describe('importLexemesFromLiftXml', () => {
  it('saves the entry and the resource, then readback matches the headword', async () => {
    const store = new Map<string, LexemeEntryDoc | LexemeResourceDoc>();
    const result = await importLexemesFromLiftXml(fox, 'text-1', {
      save: async (doc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
      list: async () =>
        [...store.values()].filter((row): row is LexemeEntryDoc => row.kind !== 'resource'),
      loadResource: async () => null,
      saveResource: async (doc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readback[0]?.entry.headword).toBe('fox');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.losses).toEqual([]);
    const xml = serializeLexemesToLift(
      result.readback,
      [...store.values()].find((row) => row.kind === 'resource')?.resource.relations ?? [],
    );
    expect(xml).toContain('id="lex-fox"');
    expect(xml).toContain('vulpine');
    expect(xml).toContain('subsense');
  });

  it('creates a new row when an entry has no id, and reports that loss', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13"><entry>
  <lexical-unit><form lang="eng"><text>cat</text></form></lexical-unit>
</entry></lift>`;
    const store = new Map<string, LexemeEntryDoc | LexemeResourceDoc>();
    const deps = {
      save: async (doc: LexemeEntryDoc | LexemeResourceDoc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
      list: async () =>
        [...store.values()].filter((row): row is LexemeEntryDoc => row.kind !== 'resource'),
      loadResource: async () => null,
      saveResource: async (doc: LexemeResourceDoc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
    };
    const first = await importLexemesFromLiftXml(xml, 'text-1', deps);
    const second = await importLexemesFromLiftXml(xml, 'text-1', deps);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.losses).toEqual([{ code: 'no-stable-id', count: 1 }]);
    expect(second.losses).toEqual([{ code: 'no-stable-id', count: 1 }]);
    expect(second.readback).toHaveLength(2);
    expect(new Set(second.readback.map((row) => row.id)).size).toBe(2);
  });

  it('reports replaced-by-id when the same entry id is imported again', async () => {
    const store = new Map<string, LexemeEntryDoc | LexemeResourceDoc>();
    const deps = {
      save: async (doc: LexemeEntryDoc | LexemeResourceDoc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
      list: async () =>
        [...store.values()].filter((row): row is LexemeEntryDoc => row.kind !== 'resource'),
      loadResource: async () =>
        ([...store.values()].find((row) => row.kind === 'resource') as
          | LexemeResourceDoc
          | undefined) ?? null,
      saveResource: async (doc: LexemeResourceDoc) => {
        store.set(doc.id, doc);
        return doc.id;
      },
    };
    const first = await importLexemesFromLiftXml(fox, 'text-1', deps);
    const second = await importLexemesFromLiftXml(fox, 'text-1', deps);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.losses).toEqual([]);
    expect(second.losses).toEqual([{ code: 'replaced-by-id', count: 1 }]);
    expect(second.readback).toHaveLength(1);
    expect(second.readback[0]?.id).toBe('lex-fox');
  });
});

// ADR-0045 冻结：副本 id 会写进用户数据，固定值一变就说明算法被改了 | frozen by ADR-0045: a changed value means the algorithm changed
describe('liftCopyId (ADR-0045)', () => {
  it('yields the exact frozen ids for fixed inputs', () => {
    expect(liftCopyId('lex', 'text_b', 'lex_1')).toBe('lex_e0e613575c31378af45a302f205ed8d5');
    expect(liftCopyId('sense', 'text_b', 'sense_1')).toBe('sense_e4f84222597b832310d358b37f8bf8d7');
    expect(liftCopyId('lex', 'text_b', 'lex_e\u0301')).toBe('lex_b408ee60a2c381b6571a26a2ca9f8b44');
  });

  it('is always 32 lowercase hex chars after the prefix', () => {
    for (let index = 0; index < 500; index += 1) {
      expect(liftCopyId('lex', `t${index}`, `s${index * 7919}`)).toMatch(/^lex_[0-9a-f]{32}$/);
    }
  });
});
