import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.fn();
vi.mock('../../db', () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import { executeLocalContextToolCall, parseLocalContextToolCallFromText, parseLocalContextToolCallsFromText } from './localContextTools';

describe('localContextTools parseLocalContextToolCallFromText', () => {
  it('parses fenced json tool call payload', () => {
    const raw = [
      '这里是工具调用结果',
      '```json',
      '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
      '```',
    ].join('\n');

    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_project_stats',
      arguments: {},
    });
  });

  it('parses inline json with normalized tool name and arguments', () => {
    const raw = '{"tool_call":{"name":"GET_UTTERANCE_DETAIL","arguments":{"utteranceId":"utt-1"}}}';
    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_utterance_detail',
      arguments: {
        utteranceId: 'utt-1',
      },
    });
  });

  it('parses tool_calls batch payload', () => {
    const raw = JSON.stringify({
      tool_calls: [
        { name: 'get_project_stats', arguments: {} },
        { name: 'get_current_selection', arguments: {} },
      ],
    });

    const parsed = parseLocalContextToolCallsFromText(raw);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: 'get_project_stats', arguments: {} });
    expect(parsed[1]).toEqual({ name: 'get_current_selection', arguments: {} });
  });

  it('parses single-item tool_calls payload', () => {
    const raw = JSON.stringify({
      tool_calls: [
        { name: 'get_current_selection', arguments: {} },
      ],
    });

    const parsed = parseLocalContextToolCallsFromText(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ name: 'get_current_selection', arguments: {} });
  });

  it('parses list_utterances tool call', () => {
    const raw = '{"tool_call":{"name":"list_utterances","arguments":{"limit":8}}}';
    const parsed = parseLocalContextToolCallFromText(raw);
    expect(parsed).toEqual({
      name: 'list_utterances',
      arguments: { limit: 8 },
    });
  });
});

describe('executeLocalContextToolCall with localUtteranceIndex', () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockGetDb.mockRejectedValue(new Error('getDb must not run when localUtteranceIndex supplies rows'));
  });

  it('list_utterances reads localUtteranceIndex without touching the database', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUtteranceIndex: [
          { id: 'a', startTime: 0, endTime: 1, transcription: 'one' },
          { id: 'b', startTime: 1, endTime: 2, transcription: 'two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_utterances', arguments: { limit: 10, offset: 0, sort: 'time_asc' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.name).toBe('list_utterances');
    const payload = result.result as { total: number; matches: unknown[] };
    expect(payload.total).toBe(2);
    expect(payload.matches).toHaveLength(2);
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('search_utterances uses localUtteranceIndex for non-empty query', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUtteranceIndex: [
          { id: 'a', startTime: 0, endTime: 1, transcription: 'hello world' },
          { id: 'b', startTime: 1, endTime: 2, transcription: 'nope' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_utterances', arguments: { query: 'hello', limit: 5 } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { matches: Array<{ id: string }> };
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0]!.id).toBe('a');
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('get_utterance_detail resolves from localUtteranceIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUtteranceIndex: [
          { id: 'x1', mediaId: 'm9', startTime: 3, endTime: 5, transcription: 'body' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_utterance_detail', arguments: { utteranceId: 'x1' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      id: 'x1',
      mediaId: 'm9',
      startTime: 3,
      endTime: 5,
      transcription: 'body',
    });
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('get_current_selection does NOT leak localUtteranceIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUtteranceIndex: [
          { id: 'a', startTime: 0, endTime: 1, transcription: 'leak test' },
        ],
        utterancesOnCurrentMediaCount: 1,
      },
      longTerm: {
        projectStats: {
          utteranceCount: 4,
        },
      },
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_current_selection', arguments: {} },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as Record<string, unknown>;
    expect(payload.page).toBe('transcription');
    expect(payload.utterancesOnCurrentMediaCount).toBe(1);
    expect(payload.projectUtteranceCount).toBe(4);
    expect(payload).not.toHaveProperty('localUtteranceIndex');
  });
});
