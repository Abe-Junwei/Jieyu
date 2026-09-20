import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  applyLexiconEntryFields,
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
    extraSenses: { gloss: string; definition: string }[];
    forms: string[];
  }> & { lemma: string },
) {
  return {
    gloss: '',
    citationForm: '',
    language: '',
    notes: '',
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
        forms: ['dogs', '  ', 'doggie'],
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
        forms: ['dogs', 'doggie'],
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
        forms: ['', ''],
      }),
    });
    expect(cleared.senses).toHaveLength(1);
    expect(cleared.forms).toBeUndefined();
  });
});
