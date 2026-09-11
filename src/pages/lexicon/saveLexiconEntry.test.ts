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
    expect(() =>
      applyLexiconEntryFields(
        null,
        {
          lemma: '  ',
          gloss: 'x',
          citationForm: '',
          language: '',
          notes: '',
        },
        now,
      ),
    ).toThrow(/empty lemma/);
  });

  it('creates then updates a lexeme with list readback', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: {
        lemma: 'dog',
        gloss: 'canine',
        citationForm: 'dog',
        language: 'eng',
        notes: 'field note',
      },
    });
    expect(created.lemma.default).toBe('dog');
    expect(created.senses[0]?.gloss.default).toBe('canine');
    expect(created.citationForm).toBe('dog');

    const requery = await LinguisticService.lexemes.list();
    expect(requery.find((row) => row.id === created.id)?.notes?.default).toBe('field note');

    const updated = await saveLexiconEntry({
      existing: created,
      fields: {
        lemma: 'hound',
        gloss: 'hunting dog',
        citationForm: '',
        language: 'eng',
        notes: '',
      },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.lemma.default).toBe('hound');
    expect(updated.citationForm).toBeUndefined();
    const after = await LinguisticService.lexemes.list();
    expect(after.find((row) => row.id === created.id)?.senses[0]?.gloss.default).toBe(
      'hunting dog',
    );
  });
});
