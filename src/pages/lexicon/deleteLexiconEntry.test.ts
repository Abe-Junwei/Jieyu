// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import * as workspaceEvents from '../../utils/workspaceEvents';
import { deleteLexiconEntry } from './deleteLexiconEntry';

const now = '2026-09-19T12:00:00.000Z';

describe('deleteLexiconEntry', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.lexemes.clear();
    await db.token_lexeme_links.clear();
    await db.lexeme_asset_links.clear();
    await db.lexeme_assets.clear();
  });

  it('rejects an empty id', async () => {
    await expect(deleteLexiconEntry('  ')).rejects.toThrow(/empty lexeme id/);
  });

  it('hard-deletes a lexeme, cascades links and unshared attachments, then list readback is empty', async () => {
    const deleted = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeDeleted');

    await LinguisticService.lexemes.save({
      id: 'lex-dog',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'canine' } }],
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.put({
      id: 'link-dog-1',
      targetType: 'token',
      targetId: 'tok-1',
      lexemeId: 'lex-dog',
      createdAt: now,
      updatedAt: now,
    });
    const blob = new Blob(['woof'], { type: 'image/png' });
    await LinguisticService.lexemes.attachFile('lex-dog', blob, { displayName: 'dog.png' });

    await deleteLexiconEntry('lex-dog');

    const remaining = await LinguisticService.lexemes.list();
    expect(remaining.find((row) => row.id === 'lex-dog')).toBeUndefined();
    expect(await db.token_lexeme_links.where('lexemeId').equals('lex-dog').count()).toBe(0);
    expect(await db.lexeme_asset_links.where('lexemeId').equals('lex-dog').count()).toBe(0);
    expect(await db.lexeme_assets.count()).toBe(0);
    expect(deleted).toHaveBeenCalledWith({ lexemeId: 'lex-dog', deletionMode: 'hard' });
  });

  it('does not emit when the lexeme is missing', async () => {
    const deleted = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeDeleted');
    await expect(deleteLexiconEntry('lex-missing')).rejects.toThrow(/NOT_FOUND/);
    expect(deleted).not.toHaveBeenCalled();
  });
});
