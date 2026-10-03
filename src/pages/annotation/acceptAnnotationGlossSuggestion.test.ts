import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { acceptAnnotationGlossSuggestion } from './acceptAnnotationGlossSuggestion';
import { saveAnnotationGlossByForm } from './saveAnnotationGlossByForm';

const now = '2026-09-30T00:00:00.000Z';

describe('acceptAnnotationGlossSuggestion', () => {
  beforeEach(async () => {
    await Promise.all([db.unit_tokens.clear(), db.token_lexeme_links.clear()]);
    await db.unit_tokens.bulkAdd([
      {
        id: 'tok-blank',
        textId: 'text-1',
        unitId: 'unit-1',
        form: { default: 'ka' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-source',
        textId: 'text-1',
        unitId: 'unit-2',
        form: { default: 'ka' },
        gloss: { eng: 'eat' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.token_lexeme_links.add({
      id: 'link-source',
      targetType: 'token',
      targetId: 'tok-source',
      lexemeId: 'lex-1',
      createdAt: now,
      updatedAt: now,
    });
  });

  it('writes the gloss as confirmed and leaves other links untouched', async () => {
    await acceptAnnotationGlossSuggestion('tok-blank', 'eat', 'eng');
    const blank = await db.unit_tokens.get('tok-blank');
    expect(blank?.gloss).toEqual({ eng: 'eat' });
    expect(blank?.provenance?.reviewStatus).toBe('confirmed');
    await saveAnnotationGlossByForm([]);
    const links = await db.token_lexeme_links.toArray();
    expect(links.map((link) => link.targetId)).toEqual(['tok-source']);
  });
});
