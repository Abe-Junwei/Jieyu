import { describe, expect, it } from 'vitest';
import type { AiSessionMemory } from './chatDomain.types';
import { buildLocalToolStatePatchFromCallResult, resolveLocalToolCalls } from './localToolSlotResolver';

describe('localToolSlotResolver', () => {
  it('rewrites empty search query to list intent for list-like user utterance', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'search_utterances', arguments: {} }],
      '列出哪八个语段',
      {},
    );
    expect(result.calls[0]).toEqual({
      name: 'list_utterances',
      arguments: { limit: 8 },
    });
  });

  it('fills search query from user text when possible', () => {
    const result = resolveLocalToolCalls(
      [{ name: 'search_utterances', arguments: { limit: 5 } }],
      '搜索 包含 你好 的语段',
      {},
    );
    expect(result.calls[0]?.name).toBe('search_utterances');
    expect(result.calls[0]?.arguments.query).toBe('搜索 包含 你好 的语段');
  });

  it('fills get_utterance_detail from last result set ordinal', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'utterance.list',
        lastResultUtteranceIds: ['utt-1', 'utt-2', 'utt-3'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_utterance_detail', arguments: {} }],
      '看第2个',
      memory,
    );
    expect(result.calls[0]).toEqual({
      name: 'get_utterance_detail',
      arguments: { utteranceId: 'utt-2' },
    });
  });

  it('records local tool state patch from successful list result', () => {
    const patch = buildLocalToolStatePatchFromCallResult(
      { name: 'list_utterances', arguments: { limit: 8 } },
      {
        ok: true,
        result: {
          matches: [{ id: 'utt-a' }, { id: 'utt-b' }],
        },
      },
    );
    expect(patch.lastIntent).toBe('utterance.list');
    expect(patch.clearLastQuery).toBe(true);
    expect(patch.lastResultUtteranceIds).toEqual(['utt-a', 'utt-b']);
  });

  it('clears lastResultUtteranceIds on successful search with zero matches', () => {
    const patch = buildLocalToolStatePatchFromCallResult(
      { name: 'search_utterances', arguments: { query: 'nope', limit: 5 } },
      { ok: true, result: { query: 'nope', count: 0, matches: [] } },
    );
    expect(patch.lastIntent).toBe('utterance.search');
    expect(patch.lastQuery).toBe('nope');
    expect(patch.lastResultUtteranceIds).toEqual([]);
  });

  it('does not treat bare digits in user text as English ordinals', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'utterance.list',
        lastResultUtteranceIds: ['utt-1', 'utt-2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_utterance_detail', arguments: {} }],
      'There are 8 segments total',
      memory,
    );
    expect(result.calls[0]?.arguments.utteranceId).toBeUndefined();
  });

  it('resolves English ordinal phrases for detail slot', () => {
    const memory: AiSessionMemory = {
      localToolState: {
        lastIntent: 'utterance.list',
        lastResultUtteranceIds: ['utt-1', 'utt-2'],
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    };
    const result = resolveLocalToolCalls(
      [{ name: 'get_utterance_detail', arguments: {} }],
      'open the 2nd one',
      memory,
    );
    expect(result.calls[0]?.arguments.utteranceId).toBe('utt-2');
  });
});
