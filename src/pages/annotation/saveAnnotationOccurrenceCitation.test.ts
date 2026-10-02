import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, isLexemeEntry } from '../../db';
import { entryDoc } from '../../utils/dmlexEntry';
import { saveAnnotationOccurrenceCitation } from './saveAnnotationOccurrenceCitation';

describe('saveAnnotationOccurrenceCitation', () => {
  const now = '2026-10-02T00:00:00.000Z';

  beforeEach(async () => {
    await db.lexemes.clear();
  });

  it('appends a citation while keeping the existing senses', async () => {
    await db.lexemes.put(
      entryDoc({ id: 'lex-cite', headword: 'dog', translation: '狗', createdAt: now }),
    );

    await saveAnnotationOccurrenceCitation({
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'tok-1',
      lexemeId: 'lex-cite',
      senseId: 'lex-cite-sense',
    });

    const row = await db.lexemes.get('lex-cite');
    expect(row).toBeDefined();
    if (!row || !isLexemeEntry(row)) throw new Error('lexeme row missing');
    expect(row.entry.headword).toBe('dog');
    expect(row.entry.senses?.map((sense) => sense.id)).toEqual(['lex-cite-sense']);
    expect(row.entry.senses?.[0]?.headwordTranslations?.[0]?.text).toBe('狗');
    expect(row.jieyu?.occurrenceCitations).toEqual([
      {
        textId: 'text-1',
        unitId: 'unit-1',
        tokenId: 'tok-1',
        lexemeId: 'lex-cite',
        senseId: 'lex-cite-sense',
      },
    ]);

    await saveAnnotationOccurrenceCitation({
      textId: 'text-1',
      unitId: 'unit-2',
      tokenId: 'tok-2',
      lexemeId: 'lex-cite',
      senseId: 'lex-cite-sense',
    });

    const twice = await db.lexemes.get('lex-cite');
    if (!twice || !isLexemeEntry(twice)) throw new Error('lexeme row missing');
    expect(twice.jieyu?.occurrenceCitations?.map((cite) => cite.tokenId)).toEqual([
      'tok-1',
      'tok-2',
    ]);
    expect(twice.entry.senses?.map((sense) => sense.id)).toEqual(['lex-cite-sense']);
  });

  it('does nothing when the lexeme id does not exist', async () => {
    await saveAnnotationOccurrenceCitation({
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'tok-1',
      lexemeId: 'lex-missing',
      senseId: 'sense-1',
    });
    expect(await db.lexemes.get('lex-missing')).toBeUndefined();
  });
});
