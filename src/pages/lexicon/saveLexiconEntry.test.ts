import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  applyLexiconEntryFields,
  draftIdFromNested,
  mergeLexemeIntoList,
  readPrimaryMultiLang,
  saveLexiconEntry,
  writePrimaryMultiLang,
} from './saveLexiconEntry';

function fields(
  partial: Partial<{
    lemma: string;
    gloss: string;
    citationForm: string;
    language: string;
    notes: string;
    category: string;
    lexemeType: string;
    pronunciation: string;
    etymologyForm: string;
    etymologyGloss: string;
    etymologySourceLanguage: string;
    literalMeaning: string;
    summaryDefinition: string;
    bibliography: string;
    restrictions: string;
    primarySenseId: string;
    examples: { source: string; translation?: string }[];
    extraSenses: {
      id?: string;
      parentId?: string;
      gloss: string;
      definition: string;
      category?: string;
      examples?: { source: string; translation?: string }[];
    }[];
    forms: { id?: string; transcription: string }[];
  }> & { lemma: string },
) {
  return {
    gloss: '',
    category: '',
    citationForm: '',
    language: '',
    notes: '',
    lexemeType: '',
    pronunciation: '',
    etymologyForm: '',
    etymologyGloss: '',
    etymologySourceLanguage: '',
    literalMeaning: '',
    summaryDefinition: '',
    bibliography: '',
    restrictions: '',
    examples: [],
    extraSenses: [],
    forms: [],
    ...partial,
  };
}

describe('saveLexiconEntry', () => {
  const now = '2026-09-11T10:00:00.000Z';

  beforeEach(async () => {
    await db.lexemes.clear();
  });

  it('writes onto the first existing gloss key instead of adding default', () => {
    expect(writePrimaryMultiLang({ eng: 'canine' }, 'dog')).toEqual({ eng: 'dog' });
    expect(readPrimaryMultiLang({ eng: 'canine' })).toBe('canine');
  });

  it('replaces an existing list row and appends a new id', () => {
    const dog = {
      id: 'lex-dog',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'canine' } }],
      createdAt: now,
      updatedAt: now,
    };
    const hound = { ...dog, lemma: { default: 'hound' } };
    expect(mergeLexemeIntoList([dog], hound)).toEqual([hound]);
    const cat = {
      id: 'lex-cat',
      lemma: { default: 'cat' },
      senses: [{ gloss: { default: 'feline' } }],
      createdAt: now,
      updatedAt: now,
    };
    expect(mergeLexemeIntoList([dog], cat)).toEqual([dog, cat]);
  });

  it('rejects an empty lemma', () => {
    expect(() => applyLexiconEntryFields(null, fields({ lemma: '  ', gloss: 'x' }), now)).toThrow(
      /empty lemma/,
    );
  });

  it('writes a sense part of speech and drops it when cleared', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: ' noun ',
        extraSenses: [{ gloss: 'pet', definition: '', category: ' verb ' }],
      }),
      now,
    );
    expect(created.senses[0]?.category).toBe('noun');
    expect(created.senses[1]?.category).toBe('verb');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', category: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.category).toBeUndefined();
    expect(cleared.senses[1]?.category).toBeUndefined();
  });

  it('writes sense examples, drops a blank source, and keeps entry-level examples', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withLegacy = { ...existing, examples: ['legacy note'] };
    const updated = applyLexiconEntryFields(
      withLegacy,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        examples: [{ source: ' the dog runs ', translation: ' 狗在跑 ' }],
        extraSenses: [
          { gloss: 'pet', definition: '', examples: [{ source: 'my pet', translation: ' ' }] },
        ],
      }),
      now,
    );
    expect(updated.senses[0]?.examples).toEqual([
      { source: 'the dog runs', translation: '狗在跑' },
    ]);
    expect(updated.senses[1]?.examples).toEqual([{ source: 'my pet' }]);
    expect(updated.examples).toEqual(['legacy note']);
    const extraId = updated.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      updated,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        examples: [{ source: '  ', translation: 'gone' }],
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', examples: [] }],
      }),
      now,
    );
    expect(cleared.senses[0]?.examples).toBeUndefined();
    expect(cleared.senses[1]?.examples).toBeUndefined();
    expect(cleared.examples).toEqual(['legacy note']);
  });

  it('writes lexeme type, drops it when cleared, and keeps morpheme type', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withTypes = { ...existing, lexemeType: 'word', morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withTypes,
      fields({ lemma: 'dog', gloss: 'canine', lexemeType: ' stem ' }),
      now,
    );
    expect(updated.lexemeType).toBe('stem');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', lexemeType: ' ' }),
      now,
    );
    expect(cleared.lexemeType).toBeUndefined();
  });

  it('writes a trimmed pronunciation and omits a blank one', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({ lemma: 'dog', gloss: 'canine', pronunciation: ' dɔg ' }),
      now,
    );
    expect(updated.pronunciation).toBe('dɔg');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', pronunciation: ' ' }),
      now,
    );
    expect(cleared.pronunciation).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes one etymology and omits it when the source form is blank', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        etymologyForm: ' perro ',
        etymologyGloss: ' dog ',
        etymologySourceLanguage: ' Spanish ',
      }),
      now,
    );
    expect(updated.etymology).toEqual({ form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' });
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', etymologyForm: ' ' }),
      now,
    );
    expect(cleared.etymology).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed literal meaning and omits a blank one', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: ' domestic animal ' }),
      now,
    );
    expect(updated.literalMeaning).toBe('domestic animal');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: ' ' }),
      now,
    );
    expect(cleared.literalMeaning).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed summary definition and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: 'domestic animal' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        literalMeaning: 'domestic animal',
        summaryDefinition: ' a canine kept at home ',
      }),
      now,
    );
    expect(updated.summaryDefinition).toBe('a canine kept at home');
    expect(updated.literalMeaning).toBe('domestic animal');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        literalMeaning: 'domestic animal',
        summaryDefinition: ' ',
      }),
      now,
    );
    expect(cleared.summaryDefinition).toBeUndefined();
    expect(cleared.literalMeaning).toBe('domestic animal');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed bibliography and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', notes: 'field note' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        notes: 'field note',
        bibliography: ' Smith 1990 ',
      }),
      now,
    );
    expect(updated.bibliography).toBe('Smith 1990');
    expect(updated.notes?.default).toBe('field note');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', notes: 'field note', bibliography: ' ' }),
      now,
    );
    expect(cleared.bibliography).toBeUndefined();
    expect(cleared.notes?.default).toBe('field note');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed restrictions value and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', bibliography: 'Smith 1990' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        bibliography: 'Smith 1990',
        restrictions: ' internal ',
      }),
      now,
    );
    expect(updated.restrictions).toBe('internal');
    expect(updated.bibliography).toBe('Smith 1990');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', bibliography: 'Smith 1990', restrictions: ' ' }),
      now,
    );
    expect(cleared.restrictions).toBeUndefined();
    expect(cleared.bibliography).toBe('Smith 1990');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('creates then updates a lexeme with list readback', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        citationForm: 'dog',
        language: 'eng',
        notes: 'field note',
      }),
    });
    expect(created.lemma.default).toBe('dog');
    expect(created.senses[0]?.gloss.default).toBe('canine');
    expect(created.citationForm).toBe('dog');

    const requery = await LinguisticService.lexemes.list();
    expect(requery.find((row) => row.id === created.id)?.notes?.default).toBe('field note');

    const updated = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'hound',
        gloss: 'hunting dog',
        citationForm: '',
        language: 'eng',
        notes: '',
      }),
    });
    expect(updated.id).toBe(created.id);
    expect(updated.lemma.default).toBe('hound');
    expect(updated.citationForm).toBeUndefined();
    const after = await LinguisticService.lexemes.list();
    expect(after.find((row) => row.id === created.id)?.senses[0]?.gloss.default).toBe(
      'hunting dog',
    );
  });

  it('writes extra senses and forms then drops empty rows', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { gloss: 'pet', definition: 'companion animal' },
          { gloss: '  ', definition: 'ignored' },
        ],
        forms: [{ transcription: 'dogs' }, { transcription: '  ' }, { transcription: 'doggie' }],
      }),
    });
    expect(created.senses).toHaveLength(2);
    expect(created.senses[1]?.gloss.default).toBe('pet');
    expect(created.senses[1]?.definition?.default).toBe('companion animal');
    expect(created.forms?.map((form) => form.transcription.default)).toEqual(['dogs', 'doggie']);
    expect(created.senses[0]?.id).toMatch(/^sense_/);
    expect(created.senses[1]?.id).toMatch(/^sense_/);
    expect(created.forms?.[0]?.id).toMatch(/^form_/);
    expect(created.forms?.[1]?.id).toMatch(/^form_/);
    const senseIds = created.senses.map((sense) => sense.id);
    const formIds = (created.forms ?? []).map((form) => form.id);

    const updated = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: 'pet', definition: 'companion animal' }],
        forms: [{ transcription: 'dogs' }, { transcription: 'doggie' }],
      }),
    });
    expect(updated.senses.map((sense) => sense.id)).toEqual(senseIds);
    expect((updated.forms ?? []).map((form) => form.id)).toEqual(formIds);

    const cleared = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: '', definition: '' }],
        forms: [{ transcription: '' }, { transcription: '' }],
      }),
    });
    expect(cleared.senses).toHaveLength(1);
    expect(cleared.forms).toBeUndefined();
  });

  it('keeps remaining nested ids after a middle extra sense or form is removed', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { gloss: 'pet', definition: 'companion' },
          { gloss: 'follow', definition: 'pursue' },
          { gloss: 'hot dog', definition: 'food' },
        ],
        forms: [{ transcription: 'dogs' }, { transcription: 'doggie' }, { transcription: 'hound' }],
      }),
    });
    const extra = created.senses.slice(1);
    const storedForms = created.forms ?? [];
    expect(extra).toHaveLength(3);
    expect(storedForms).toHaveLength(3);

    const afterDelete = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { ...draftIdFromNested(extra[0]?.id), gloss: 'pet', definition: 'companion' },
          { ...draftIdFromNested(extra[2]?.id), gloss: 'hot dog', definition: 'food' },
        ],
        forms: [
          { ...draftIdFromNested(storedForms[0]?.id), transcription: 'dogs' },
          { ...draftIdFromNested(storedForms[2]?.id), transcription: 'hound' },
        ],
      }),
      now,
    );
    expect(afterDelete.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((afterDelete.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
    expect(afterDelete.senses.map((sense) => readPrimaryMultiLang(sense.gloss))).toEqual([
      'canine',
      'pet',
      'hot dog',
    ]);

    const stored = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { ...draftIdFromNested(extra[0]?.id), gloss: 'pet', definition: 'companion' },
          { ...draftIdFromNested(extra[2]?.id), gloss: 'hot dog', definition: 'food' },
        ],
        forms: [
          { ...draftIdFromNested(storedForms[0]?.id), transcription: 'dogs' },
          { ...draftIdFromNested(storedForms[2]?.id), transcription: 'hound' },
        ],
      }),
    });
    expect(stored.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((stored.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
    const requery = await LinguisticService.lexemes.list();
    const readback = requery.find((row) => row.id === created.id);
    expect(readback?.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((readback?.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
  });

  it('persists a subsense parentId and drops children when the parent extra sense is removed', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: 'pet', definition: 'companion' }],
      }),
    });
    const primaryId = created.senses[0]?.id;
    const petId = created.senses[1]?.id;
    expect(primaryId).toBeTruthy();
    expect(petId).toBeTruthy();
    if (primaryId === undefined || petId === undefined) return;

    const withChild = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        primarySenseId: primaryId,
        extraSenses: [
          { ...draftIdFromNested(petId), gloss: 'pet', definition: 'companion' },
          {
            gloss: 'puppy',
            definition: 'young dog',
            parentId: petId,
          },
        ],
      }),
    });
    expect(withChild.senses[2]?.parentId).toBe(petId);
    const requery = await LinguisticService.lexemes.list();
    const readback = requery.find((row) => row.id === created.id);
    expect(readback?.senses[2]?.parentId).toBe(petId);

    const afterDelete = applyLexiconEntryFields(
      withChild,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [],
      }),
      now,
    );
    expect(afterDelete.senses.map((sense) => readPrimaryMultiLang(sense.gloss))).toEqual([
      'canine',
    ]);
  });
});
