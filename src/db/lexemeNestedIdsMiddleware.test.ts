/**
 * JY-23：词条校验器无副作用；嵌套 id 由独立中间件 / 导入归一化显式补齐。
 * JY-23: the lexeme validator is side-effect free; nested ids are filled explicitly by a
 * dedicated middleware and by import normalization.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { importDatabaseFromJson } from './io';
import { withLexemeNestedIds } from './lexemeNestedIds';
import { validateLexemeDoc } from './schemas';
import type { LexemeDocType, LexemeEntryDoc } from './types';

const NOW = '2026-10-09T00:00:00.000Z';
const TEXT_ID = 'text-lex';

function entryWithoutNestedIds(id: string): LexemeEntryDoc {
  return {
    id,
    textId: TEXT_ID,
    createdAt: NOW,
    updatedAt: NOW,
    entry: { headword: id, senses: [{ definitions: [] } as never, {} as never] },
  } as unknown as LexemeEntryDoc;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function expectNestedIds(doc: LexemeDocType | undefined, entryId: string): void {
  const entry = (doc as LexemeEntryDoc).entry as { id?: string; senses?: Array<{ id?: string }> };
  expect(entry.id).toBe(entryId);
  for (const sense of entry.senses ?? []) {
    expect(typeof sense.id).toBe('string');
    expect(sense.id!.length).toBeGreaterThan(0);
  }
}

describe('JY-23: validateLexemeDoc is side-effect free', () => {
  it('does not touch the input, even when nested ids are missing', () => {
    const doc = entryWithoutNestedIds('lex-pure');
    const before = structuredClone(doc);
    expect(() => validateLexemeDoc(deepFreeze(doc))).not.toThrow();
    expect(doc).toEqual(before);
  });

  it('still rejects invalid rows', () => {
    const doc = { ...entryWithoutNestedIds('lex-bad'), textId: '' } as LexemeEntryDoc;
    expect(() => validateLexemeDoc(doc)).toThrow();
  });
});

describe('JY-23: withLexemeNestedIds', () => {
  it('returns a filled copy and leaves the input alone', () => {
    const doc = deepFreeze(entryWithoutNestedIds('lex-copy'));
    const next = withLexemeNestedIds(doc);
    expect(next).not.toBe(doc);
    expectNestedIds(next, 'lex-copy');
    expect((doc.entry as { id?: string }).id).toBeUndefined();
  });

  it('returns the same reference when nothing is missing, and skips resource rows', () => {
    const complete = withLexemeNestedIds(entryWithoutNestedIds('lex-done'));
    expect(withLexemeNestedIds(complete)).toBe(complete);
    const resource = { id: 'res', kind: 'resource', resource: {}, textId: TEXT_ID };
    expect(withLexemeNestedIds(resource)).toBe(resource);
  });

  it('keeps existing ids', () => {
    const doc = entryWithoutNestedIds('lex-keep');
    (doc.entry as { id?: string }).id = 'entry-kept';
    (doc.entry.senses![0] as { id?: string }).id = 'sense-kept';
    const next = withLexemeNestedIds(doc) as LexemeEntryDoc;
    expect((next.entry as { id?: string }).id).toBe('entry-kept');
    expect((next.entry.senses![0] as { id?: string }).id).toBe('sense-kept');
    expect(typeof (next.entry.senses![1] as { id?: string }).id).toBe('string');
  });
});

describe('JY-23: Dexie writes still store nested ids (explicit middleware)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('put fills ids in the stored row without mutating the caller object', async () => {
    const doc = entryWithoutNestedIds('lex-put');
    const before = structuredClone(doc);
    await db.lexemes.put(doc);
    expect(doc).toEqual(before);
    expectNestedIds(await db.lexemes.get('lex-put'), 'lex-put');
  });

  it('bulkPut, update and modify (object and function) fill ids too', async () => {
    await db.lexemes.bulkPut([entryWithoutNestedIds('lex-a'), entryWithoutNestedIds('lex-b')]);
    expectNestedIds(await db.lexemes.get('lex-a'), 'lex-a');
    expectNestedIds(await db.lexemes.get('lex-b'), 'lex-b');

    await db.lexemes.update('lex-a', { 'entry.senses': [{}] } as never);
    expectNestedIds(await db.lexemes.get('lex-a'), 'lex-a');

    await db.lexemes
      .where('id')
      .equals('lex-b')
      .modify((row) => {
        (row as LexemeEntryDoc).entry.senses!.push({} as never);
      });
    const b = (await db.lexemes.get('lex-b')) as LexemeEntryDoc;
    expect(b.entry.senses).toHaveLength(3);
    expectNestedIds(b, 'lex-b');

    await db.lexemes
      .where('id')
      .equals('lex-b')
      .modify({ 'entry.senses': [{}] } as never);
    expectNestedIds(await db.lexemes.get('lex-b'), 'lex-b');
  });

  it('JSON import fills nested ids explicitly before validation and write', async () => {
    await importDatabaseFromJson(
      {
        schemaVersion: 4,
        collections: {
          texts: [{ id: TEXT_ID, title: { default: 'Lex' }, createdAt: NOW, updatedAt: NOW }],
          lexemes: [entryWithoutNestedIds('lex-imported')],
        },
      },
      { strategy: 'upsert' },
    );
    expectNestedIds(await db.lexemes.get('lex-imported'), 'lex-imported');
  });
});
