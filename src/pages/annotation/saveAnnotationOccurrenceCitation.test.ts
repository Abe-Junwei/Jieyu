import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, isLexemeEntry } from '../../db';
import { entryDoc } from '../../utils/dmlexEntry';
import * as workspaceEvents from '../../utils/workspaceEvents';
import {
  removeAnnotationOccurrenceCitation,
  saveAnnotationOccurrenceCitation,
} from './saveAnnotationOccurrenceCitation';

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

    await saveAnnotationOccurrenceCitation({
      textId: 'text-1',
      unitId: 'unit-3',
      tokenId: 'tok-1',
      lexemeId: 'lex-cite',
      senseId: 'lex-cite-sense',
    });
    const replaced = await db.lexemes.get('lex-cite');
    if (!replaced || !isLexemeEntry(replaced)) throw new Error('lexeme row missing');
    expect(replaced.jieyu?.occurrenceCitations).toEqual([
      {
        textId: 'text-1',
        unitId: 'unit-2',
        tokenId: 'tok-2',
        lexemeId: 'lex-cite',
        senseId: 'lex-cite-sense',
      },
      {
        textId: 'text-1',
        unitId: 'unit-3',
        tokenId: 'tok-1',
        lexemeId: 'lex-cite',
        senseId: 'lex-cite-sense',
      },
    ]);
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

  it('drops one citation from the fresh row, then clears an empty extra block', async () => {
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');
    await db.lexemes.put({
      ...entryDoc({ id: 'lex-cite', headword: 'dog', translation: '狗', createdAt: now }),
      jieyu: {
        occurrenceCitations: [
          {
            textId: 'text-1',
            unitId: 'unit-1',
            tokenId: 'tok-1',
            lexemeId: 'lex-cite',
            senseId: 'lex-cite-sense',
          },
          {
            textId: 'text-1',
            unitId: 'unit-2',
            tokenId: 'tok-2',
            lexemeId: 'lex-cite',
            senseId: 'lex-cite-sense',
          },
        ],
      },
    });

    await removeAnnotationOccurrenceCitation({
      textId: 'text-1',
      lexemeId: 'lex-cite',
      tokenId: 'tok-1',
    });

    const once = await db.lexemes.get('lex-cite');
    if (!once || !isLexemeEntry(once)) throw new Error('lexeme row missing');
    expect(once.jieyu?.occurrenceCitations?.map((cite) => cite.tokenId)).toEqual(['tok-2']);
    expect(once.entry.senses?.map((sense) => sense.id)).toEqual(['lex-cite-sense']);
    expect(announced).toHaveBeenCalledWith({ lexemeId: 'lex-cite' });

    announced.mockClear();
    await removeAnnotationOccurrenceCitation({
      textId: 'text-1',
      lexemeId: 'lex-cite',
      tokenId: 'tok-2',
    });
    const cleared = await db.lexemes.get('lex-cite');
    if (!cleared || !isLexemeEntry(cleared)) throw new Error('lexeme row missing');
    expect(cleared.jieyu).toBeUndefined();
    expect(cleared.entry.senses?.map((sense) => sense.id)).toEqual(['lex-cite-sense']);

    announced.mockClear();
    const beforeMissing = await db.lexemes.get('lex-cite');
    await removeAnnotationOccurrenceCitation({
      textId: 'text-1',
      lexemeId: 'lex-cite',
      tokenId: 'tok-2',
    });
    expect(await db.lexemes.get('lex-cite')).toEqual(beforeMissing);
    expect(announced).not.toHaveBeenCalled();
    announced.mockRestore();
  });

  it('leaves a lexeme from another project unchanged and does not announce', async () => {
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');
    await db.lexemes.put({
      ...entryDoc({
        id: 'lex-other',
        textId: 'other-project',
        headword: 'pine',
        translation: '松',
        createdAt: now,
      }),
      jieyu: {
        occurrenceCitations: [
          {
            textId: 'other-project',
            unitId: 'unit-1',
            tokenId: 'tok-1',
            lexemeId: 'lex-other',
            senseId: 'lex-other-sense',
          },
        ],
      },
    });
    const before = await db.lexemes.get('lex-other');

    await removeAnnotationOccurrenceCitation({
      textId: 'text-1',
      lexemeId: 'lex-other',
      tokenId: 'tok-1',
    });
    await saveAnnotationOccurrenceCitation({
      textId: 'text-1',
      unitId: 'unit-9',
      tokenId: 'tok-9',
      lexemeId: 'lex-other',
      senseId: 'lex-other-sense',
    });

    expect(await db.lexemes.get('lex-other')).toEqual(before);
    expect(announced).not.toHaveBeenCalled();
    announced.mockRestore();
  });
});
