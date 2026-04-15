import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMetricObserver } from '../../observability/metrics';

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
    const raw = '{"tool_call":{"name":"GET_UNIT_DETAIL","arguments":{"unitId":"utt-1"}}}';
    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_unit_detail',
      arguments: {
        unitId: 'utt-1',
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

  it('parses list_units tool call', () => {
    const raw = '{"tool_call":{"name":"list_units","arguments":{"limit":8}}}';
    const parsed = parseLocalContextToolCallFromText(raw);
    expect(parsed).toEqual({
      name: 'list_units',
      arguments: { limit: 8 },
    });
  });

  it('maps legacy utterance tool aliases and emits usage metric', () => {
    const recorded: Array<{ id: string; tags: Record<string, unknown> | undefined }> = [];
    const dispose = addMetricObserver((event) => {
      recorded.push({ id: event.id, tags: event.tags as Record<string, unknown> | undefined });
    });
    try {
      const raw = '{"tool_call":{"name":"list_utterances","arguments":{"limit":8}}}';
      const parsed = parseLocalContextToolCallFromText(raw);
      expect(parsed).toEqual({
        name: 'list_units',
        arguments: { limit: 8 },
      });
      expect(recorded.some((event) => (
        event.id === 'ai.local_tool_alias_usage'
        && event.tags?.aliasName === 'list_utterances'
        && event.tags?.canonicalName === 'list_units'
      ))).toBe(true);
    } finally {
      dispose();
    }
  });
});

describe('executeLocalContextToolCall with localUnitIndex', () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockGetDb.mockRejectedValue(new Error('getDb must not run when localUnitIndex supplies rows'));
  });

  it('list_units reads localUnitIndex without touching the database', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUnitIndex: [
          { id: 'a', kind: 'utterance' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 10, offset: 0, sort: 'time_asc' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.name).toBe('list_units');
    const payload = result.result as { total: number; matches: unknown[] };
    expect(payload.total).toBe(2);
    expect(payload.matches).toHaveLength(2);
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('search_units uses localUnitIndex for non-empty query', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUnitIndex: [
          { id: 'a', kind: 'utterance' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello world' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'nope' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { query: 'hello', limit: 5 } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { matches: Array<{ id: string }> };
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0]!.id).toBe('a');
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('get_unit_detail resolves from localUnitIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUnitIndex: [
          { id: 'x1', kind: 'segment' as const, layerId: 'layer-1', mediaId: 'm9', startTime: 3, endTime: 5, text: 'body' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { unitId: 'x1' } },
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

  it('get_current_selection does NOT leak localUnitIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUnitIndex: [
          { id: 'a', kind: 'utterance' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'leak test' },
        ],
        currentMediaUnitCount: 1,
      },
      longTerm: {
        projectStats: {
          unitCount: 4,
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
    expect(payload.currentMediaUnitCount).toBe(1);
    expect(payload.projectUnitCount).toBe(4);
    expect(payload).not.toHaveProperty('localUnitIndex');
  });
});
