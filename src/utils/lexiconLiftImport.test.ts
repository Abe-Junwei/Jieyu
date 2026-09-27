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

  it('reads a sense anthropology note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="anthropology"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="anthropology">
        <form><text>nolang</text></form>
        <form lang="en"><text>kept at home</text></form>
      </note>
      <note type="bibliography"><form lang="en"><text>Smith 1990</text></form></note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="anthropology"><form lang="en"><text>companion</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('anthropologyNote');
    expect(parsed.lexemes[0]?.notes).toBeUndefined();
    expect(parsed.lexemes[0]?.bibliography).toBeUndefined();
    expect(parsed.lexemes[0]?.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(parsed.lexemes[0]?.senses[0]?.scientificName).toBeUndefined();
    expect(parsed.lexemes[0]?.senses[1]?.anthropologyNote).toBe('companion');
  });

  it('round-trips sense anthropology notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            scientificName: 'Canis familiaris',
            anthropologyNote: 'kept at home',
          },
          { ...dog.senses[1]!, anthropologyNote: 'companion' },
        ],
      },
    ]);
    expect(xml).toContain(
      '<note type="anthropology"><form lang="und"><text>kept at home</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(parsed.lexemes[0]?.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(parsed.lexemes[0]?.senses[1]?.anthropologyNote).toBe('companion');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, scientificName: 'Canis familiaris' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('anthropology');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        { ...dog.senses[0]!, scientificName: 'Canis familiaris', anthropologyNote: 'kept at home' },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.anthropologyNote).toBeUndefined();
    expect(store[0]?.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(store[0]?.senses[1]?.anthropologyNote).toBeUndefined();
  });

  it('reads a sense discourse note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="discourse"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="anthropology"><form lang="en"><text>kept at home</text></form></note>
      <note type="discourse">
        <form><text>nolang</text></form>
        <form lang="en"><text>narrative use</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="discourse"><form lang="en"><text>vocative</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('discourseNote');
    expect(parsed.lexemes[0]?.senses[0]?.discourseNote).toBe('narrative use');
    expect(parsed.lexemes[0]?.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(parsed.lexemes[0]?.senses[1]?.discourseNote).toBe('vocative');
  });

  it('round-trips sense discourse notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            anthropologyNote: 'kept at home',
            discourseNote: 'narrative use',
          },
          { ...dog.senses[1]!, discourseNote: 'vocative' },
        ],
      },
    ]);
    expect(xml).toContain(
      '<note type="discourse"><form lang="und"><text>narrative use</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.discourseNote).toBe('narrative use');
    expect(parsed.lexemes[0]?.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(parsed.lexemes[0]?.senses[1]?.discourseNote).toBe('vocative');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, anthropologyNote: 'kept at home' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('discourse');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        { ...dog.senses[0]!, anthropologyNote: 'kept at home', discourseNote: 'narrative use' },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.discourseNote).toBeUndefined();
    expect(store[0]?.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(store[0]?.senses[1]?.discourseNote).toBeUndefined();
  });

  it('reads a sense encyclopedic note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="encyclopedic"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="discourse"><form lang="en"><text>narrative use</text></form></note>
      <note type="encyclopedic">
        <form><text>nolang</text></form>
        <form lang="en"><text>domestic canine</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="encyclopedic"><form lang="en"><text>household companion</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('encyclopedicNote');
    expect(parsed.lexemes[0]?.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(parsed.lexemes[0]?.senses[0]?.discourseNote).toBe('narrative use');
    expect(parsed.lexemes[0]?.senses[1]?.encyclopedicNote).toBe('household companion');
  });

  it('round-trips sense encyclopedic notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            discourseNote: 'narrative use',
            encyclopedicNote: 'domestic canine',
          },
          { ...dog.senses[1]!, encyclopedicNote: 'household companion' },
        ],
      },
    ]);
    const discourseAt = xml!.indexOf('<note type="discourse">');
    const encyclopedicAt = xml!.indexOf('<note type="encyclopedic">');
    expect(discourseAt).toBeGreaterThanOrEqual(0);
    expect(encyclopedicAt).toBeGreaterThan(discourseAt);
    expect(xml).toContain(
      '<note type="encyclopedic"><form lang="und"><text>domestic canine</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(parsed.lexemes[0]?.senses[0]?.discourseNote).toBe('narrative use');
    expect(parsed.lexemes[0]?.senses[1]?.encyclopedicNote).toBe('household companion');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, discourseNote: 'narrative use' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('encyclopedic');
    expect(bare).toContain('type="discourse"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          discourseNote: 'narrative use',
          encyclopedicNote: 'domestic canine',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.encyclopedicNote).toBeUndefined();
    expect(store[0]?.senses[0]?.discourseNote).toBe('narrative use');
    expect(store[0]?.senses[1]?.encyclopedicNote).toBeUndefined();
  });

  it('reads a sense grammar note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="grammar"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="encyclopedic"><form lang="en"><text>domestic canine</text></form></note>
      <note><form lang="en"><text>general note</text></form></note>
      <note type="grammar">
        <form><text>nolang</text></form>
        <form lang="en"><text>count noun</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="grammar"><form lang="en"><text>used with classifiers</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('grammarNote');
    expect(parsed.lexemes[0]?.senses[0]?.grammarNote).toBe('count noun');
    expect(parsed.lexemes[0]?.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('general note');
    expect(parsed.lexemes[0]?.senses[1]?.grammarNote).toBe('used with classifiers');
  });

  it('round-trips sense grammar notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            encyclopedicNote: 'domestic canine',
            grammarNote: 'count noun',
          },
          { ...dog.senses[1]!, grammarNote: 'used with classifiers' },
        ],
      },
    ]);
    const encyclopedicAt = xml!.indexOf('<note type="encyclopedic">');
    const grammarAt = xml!.indexOf('<note type="grammar">');
    expect(encyclopedicAt).toBeGreaterThanOrEqual(0);
    expect(grammarAt).toBeGreaterThan(encyclopedicAt);
    expect(xml).toContain(
      '<note type="grammar"><form lang="und"><text>count noun</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.grammarNote).toBe('count noun');
    expect(parsed.lexemes[0]?.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(parsed.lexemes[0]?.senses[1]?.grammarNote).toBe('used with classifiers');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, encyclopedicNote: 'domestic canine' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('type="grammar"');
    expect(bare).toContain('type="encyclopedic"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          encyclopedicNote: 'domestic canine',
          grammarNote: 'count noun',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.grammarNote).toBeUndefined();
    expect(store[0]?.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(store[0]?.senses[1]?.grammarNote).toBeUndefined();
  });

  it('reads sense semantic domains and ignores an entry-level trait', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <trait name="semantic-domain-ddp4" value="9.1 Entry"/>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="grammar"><form lang="en"><text>count noun</text></form></note>
      <trait name="semantic-domain-ddp4" value="1.1 Sky"/>
      <trait name="morph-type" value="stem"/>
      <trait name="semantic-domain-ddp4" value=""/>
      <trait name="semantic-domain-ddp4" value="1.1 Sky"/>
      <trait name="semantic-domain-ddp4" value="1.2 World"/>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <trait name="semantic-domain-ddp4" value="2.1 Body"/>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('semanticDomains');
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky', '1.2 World']);
    expect(parsed.lexemes[0]?.senses[0]?.grammarNote).toBe('count noun');
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('stem');
    expect(parsed.lexemes[0]?.senses[1]?.semanticDomains).toEqual(['2.1 Body']);
  });

  it('round-trips sense semantic domains and drops them when the traits are omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            grammarNote: 'count noun',
            semanticDomains: ['1.1 Sky', 'Sky & weather'],
          },
          { ...dog.senses[1]!, parentId: 'sense_primary', semanticDomains: ['2.1 Body'] },
        ],
      },
    ]);
    const grammarAt = xml!.indexOf('<note type="grammar">');
    const traitAt = xml!.indexOf('<trait name="semantic-domain-ddp4"');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(grammarAt).toBeGreaterThanOrEqual(0);
    expect(traitAt).toBeGreaterThan(grammarAt);
    expect(subsenseAt).toBeGreaterThan(traitAt);
    expect(xml).toContain('<trait name="semantic-domain-ddp4" value="1.1 Sky"/>');
    expect(xml).toContain('<trait name="semantic-domain-ddp4" value="Sky &amp; weather"/>');
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky', 'Sky & weather']);
    expect(parsed.lexemes[0]?.senses[0]?.grammarNote).toBe('count noun');
    expect(parsed.lexemes[0]?.senses[1]?.semanticDomains).toEqual(['2.1 Body']);

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, grammarNote: 'count noun' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('semantic-domain-ddp4');
    expect(bare).toContain('type="grammar"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          grammarNote: 'count noun',
          semanticDomains: ['1.1 Sky'],
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.semanticDomains).toBeUndefined();
    expect(store[0]?.senses[0]?.grammarNote).toBe('count noun');
    expect(store[0]?.senses[1]?.semanticDomains).toBeUndefined();
  });

  it('reads a sense phonology note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="phonology"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <trait name="semantic-domain-ddp4" value="1.1 Sky"/>
      <note><form lang="en"><text>general note</text></form></note>
      <note type="phonology">
        <form><text>nolang</text></form>
        <form lang="en"><text>tone on the first syllable</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="phonology"><form lang="en"><text>stress final</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('phonologyNote');
    expect(parsed.lexemes[0]?.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('general note');
    expect(parsed.lexemes[0]?.senses[1]?.phonologyNote).toBe('stress final');
  });

  it('round-trips sense phonology notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            semanticDomains: ['1.1 Sky'],
            phonologyNote: 'tone on the first syllable',
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            phonologyNote: 'stress final',
          },
        ],
      },
    ]);
    const domainAt = xml!.indexOf('<trait name="semantic-domain-ddp4"');
    const phonologyAt = xml!.indexOf('<note type="phonology">');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(domainAt).toBeGreaterThanOrEqual(0);
    expect(phonologyAt).toBeGreaterThan(domainAt);
    expect(subsenseAt).toBeGreaterThan(phonologyAt);
    expect(xml).toContain(
      '<note type="phonology"><form lang="und"><text>tone on the first syllable</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(parsed.lexemes[0]?.senses[1]?.phonologyNote).toBe('stress final');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, semanticDomains: ['1.1 Sky'] }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('type="phonology"');
    expect(bare).toContain('semantic-domain-ddp4');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          semanticDomains: ['1.1 Sky'],
          phonologyNote: 'tone on the first syllable',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.phonologyNote).toBeUndefined();
    expect(store[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(store[0]?.senses[1]?.phonologyNote).toBeUndefined();
  });

  it('reads a sense semantics note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="semantics"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="phonology"><form lang="en"><text>tone on the first syllable</text></form></note>
      <note><form lang="en"><text>general note</text></form></note>
      <trait name="semantic-domain-ddp4" value="1.1 Sky"/>
      <note type="semantics">
        <form><text>nolang</text></form>
        <form lang="en"><text>narrows to the daytime sky</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="semantics"><form lang="en"><text>companion animal</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('semanticsNote');
    expect(parsed.lexemes[0]?.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(parsed.lexemes[0]?.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('general note');
    expect(parsed.lexemes[0]?.senses[1]?.semanticsNote).toBe('companion animal');
  });

  it('round-trips sense semantics notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            phonologyNote: 'tone on the first syllable',
            semanticsNote: 'narrows to the daytime sky',
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            semanticsNote: 'companion animal',
          },
        ],
      },
    ]);
    const phonologyAt = xml!.indexOf('<note type="phonology">');
    const semanticsAt = xml!.indexOf('<note type="semantics">');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(phonologyAt).toBeGreaterThanOrEqual(0);
    expect(semanticsAt).toBeGreaterThan(phonologyAt);
    expect(subsenseAt).toBeGreaterThan(semanticsAt);
    expect(xml).toContain(
      '<note type="semantics"><form lang="und"><text>narrows to the daytime sky</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(parsed.lexemes[0]?.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(parsed.lexemes[0]?.senses[1]?.semanticsNote).toBe('companion animal');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          { ...dog.senses[0]!, phonologyNote: 'tone on the first syllable' },
          dog.senses[1]!,
        ],
      },
    ]);
    expect(bare).not.toContain('type="semantics"');
    expect(bare).toContain('type="phonology"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          phonologyNote: 'tone on the first syllable',
          semanticsNote: 'narrows to the daytime sky',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.semanticsNote).toBeUndefined();
    expect(store[0]?.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(store[0]?.senses[1]?.semanticsNote).toBeUndefined();
  });

  it('reads a sense sociolinguistics note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="sociolinguistics"><form lang="en"><text>entry note</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="semantics"><form lang="en"><text>narrows to the daytime sky</text></form></note>
      <note><form lang="en"><text>general note</text></form></note>
      <note type="sociolinguistics">
        <form><text>nolang</text></form>
        <form lang="en"><text>used by elders</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="sociolinguistics"><form lang="en"><text>child directed</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('sociolinguisticsNote');
    expect(parsed.lexemes[0]?.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(parsed.lexemes[0]?.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('general note');
    expect(parsed.lexemes[0]?.senses[1]?.sociolinguisticsNote).toBe('child directed');
  });

  it('round-trips sense sociolinguistics notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            semanticsNote: 'narrows to the daytime sky',
            sociolinguisticsNote: 'used by elders',
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            sociolinguisticsNote: 'child directed',
          },
        ],
      },
    ]);
    const semanticsAt = xml!.indexOf('<note type="semantics">');
    const socioAt = xml!.indexOf('<note type="sociolinguistics">');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(semanticsAt).toBeGreaterThanOrEqual(0);
    expect(socioAt).toBeGreaterThan(semanticsAt);
    expect(subsenseAt).toBeGreaterThan(socioAt);
    expect(xml).toContain(
      '<note type="sociolinguistics"><form lang="und"><text>used by elders</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(parsed.lexemes[0]?.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(parsed.lexemes[0]?.senses[1]?.sociolinguisticsNote).toBe('child directed');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          { ...dog.senses[0]!, semanticsNote: 'narrows to the daytime sky' },
          dog.senses[1]!,
        ],
      },
    ]);
    expect(bare).not.toContain('type="sociolinguistics"');
    expect(bare).toContain('type="semantics"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          semanticsNote: 'narrows to the daytime sky',
          sociolinguisticsNote: 'used by elders',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.sociolinguisticsNote).toBeUndefined();
    expect(store[0]?.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(store[0]?.senses[1]?.sociolinguisticsNote).toBeUndefined();
  });

  it('reads a sense source note and ignores an entry-level note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <note type="source"><form lang="en"><text>entry source</text></form></note>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="sociolinguistics"><form lang="en"><text>used by elders</text></form></note>
      <note><form lang="en"><text>general note</text></form></note>
      <note type="source">
        <form><text>nolang</text></form>
        <form lang="en"><text>from a neighboring dialect</text></form>
      </note>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <note type="source"><form lang="en"><text>borrowed in speech</text></form></note>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('sourceNote');
    expect(parsed.lexemes[0]?.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(parsed.lexemes[0]?.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('general note');
    expect(parsed.lexemes[0]?.senses[1]?.sourceNote).toBe('borrowed in speech');
  });

  it('round-trips sense source notes and drops them when the sense note is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            sociolinguisticsNote: 'used by elders',
            sourceNote: 'from a neighboring dialect',
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            sourceNote: 'borrowed in speech',
          },
        ],
      },
    ]);
    const socioAt = xml!.indexOf('<note type="sociolinguistics">');
    const sourceAt = xml!.indexOf('<note type="source">');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(socioAt).toBeGreaterThanOrEqual(0);
    expect(sourceAt).toBeGreaterThan(socioAt);
    expect(subsenseAt).toBeGreaterThan(sourceAt);
    expect(xml).toContain(
      '<note type="source"><form lang="und"><text>from a neighboring dialect</text></form></note>',
    );
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(parsed.lexemes[0]?.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(parsed.lexemes[0]?.senses[1]?.sourceNote).toBe('borrowed in speech');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, sociolinguisticsNote: 'used by elders' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('type="source"');
    expect(bare).toContain('type="sociolinguistics"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          sociolinguisticsNote: 'used by elders',
          sourceNote: 'from a neighboring dialect',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.sourceNote).toBeUndefined();
    expect(store[0]?.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(store[0]?.senses[1]?.sourceNote).toBeUndefined();
  });

  it('reads sense usages and ignores an entry-level trait', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <trait name="usage-type" value="archaic"/>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <note type="source"><form lang="en"><text>from a neighboring dialect</text></form></note>
      <trait name="morph-type" value="stem"/>
      <trait name="semantic-domain-ddp4" value="1.1 Sky"/>
      <trait name="usage-type" value=""/>
      <trait name="usage-type" value="formal"/>
      <trait name="usage-type" value="formal"/>
      <trait name="usage-type" value="child directed"/>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <trait name="usage-type" value="informal"/>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('usages');
    expect(parsed.lexemes[0]?.senses[0]?.usages).toEqual(['formal', 'child directed']);
    expect(parsed.lexemes[0]?.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(parsed.lexemes[0]?.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('stem');
    expect(parsed.lexemes[0]?.senses[1]?.usages).toEqual(['informal']);
  });

  it('round-trips sense usages and drops them when the traits are omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            sourceNote: 'from a neighboring dialect',
            usages: ['formal', 'child directed'],
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            usages: ['informal'],
          },
        ],
      },
    ]);
    const sourceAt = xml!.indexOf('<note type="source">');
    const usageAt = xml!.indexOf('<trait name="usage-type"');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(sourceAt).toBeGreaterThanOrEqual(0);
    expect(usageAt).toBeGreaterThan(sourceAt);
    expect(subsenseAt).toBeGreaterThan(usageAt);
    expect(xml).toContain('<trait name="usage-type" value="formal"/>');
    expect(xml).toContain('<trait name="usage-type" value="child directed"/>');
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.usages).toEqual(['formal', 'child directed']);
    expect(parsed.lexemes[0]?.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(parsed.lexemes[0]?.senses[1]?.usages).toEqual(['informal']);

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, sourceNote: 'from a neighboring dialect' }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('usage-type');
    expect(bare).toContain('type="source"');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          sourceNote: 'from a neighboring dialect',
          usages: ['formal', 'child directed'],
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.usages).toBeUndefined();
    expect(store[0]?.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(store[0]?.senses[1]?.usages).toBeUndefined();
  });

  it('reads one sense type and ignores an entry-level trait', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="FLEx">
  <entry id="lex-dog">
    <lexical-unit><form lang="eng"><text>dog</text></form></lexical-unit>
    <trait name="sense-type" value="entry type"/>
    <sense id="sense_primary">
      <gloss lang="eng"><text>canine</text></gloss>
      <trait name="usage-type" value="formal"/>
      <trait name="morph-type" value="stem"/>
      <trait name="sense-type" value=""/>
      <trait name="sense-type" value="figurative"/>
      <trait name="sense-type" value="primary"/>
    </sense>
    <sense id="sense_pet">
      <gloss lang="eng"><text>pet</text></gloss>
      <trait name="sense-type" value="literal"/>
    </sense>
  </entry>
</lift>`;
    const parsed = parseLiftXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]).not.toHaveProperty('senseType');
    expect(parsed.lexemes[0]?.lexemeType).toBeUndefined();
    expect(parsed.lexemes[0]?.senses[0]?.senseType).toBe('figurative');
    expect(parsed.lexemes[0]?.senses[0]?.usages).toEqual(['formal']);
    expect(JSON.stringify(parsed.lexemes[0]?.senses[0])).not.toContain('stem');
    expect(parsed.lexemes[0]?.senses[1]?.senseType).toBe('literal');
  });

  it('round-trips one sense type and drops it when the trait is omitted', async () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          {
            ...dog.senses[0]!,
            usages: ['formal'],
            senseType: 'figurative & extended',
          },
          {
            ...dog.senses[1]!,
            parentId: 'sense_primary',
            senseType: 'literal',
          },
        ],
      },
    ]);
    const usageAt = xml!.indexOf('<trait name="usage-type"');
    const typeAt = xml!.indexOf('<trait name="sense-type"');
    const subsenseAt = xml!.indexOf('<subsense');
    expect(usageAt).toBeGreaterThanOrEqual(0);
    expect(typeAt).toBeGreaterThan(usageAt);
    expect(subsenseAt).toBeGreaterThan(typeAt);
    expect(xml).toContain('<trait name="sense-type" value="figurative &amp; extended"/>');
    const parsed = parseLiftXml(xml!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lexemes[0]?.senses[0]?.senseType).toBe('figurative & extended');
    expect(parsed.lexemes[0]?.senses[0]?.usages).toEqual(['formal']);
    expect(parsed.lexemes[0]?.senses[1]?.senseType).toBe('literal');

    const bare = serializeLexemesToLift([
      {
        ...dog,
        senses: [{ ...dog.senses[0]!, usages: ['formal'] }, dog.senses[1]!],
      },
    ]);
    expect(bare).not.toContain('sense-type');
    expect(bare).toContain('usage-type');
    const existing: LexemeDocType = {
      ...dog,
      senses: [
        {
          ...dog.senses[0]!,
          usages: ['formal'],
          senseType: 'figurative',
        },
        dog.senses[1]!,
      ],
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
    expect(store[0]?.senses[0]?.senseType).toBeUndefined();
    expect(store[0]?.senses[0]?.usages).toEqual(['formal']);
    expect(store[0]?.senses[1]?.senseType).toBeUndefined();
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
