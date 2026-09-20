import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import { assignLexemeNestedIdsInPlace, ensureLexemeNestedIds } from '../lexemeNestedIds';
import { upgradeV54LexemeNestedIds } from './m54LexemeNestedIds';
import type { LexemeDocType } from '../types';

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
  it('backfills missing sense and form ids and preserves existing ones', async () => {
    const name = `m54_lexeme_ids_${Date.now()}`;
    const d = new LexemeNestedIdTestDexie(name);
    await d.open();
    await d.lexemes.put({
      id: 'lex-dog',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'canine' } }, { id: 'sense_keep', gloss: { default: 'pet' } }],
      forms: [{ transcription: { default: 'dogs' } }],
      createdAt: now,
      updatedAt: now,
    });

    await d.transaction('rw', d.lexemes, async (tx) => {
      await upgradeV54LexemeNestedIds(tx);
    });

    const row = await d.lexemes.get('lex-dog');
    expect(row?.senses[0]?.id).toMatch(/^sense_/);
    expect(row?.senses[1]?.id).toBe('sense_keep');
    expect(row?.forms?.[0]?.id).toMatch(/^form_/);
    await d.delete();
  });

  it('is a no-op when nested ids already exist', async () => {
    const name = `m54_lexeme_ids_noop_${Date.now()}`;
    const d = new LexemeNestedIdTestDexie(name);
    await d.open();
    await d.lexemes.put({
      id: 'lex-cat',
      lemma: { default: 'cat' },
      senses: [{ id: 'sense_cat', gloss: { default: 'feline' } }],
      forms: [{ id: 'form_cat', transcription: { default: 'cats' } }],
      createdAt: now,
      updatedAt: now,
    });
    await d.transaction('rw', d.lexemes, async (tx) => {
      await upgradeV54LexemeNestedIds(tx);
    });
    const row = await d.lexemes.get('lex-cat');
    expect(row?.senses[0]?.id).toBe('sense_cat');
    expect(row?.forms?.[0]?.id).toBe('form_cat');
    await d.delete();
  });
});

describe('ensureLexemeNestedIds', () => {
  it('does not mutate the input and keeps existing ids', () => {
    const input: LexemeDocType = {
      id: 'lex-in',
      lemma: { default: 'in' },
      senses: [{ id: 'sense_in', gloss: { default: 'inside' } }],
      createdAt: now,
      updatedAt: now,
    };
    const next = ensureLexemeNestedIds(input);
    expect(next.senses[0]?.id).toBe('sense_in');
    expect(input.senses[0]?.id).toBe('sense_in');
    expect(assignLexemeNestedIdsInPlace(input)).toBe(false);
  });
});
