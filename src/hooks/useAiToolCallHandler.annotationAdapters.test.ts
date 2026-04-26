import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoGlossService } from '../ai/AutoGlossService';
import { LinguisticService } from '../services/LinguisticService';
import { glossAdapter, tokenAdapter } from './useAiToolCallHandler.annotationAdapters';

describe('glossAdapter — B2 rollback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes rollback after matches when updateTokenGloss is available', async () => {
    const updateTokenGloss = vi.fn(async () => {});
    vi.spyOn(AutoGlossService.prototype, 'glossUnit').mockResolvedValueOnce({
      unitId: 'utt_1',
      matched: [{
        tokenId: 'tok_1',
        tokenForm: { default: 'dog' },
        lexemeId: 'lex_1',
        lexemeLemma: { default: 'dog' },
        gloss: { eng: 'canine' },
        confidence: 1,
        matchType: 'exact',
        linkId: 'tll_rollback_test',
      }],
      skipped: 0,
      total: 1,
    });
    const removeLinksSpy = vi.spyOn(LinguisticService, 'removeTokenLexemeLinksByIds').mockResolvedValue(undefined);

    const result = await glossAdapter.execute({
      locale: 'zh-CN',
      hasRequestedUnitTarget: () => true,
      resolveRequestedUnit: () => ({
        id: 'utt_1',
        textId: 't1',
        startTime: 0,
        endTime: 1,
        createdAt: '',
        updatedAt: '',
      }),
      describeRequestedUnitTarget: () => 'utt_1',
      updateTokenGloss,
    } as any);

    expect(result.ok).toBe(true);
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(removeLinksSpy).toHaveBeenCalledWith(['tll_rollback_test']);
    expect(updateTokenGloss).toHaveBeenCalledWith('tok_1', null, 'eng');
  });
});

describe('tokenAdapter — B2 rollback', () => {
  it('set_token_pos by tokenId exposes rollback when readTokenPos is provided', async () => {
    const updateTokenPos = vi.fn(async () => {});

    const result = await tokenAdapter.execute({
      call: { name: 'set_token_pos', arguments: { tokenId: 't1', pos: 'N' } },
      locale: 'zh-CN',
      readTokenPos: () => 'OLD',
      updateTokenPos,
    } as any);

    expect(result.ok).toBe(true);
    expect(updateTokenPos).toHaveBeenCalledWith('t1', 'N');
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(updateTokenPos).toHaveBeenLastCalledWith('t1', 'OLD');
  });

  it('set_token_pos by tokenId omits rollback without readTokenPos', async () => {
    const updateTokenPos = vi.fn(async () => {});

    const result = await tokenAdapter.execute({
      call: { name: 'set_token_pos', arguments: { tokenId: 't1', pos: 'N' } },
      locale: 'zh-CN',
      updateTokenPos,
    } as any);

    expect(result.ok).toBe(true);
    expect(result.rollback).toBeUndefined();
  });

  it('set_token_pos batch exposes rollback restoring prior POS in reverse order', async () => {
    const updateTokenPos = vi.fn(async () => {});
    const batchUpdateTokenPosByForm = vi.fn(async () => 2);
    const units = [{
      id: 'u1',
      words: [
        { id: 'ta', form: { default: 'dog' }, pos: 'n' },
        { id: 'tb', form: { default: 'dog' }, pos: 'v' },
      ],
    }];

    const result = await tokenAdapter.execute({
      call: { name: 'set_token_pos', arguments: { unitId: 'u1', form: 'dog', pos: 'X' } },
      locale: 'zh-CN',
      units,
      batchUpdateTokenPosByForm,
      updateTokenPos,
    } as any);

    expect(result.ok).toBe(true);
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(updateTokenPos).toHaveBeenCalledTimes(2);
    expect(updateTokenPos.mock.calls[0]).toEqual(['tb', 'v']);
    expect(updateTokenPos.mock.calls[1]).toEqual(['ta', 'n']);
  });

  it('set_token_gloss exposes rollback when readTokenGloss is provided', async () => {
    const updateTokenGloss = vi.fn(async () => {});

    const result = await tokenAdapter.execute({
      call: { name: 'set_token_gloss', arguments: { tokenId: 't1', gloss: 'new', lang: 'eng' } },
      locale: 'zh-CN',
      readTokenGloss: () => 'prior-gloss',
      updateTokenGloss,
    } as any);

    expect(result.ok).toBe(true);
    expect(updateTokenGloss).toHaveBeenCalledWith('t1', 'new', 'eng');
    await result.rollback!();
    expect(updateTokenGloss).toHaveBeenLastCalledWith('t1', 'prior-gloss', 'eng');
  });
});
