// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { entryDoc } from '../utils/dmlexEntry';
import { AutoGlossService } from './AutoGlossService';

const NOW = new Date().toISOString();

function lexeme(id: string, headword: string, gloss?: string, inflected: string[] = []) {
  const doc = entryDoc({
    id,
    textId: 't1',
    headword,
    ...(gloss ? { translation: gloss, langCode: 'eng' } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  });
  if (inflected.length === 0) return doc;
  return {
    ...doc,
    entry: {
      ...doc.entry,
      inflectedForms: inflected.map((text) => ({ text })),
    },
  };
}

async function clearTables(): Promise<void> {
  await Promise.all([
    db.unit_tokens.clear(),
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

  // ── 精确匹配 | Exact match ──

  it('matches token form to lexeme lemma and writes gloss', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_1', 'dog', 'canine'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.gloss).toEqual({ eng: 'canine' });
    expect(result.matched[0]?.lexemeId).toBe('lex_1');
    expect(result.matched[0]?.confidence).toBe(1.0);
    expect(result.matched[0]?.matchType).toBe('exact');
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify token was updated
    const updated = await db.unit_tokens.get('tok_1');
    expect(updated?.gloss).toEqual({ eng: 'canine' });

    // Verify link was created
    const links = await db.token_lexeme_links
      .where('[targetType+targetId]')
      .equals(['token', 'tok_1'])
      .toArray();
    expect(links.length).toBe(1);
    expect(result.matched[0]?.linkId).toBe(links[0]?.id);
    expect(links[0]?.lexemeId).toBe('lex_1');
    expect(links[0]?.role).toBe('exact');

    // Verify ai task lifecycle is tracked via TaskRunner
    expect(typeof result.taskId).toBe('string');
    const task = await db.ai_tasks.get(result.taskId!);
    expect(task?.taskType).toBe('gloss');
    expect(task?.status).toBe('done');
  });

  it('ignores lexemes of another project (GAP-1)', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.lexemes.put({ ...lexeme('lex_other', 'dog', 'canine'), textId: 't2' });

    const result = await new AutoGlossService().glossUnit('utt_1');

    expect(result.matched).toEqual([]);
    expect(await db.token_lexeme_links.count()).toBe(0);
  });

  it('skips tokens that already have a gloss', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      gloss: { eng: 'existing' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_1', 'dog', 'canine'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(0);
    expect(result.skipped).toBe(1);

    // Gloss should not have been overwritten
    const tok = await db.unit_tokens.get('tok_1');
    expect(tok?.gloss).toEqual({ eng: 'existing' });
  });

  it('case-insensitive matching of form to lemma', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'Dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_1', 'dog', 'canine'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.matchType).toBe('exact');
  });

  it('returns empty matches when no lexemes match', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'xyz' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(0);
    expect(result.total).toBe(1);
  });

  it('skips lexemes with empty senses array', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_1', 'dog'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(0);
  });

  it('returns empty when unit has no tokens', async () => {
    const service = new AutoGlossService();
    const result = await service.glossUnit('nonexistent');

    expect(result.matched.length).toBe(0);
    expect(result.total).toBe(0);
  });

  // ── 前缀匹配 | Prefix (stem) match ──

  it('prefix match: lemma "walk" matches form "walking" as stem', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'walking' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_walk', 'walk', 'move on foot'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.matchType).toBe('stem');
    expect(result.matched[0]?.confidence).toBe(0.75);
    expect(result.matched[0]?.gloss).toEqual({ eng: 'move on foot' });

    const links = await db.token_lexeme_links
      .where('[targetType+targetId]')
      .equals(['token', 'tok_1'])
      .toArray();
    expect(links[0]?.role).toBe('stem');
    expect(links[0]?.confidence).toBe(0.75);
  });

  it('prefix match: prefers longest lemma prefix', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'helpfulness' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // 短前缀 | Short prefix
    await db.lexemes.put(lexeme('lex_help', 'help', 'assist'));

    // 长前缀 | Longer prefix (should win)
    await db.lexemes.put(lexeme('lex_helpful', 'helpful', 'useful'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.lexemeId).toBe('lex_helpful');
    expect(result.matched[0]?.matchType).toBe('stem');
  });

  it('exact match takes priority over prefix match', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'walk' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_exact', 'walk', 'move on foot'));

    await db.lexemes.put(lexeme('lex_prefix', 'wal', 'other'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched[0]?.matchType).toBe('exact');
    expect(result.matched[0]?.lexemeId).toBe('lex_exact');
  });

  // ── 子串匹配 | Substring match ──

  it('substring match: lemma "happ" found inside form "unhappiness"', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'unhappiness' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_happ', 'happi', 'joyful'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.matchType).toBe('gloss_candidate');
    expect(result.matched[0]?.confidence).toBe(0.5);
  });

  it('substring too short (< 3 chars) does not match', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'bead' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_ea', 'ea', 'water'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(0);
  });

  // ── forms[] 匹配 | forms[] matching ──

  it('matches against lexeme alternative forms', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'ran' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_run', 'run', 'move quickly', ['ran', 'running']));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.matchType).toBe('exact');
    expect(result.matched[0]?.lexemeId).toBe('lex_run');
  });

  // ── Leipzig 提示 | Leipzig hints ──

  it('returns Leipzig warnings for non-standard abbreviation glosses', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Gloss 含非标准缩写 | Gloss contains non-standard abbreviation
    await db.lexemes.put(lexeme('lex_1', 'dog', 'ANIM.PASTREL'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.leipzigHints).toBeDefined();
    expect(result.leipzigHints!.length).toBeGreaterThan(0);
    expect(
      result.leipzigHints![0]?.warnings.some((w) => w.type === 'non_standard_abbreviation'),
    ).toBe(true);
  });

  it('no Leipzig hints for standard glosses', async () => {
    await db.unit_tokens.put({
      id: 'tok_1',
      textId: 't1',
      unitId: 'utt_1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put(lexeme('lex_1', 'dog', 'canine'));

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    // 纯小写词汇 gloss 不会产生 Leipzig 警告 | Pure lowercase lexical gloss produces no warnings
    expect(result.leipzigHints).toBeUndefined();
  });
});
