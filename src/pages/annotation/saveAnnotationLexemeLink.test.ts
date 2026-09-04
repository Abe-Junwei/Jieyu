import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  removeAnnotationTokenLexemeLink,
  saveAnnotationTokenLexemeLink,
} from './saveAnnotationLexemeLink';

describe('saveAnnotationLexemeLink', () => {
  const now = '2026-09-04T16:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.lexemes.clear(), db.token_lexeme_links.clear()]);
    await db.lexemes.put({
      id: 'lex-hello',
      lemma: { default: 'hello' },
      senses: [],
      createdAt: now,
      updatedAt: now,
    });
  });

  it('links a token to a lexeme then readback matches', async () => {
    const view = await saveAnnotationTokenLexemeLink('tok-link-1', 'hello');
    expect(view.lexemeId).toBe('lex-hello');
    expect(view.lemma).toBe('hello');

    const requery = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-1');
    expect(requery).toHaveLength(1);
    expect(requery[0]?.lexemeId).toBe('lex-hello');
    expect(requery[0]?.role).toBe('manual');
  });

  it('unlinks then readback is empty', async () => {
    await saveAnnotationTokenLexemeLink('tok-link-2', 'hello');
    await removeAnnotationTokenLexemeLink('tok-link-2');
    const requery = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-2');
    expect(requery).toHaveLength(0);
  });
});
