// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { AutoGlossService } from './AutoGlossService';

const NOW = new Date().toISOString();

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

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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
    const links = await db.token_lexeme_links.where('[targetType+targetId]').equals(['token', 'tok_1']).toArray();
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

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_walk',
      lemma: { default: 'walk' },
      senses: [{ gloss: { eng: 'move on foot' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.matched[0]?.matchType).toBe('stem');
    expect(result.matched[0]?.confidence).toBe(0.75);
    expect(result.matched[0]?.gloss).toEqual({ eng: 'move on foot' });

    const links = await db.token_lexeme_links.where('[targetType+targetId]').equals(['token', 'tok_1']).toArray();
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
    await db.lexemes.put({
      id: 'lex_help',
      lemma: { default: 'help' },
      senses: [{ gloss: { eng: 'assist' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    // 长前缀 | Longer prefix (should win)
    await db.lexemes.put({
      id: 'lex_helpful',
      lemma: { default: 'helpful' },
      senses: [{ gloss: { eng: 'useful' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_exact',
      lemma: { default: 'walk' },
      senses: [{ gloss: { eng: 'move on foot' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.lexemes.put({
      id: 'lex_prefix',
      lemma: { default: 'wal' },
      senses: [{ gloss: { eng: 'other' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_happ',
      lemma: { default: 'happi' },
      senses: [{ gloss: { eng: 'joyful' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_ea',
      lemma: { default: 'ea' },
      senses: [{ gloss: { eng: 'water' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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

    await db.lexemes.put({
      id: 'lex_run',
      lemma: { default: 'run' },
      senses: [{ gloss: { eng: 'move quickly' } }],
      forms: [{ transcription: { default: 'ran' } }, { transcription: { default: 'running' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

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
    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'ANIM.PASTREL' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    expect(result.leipzigHints).toBeDefined();
    expect(result.leipzigHints!.length).toBeGreaterThan(0);
    expect(result.leipzigHints![0]?.warnings.some((w) => w.type === 'non_standard_abbreviation')).toBe(true);
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

    await db.lexemes.put({
      id: 'lex_1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { eng: 'canine' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });

    const service = new AutoGlossService();
    const result = await service.glossUnit('utt_1');

    expect(result.matched.length).toBe(1);
    // 纯小写词汇 gloss 不会产生 Leipzig 警告 | Pure lowercase lexical gloss produces no warnings
    expect(result.leipzigHints).toBeUndefined();
  });
});
