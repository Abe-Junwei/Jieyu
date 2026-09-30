import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { isLexemeEntry } from '../../db/lexemeNestedIds';
import { LinguisticService } from '../../services/LinguisticService';
import { entryDoc } from '../../utils/dmlexEntry';
import {
  removeAnnotationTokenLexemeLink,
  saveAnnotationTokenLexemeLink,
} from './saveAnnotationLexemeLink';

describe('saveAnnotationLexemeLink', () => {
  const now = '2026-09-04T16:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.lexemes.clear(), db.token_lexeme_links.clear()]);
    await db.lexemes.put(
      entryDoc({ id: 'lex-hello', headword: 'hello', createdAt: now, updatedAt: now }),
    );
  });

  it('restores the previous sense link when replacement insertion fails', async () => {
    const lexeme = await db.lexemes.get('lex-hello');
    if (!lexeme || !isLexemeEntry(lexeme)) throw new Error('lexeme fixture missing');
    lexeme.entry.senses = [{ id: 'sense-original' }];
    await db.lexemes.put(lexeme);
    await saveAnnotationTokenLexemeLink('tok-rollback', 'hello');
    const before = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-rollback');
    expect(before[0]?.senseId).toBe('sense-original');
    const fail = () => {
      throw new Error('injected link failure');
    };
    db.token_lexeme_links.hook('creating', fail);
    try {
      await expect(saveAnnotationTokenLexemeLink('tok-rollback', 'hello')).rejects.toThrow(
        'injected link failure',
      );
    } finally {
      db.token_lexeme_links.hook('creating').unsubscribe(fail);
    }
    expect(await LinguisticService.units.listTokenLexemeLinks('token', 'tok-rollback')).toEqual(
      before,
    );
  });

  it('links a token to a lexeme then readback matches', async () => {
    const result = await saveAnnotationTokenLexemeLink('tok-link-1', 'hello');
    expect(result.kind).toBe('linked');
    if (result.kind !== 'linked') return;
    expect(result.view.lexemeId).toBe('lex-hello');
    expect(result.view.lemma).toBe('hello');

    const requery = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-1');
    expect(requery).toHaveLength(1);
    expect(requery[0]?.lexemeId).toBe('lex-hello');
    expect(requery[0]?.role).toBe('manual');
  });

  it('asks for a sense when the entry has more than one, then stores the chosen id', async () => {
    const doc = entryDoc({
      id: 'lex-play',
      headword: 'play',
      translation: 'perform',
      createdAt: now,
      updatedAt: now,
    });
    doc.entry.senses = [
      { id: 'sense-perform', headwordTranslations: [{ text: 'perform', langCode: 'eng' }] },
      { id: 'sense-game', headwordTranslations: [{ text: 'game', langCode: 'eng' }] },
    ];
    await db.lexemes.put(doc);

    const pending = await saveAnnotationTokenLexemeLink('tok-link-3', 'play');
    expect(pending).toEqual({
      kind: 'choose-sense',
      senses: [
        { senseId: 'sense-perform', label: 'perform' },
        { senseId: 'sense-game', label: 'game' },
      ],
    });
    expect(await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-3')).toHaveLength(
      0,
    );

    const linked = await saveAnnotationTokenLexemeLink('tok-link-3', 'play', 'sense-game');
    expect(linked.kind).toBe('linked');
    if (linked.kind !== 'linked') return;
    expect(linked.view.senseId).toBe('sense-game');
    expect(linked.view.senseGloss).toBe('game');
    const requery = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-3');
    expect(requery[0]?.senseId).toBe('sense-game');
  });

  it('unlinks then readback is empty', async () => {
    await saveAnnotationTokenLexemeLink('tok-link-2', 'hello');
    await removeAnnotationTokenLexemeLink('tok-link-2');
    const requery = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-link-2');
    expect(requery).toHaveLength(0);
  });
});
