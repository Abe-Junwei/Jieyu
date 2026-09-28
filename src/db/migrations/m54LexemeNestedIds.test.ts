import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import { assignLexemeNestedIdsInPlace, ensureLexemeNestedIds } from '../lexemeNestedIds';
import { upgradeV54LexemeNestedIds } from './m54LexemeNestedIds';
import type { LexemeDocType, LexemeEntryDoc } from '../types';

class LexemeNestedIdTestDexie extends Dexie {
  lexemes!: Table<LexemeDocType, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      lexemes: 'id, updatedAt',
    });
  }
}

const now = '2026-09-20T12:00:00.000Z';

describe('upgradeV54LexemeNestedIds', () => {
  it('backfills a missing entry id and sense id', async () => {
    const name = `m54_lexeme_ids_${Date.now()}`;
    const d = new LexemeNestedIdTestDexie(name);
    await d.open();
    await d.lexemes.put({
      id: 'lex-dog',
      entry: {
        headword: 'dog',
        senses: [{ headwordTranslations: [{ text: 'canine', langCode: 'en' }] }],
      },
      createdAt: now,
      updatedAt: now,
    });

    await d.transaction('rw', d.lexemes, async (tx) => {
      await upgradeV54LexemeNestedIds(tx);
    });

    const row = (await d.lexemes.get('lex-dog')) as LexemeEntryDoc;
    expect(row.entry.id).toBe('lex-dog');
    expect(row.entry.senses?.[0]?.id).toMatch(/^sense_/);
    await d.delete();
  });
});

describe('ensureLexemeNestedIds', () => {
  it('does not mutate the input and keeps existing ids', () => {
    const input: LexemeEntryDoc = {
      id: 'lex-in',
      entry: {
        id: 'lex-in',
        headword: 'in',
        senses: [{ id: 'sense_in', headwordTranslations: [{ text: 'inside', langCode: 'en' }] }],
      },
      createdAt: now,
      updatedAt: now,
    };
    const next = ensureLexemeNestedIds(input);
    expect(next.entry.senses?.[0]?.id).toBe('sense_in');
    expect(input.entry.senses?.[0]?.id).toBe('sense_in');
    expect(assignLexemeNestedIdsInPlace(input)).toBe(false);
  });
});
