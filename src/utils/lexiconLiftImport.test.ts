// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import { serializeLexemesToLift } from './lexiconLiftExport';
import { importLexemesFromLiftXml, parseLiftXml } from './lexiconLiftImport';

const now = '2026-09-20T12:00:00.000Z';

const dog: LexemeDocType = {
  id: 'lex-dog',
  lemma: { default: 'dog', eng: 'hound' },
  citationForm: 'dog',
  language: 'eng',
  lexemeType: 'word',
  notes: { zho: '常见家养动物' },
  senses: [
    {
      id: 'sense_primary',
      gloss: { eng: 'canine' },
      definition: { eng: 'domesticated canine' },
      category: 'noun',
    },
    { id: 'sense_pet', gloss: { default: 'pet' }, definition: { default: 'companion' } },
  ],
  forms: [
    { id: 'form_dogs', transcription: { default: 'dogs' } },
    { id: 'form_doggie', transcription: { default: 'doggie' } },
  ],
  createdAt: now,
  updatedAt: now,
};

describe('lexiconLiftImport', () => {
  it('round-trips B3e XML for id, lemma text, sense ids and glosses', () => {
    const xml = serializeLexemesToLift([dog]);
    expect(xml).toBeTruthy();
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const entry = parsed.lexemes[0]!;
    expect(entry.id).toBe('lex-dog');
    expect(Object.values(entry.lemma)).toContain('hound');
    expect(entry.senses.map((sense) => sense.id)).toEqual(['sense_primary', 'sense_pet']);
    expect(entry.senses[0]?.gloss.eng ?? entry.senses[0]?.gloss.default).toBe('canine');
    expect(entry.senses[0]?.definition?.eng ?? entry.senses[0]?.definition?.default).toBe(
      'domesticated canine',
    );
    expect(entry.forms?.map((form) => Object.values(form.transcription)[0])).toEqual([
      'dogs',
      'doggie',
    ]);
  });

  it('round-trips nested subsense parentId', () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          dog.senses[0]!,
          { id: 'sense_pet', parentId: 'sense_primary', gloss: { default: 'pet' } },
        ],
      },
    ]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses.map((sense) => sense.id)).toEqual([
      'sense_primary',
      'sense_pet',
    ]);
    expect(parsed.lexemes[0]?.senses[1]?.parentId).toBe('sense_primary');
  });

  it('reads the example sentence and the first translation, not the bibliographic source', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <example>
        <form lang="eng"><text>the dog runs</text></form>
        <translation><form lang="en"><text>狗在跑</text></form></translation>
        <source>field notes</source>
      </example>
      <example>
        <form lang="eng"><text>a dog</text></form>
      </example>
      <example><source>ignored</source></example>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.examples).toEqual([
      { source: 'the dog runs', translation: '狗在跑' },
      { source: 'a dog' },
    ]);
    expect(parsed.lexemes[0]?.examples).toBeUndefined();
  });

  it('reads the first pronunciation form and skips a media-only block', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <pronunciation><media href="dog.wav"/></pronunciation>
    <pronunciation>
      <form><text>nolang</text></form>
      <form lang="und-fonipa"><text>dɔg</text></form>
      <form lang="eng-fonipa"><text>ignored</text></form>
    </pronunciation>
    <pronunciation><form lang="und-fonipa"><text>second</text></form></pronunciation>
    <sense id="sense_primary"><gloss lang="eng"><text>canine</text></gloss></sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.pronunciation).toBe('dɔg');
  });

  it('round-trips pronunciation and keeps an existing value when the element is omitted', async () => {
    const xml = serializeLexemesToLift([{ ...dog, pronunciation: 'dɔg' }]);
    expect(xml).toContain(
      '<pronunciation><form lang="und-fonipa"><text>dɔg</text></form></pronunciation>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.pronunciation).toBe('dɔg');

    const bare = serializeLexemesToLift([dog]);
    expect(bare).not.toContain('<pronunciation>');
    const existing: LexemeDocType = { ...dog, pronunciation: 'dɔg' };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.pronunciation).toBe('dɔg');
  });

  it('reads the first etymology form, gloss, and languages trait', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <etymology source="ignored">
      <gloss lang="en"><text>only gloss</text></gloss>
    </etymology>
    <etymology source="also ignored">
      <trait name="languages" value="Spanish"/>
      <form lang="es"><text>perro</text></form>
      <gloss lang="en"><text>dog</text></gloss>
      <field type="note"><form lang="en"><text>skip note</text></form></field>
    </etymology>
    <etymology>
      <form lang="und"><text>second</text></form>
    </etymology>
    <sense id="sense_primary"><gloss lang="eng"><text>canine</text></gloss></sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.etymology).toEqual({
      form: 'perro',
      gloss: 'dog',
      sourceLanguage: 'Spanish',
    });
  });

  it('round-trips etymology and keeps an existing value when the element is omitted', async () => {
    const xml = serializeLexemesToLift([
      { ...dog, etymology: { form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' } },
    ]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.etymology).toEqual({
      form: 'perro',
      gloss: 'dog',
      sourceLanguage: 'Spanish',
    });

    const bare = serializeLexemesToLift([dog]);
    expect(bare).not.toContain('<etymology>');
    const existing: LexemeDocType = {
      ...dog,
      etymology: { form: 'perro', sourceLanguage: 'Spanish' },
    };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.etymology).toEqual({ form: 'perro', sourceLanguage: 'Spanish' });
  });

  it('reads the first literal-meaning field and skips other field types', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <field type="comment"><form lang="en"><text>skip</text></form></field>
    <field type="literal-meaning">
      <form><text>nolang</text></form>
      <form lang="en"><text>domestic animal</text></form>
    </field>
    <field type="literal-meaning"><form lang="en"><text>second</text></form></field>
    <sense id="sense_primary"><gloss lang="eng"><text>canine</text></gloss></sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.literalMeaning).toBe('domestic animal');
  });

  it('round-trips literal meaning and keeps an existing value when the field is omitted', async () => {
    const xml = serializeLexemesToLift([{ ...dog, literalMeaning: 'domestic animal' }]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.literalMeaning).toBe('domestic animal');

    const bare = serializeLexemesToLift([dog]);
    expect(bare).not.toContain('literal-meaning');
    const existing: LexemeDocType = { ...dog, literalMeaning: 'domestic animal' };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.literalMeaning).toBe('domestic animal');
  });

  it('reads the first summary-definition field and keeps literal meaning', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <field type="literal-meaning"><form lang="en"><text>domestic animal</text></form></field>
    <field type="summary-definition">
      <form><text>nolang</text></form>
      <form lang="en"><text>a canine kept at home</text></form>
    </field>
    <field type="summary-definition"><form lang="en"><text>second</text></form></field>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <field type="summary-definition"><form lang="en"><text>sense def</text></form></field>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.summaryDefinition).toBe('a canine kept at home');
    expect(parsed.lexemes[0]?.literalMeaning).toBe('domestic animal');
  });

  it('round-trips summary definition and keeps an existing value when the field is omitted', async () => {
    const xml = serializeLexemesToLift([
      { ...dog, literalMeaning: 'domestic animal', summaryDefinition: 'a canine kept at home' },
    ]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.summaryDefinition).toBe('a canine kept at home');
    expect(parsed.lexemes[0]?.literalMeaning).toBe('domestic animal');

    const bare = serializeLexemesToLift([{ ...dog, literalMeaning: 'domestic animal' }]);
    expect(bare).not.toContain('summary-definition');
    const existing: LexemeDocType = {
      ...dog,
      literalMeaning: 'domestic animal',
      summaryDefinition: 'a canine kept at home',
    };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.summaryDefinition).toBe('a canine kept at home');
    expect(store[0]?.literalMeaning).toBe('domestic animal');
  });

  it('reads a sense scientific name and ignores an entry-level field', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <field type="scientific-name"><form lang="en"><text>entry name</text></form></field>
    <sense id="sense_primary">
      <grammatical-info value="noun"/>
      <gloss lang="eng"><text>canine</text></gloss>
      <field type="scientific-name">
        <form><text>nolang</text></form>
        <form lang="en"><text>Canis familiaris</text></form>
      </field>
      <field type="scientific-name"><form lang="en"><text>second</text></form></field>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <field type="scientific-name"><form lang="en"><text>Canis lupus</text></form></field>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('scientificName');
    expect(parsed.lexemes[0]?.summaryDefinition).toBeUndefined();
    expect(parsed.lexemes[0]?.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(parsed.lexemes[0]?.senses[0]?.category).toBe('noun');
    expect(parsed.lexemes[0]?.senses[1]?.scientificName).toBe('Canis lupus');
  });

  it('round-trips sense scientific names and drops them when the sense field is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          { ...dog.senses[0]!, scientificName: 'Canis familiaris' },
          { ...dog.senses[1]!, scientificName: 'Canis lupus' },
        ],
      },
    ]);
    expect(xml).toContain(
      '<field type="scientific-name"><form lang="und"><text>Canis familiaris</text></form></field>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(parsed.lexemes[0]?.senses[1]?.scientificName).toBe('Canis lupus');

    const bare = serializeLexemesToLift([dog]);
    expect(bare).not.toContain('scientific-name');
    const existing: LexemeDocType = {
      ...dog,
      senses: [{ ...dog.senses[0]!, scientificName: 'Canis familiaris' }, dog.senses[1]!],
    };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.senses[0]?.scientificName).toBeUndefined();
    expect(store[0]?.senses[0]?.category).toBe('noun');
    expect(store[0]?.senses[1]?.scientificName).toBeUndefined();
  });

  it('reads an entry bibliography note and leaves the untyped note alone', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="bibliography">
      <form><text>nolang</text></form>
      <form lang="en"><text>Smith 1990</text></form>
    </note>
    <note type="restrictions"><form lang="en"><text>secret</text></form></note>
    <note><form lang="zho"><text>常见</text></form></note>
    <field type="bibliography"><form lang="en"><text>not entry</text></form></field>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="bibliography"><form lang="en"><text>sense bib</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.bibliography).toBe('Smith 1990');
    expect(parsed.lexemes[0]?.restrictions).toBe('secret');
    expect(parsed.lexemes[0]?.notes).toEqual({ zho: '常见', default: '常见' });
  });

  it('round-trips bibliography and keeps an existing value when the note is omitted', async () => {
    const xml = serializeLexemesToLift([{ ...dog, bibliography: 'Smith 1990' }]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.bibliography).toBe('Smith 1990');
    expect(parsed.lexemes[0]?.notes?.zho).toBe('常见家养动物');

    const bare = serializeLexemesToLift([dog]);
    expect(bare).not.toContain('type="bibliography"');
    const existing: LexemeDocType = { ...dog, bibliography: 'Smith 1990' };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.bibliography).toBe('Smith 1990');
    expect(store[0]?.notes?.zho).toBe('常见家养动物');
  });

  it('round-trips restrictions and keeps bibliography when the restrictions note is omitted', async () => {
    const xml = serializeLexemesToLift([
      { ...dog, bibliography: 'Smith 1990', restrictions: 'internal' },
    ]);
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.restrictions).toBe('internal');
    expect(parsed.lexemes[0]?.bibliography).toBe('Smith 1990');

    const bare = serializeLexemesToLift([{ ...dog, bibliography: 'Smith 1990' }]);
    expect(bare).not.toContain('type="restrictions"');
    const existing: LexemeDocType = {
      ...dog,
      bibliography: 'Smith 1990',
      restrictions: 'internal',
    };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      store[0] = doc;
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(bare!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    expect(store[0]?.restrictions).toBe('internal');
    expect(store[0]?.bibliography).toBe('Smith 1990');
  });

  it('sorts sibling senses by the LIFT order attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <sense id="sense_second" order="1"><gloss lang="eng"><text>second</text></gloss>
      <subsense id="sense_child_b" order="1"><gloss lang="eng"><text>child-b</text></gloss></subsense>
      <subsense id="sense_child_a" order="0"><gloss lang="eng"><text>child-a</text></gloss></subsense>
    </sense>
    <sense id="sense_first" order="0"><gloss lang="eng"><text>first</text></gloss></sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses.map((sense) => sense.id)).toEqual([
      'sense_first',
      'sense_second',
      'sense_child_a',
      'sense_child_b',
    ]);
  });

  it('rejects invalid xml, wrong version, and empty lifts without saving', async () => {
    const save = vi.fn();
    const list = vi.fn(async () => [] as LexemeDocType[]);
    expect(parseLiftXml('<not-lift/>').ok).toBe(false);
    expect(parseLiftXml('<lift version="0.15"></lift>')).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
    expect(parseLiftXml('<lift version="0.13"></lift>')).toEqual({ ok: false, reason: 'empty' });
    const invalid = await importLexemesFromLiftXml('<lift>', { save, list });
    expect(invalid.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('upserts by entry id and keeps unmapped fields from the existing row', async () => {
    const xml = serializeLexemesToLift([dog]);
    expect(xml).toBeTruthy();
    const existing: LexemeDocType = {
      ...dog,
      lemma: { default: 'old' },
      usageCount: 9,
      tags: { keep: true },
    };
    const store = [existing];
    const save = vi.fn(async (doc: LexemeDocType) => {
      const index = store.findIndex((row) => row.id === doc.id);
      if (index >= 0) store[index] = doc;
      else store.push(doc);
      return doc.id;
    });
    const result = await importLexemesFromLiftXml(xml!, {
      save,
      list: async () => [...store],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(save).toHaveBeenCalledTimes(1);
    const saved = store[0]!;
    expect(Object.values(saved.lemma)).toContain('hound');
    expect(saved.usageCount).toBe(9);
    expect(saved.tags).toEqual({ keep: true });
    expect(result.readback[0]?.id).toBe('lex-dog');
  });
});
