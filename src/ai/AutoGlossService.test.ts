// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { AutoGlossService } from './AutoGlossService';

const NOW = new Date().toISOString();

async function clearTables(): Promise<void> {
  await Promise.all([
    db.utterance_tokens.clear(),
    db.lexemes.clear(),
    db.token_lexeme_links.clear(),
    db.ai_tasks.clear(),
  ]);
}

describe('AutoGlossService', () => {
  beforeEach(async () => {
    await db.open();
    await clearTables();
  });

  afterEach(async () => {
    await clearTables();
  });

  it('matches token form to lexeme lemma and writes gloss', async () => {
    await db.utterance_tokens.put({
      id: 'tok_1',
      textId: 't1',
      utteranceId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUtterance('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.gloss).toEqual({ eng: 'canine' });
    expect(result.matched[0]?.lexemeId).toBe('lex_1');
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify token was updated
    const updated = await db.utterance_tokens.get('tok_1');
    expect(updated?.gloss).toEqual({ eng: 'canine' });

    // Verify link was created
    const links = await db.token_lexeme_links.where('[targetType+targetId]').equals(['token', 'tok_1']).toArray();
    expect(links.length).toBe(1);
    expect(links[0]?.lexemeId).toBe('lex_1');
    expect(links[0]?.role).toBe('exact');

    // Verify ai task lifecycle is tracked via TaskRunner
    expect(typeof result.taskId).toBe('string');
    const task = await db.ai_tasks.get(result.taskId!);
    expect(task?.taskType).toBe('gloss');
    expect(task?.status).toBe('done');
  });

  it('skips tokens that already have a gloss', async () => {
    await db.utterance_tokens.put({
      id: 'tok_1',
      textId: 't1',
      utteranceId: 'utt_1',
      form: { default: 'dog' },
      gloss: { eng: 'existing' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUtterance('utt_1');

    expect(result.matched.length).toBe(0);
    expect(result.skipped).toBe(1);

    // Gloss should not have been overwritten
    const tok = await db.utterance_tokens.get('tok_1');
    expect(tok?.gloss).toEqual({ eng: 'existing' });
  });

  it('case-insensitive matching of form to lemma', async () => {
    await db.utterance_tokens.put({
      id: 'tok_1',
      textId: 't1',
      utteranceId: 'utt_1',
      form: { default: 'Dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUtterance('utt_1');

    expect(result.matched.length).toBe(1);
  });

  it('returns empty matches when no lexemes match', async () => {
    await db.utterance_tokens.put({
      id: 'tok_1',
      textId: 't1',
      utteranceId: 'utt_1',
      form: { default: 'xyz' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUtterance('utt_1');

    expect(result.matched.length).toBe(0);
    expect(result.total).toBe(1);
  });

  it('skips lexemes with empty senses array', async () => {
    await db.utterance_tokens.put({
      id: 'tok_1',
      textId: 't1',
      utteranceId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUtterance('utt_1');

    expect(result.matched.length).toBe(0);
  });

  it('returns empty when utterance has no tokens', async () => {
    const service = new AutoGlossService();
    const result = await service.glossUtterance('nonexistent');

    expect(result.matched.length).toBe(0);
    expect(result.total).toBe(0);
  });
});
