import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMetricObserver } from '../../observability/metrics';
import {
  clearListUnitsSnapshotsForTests,
  LIST_UNITS_SNAPSHOT_ROW_THRESHOLD,
} from './localContextListUnitsSnapshotStore';

const mockGetDb = vi.fn();
vi.mock('../../db', () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import {
  executeLocalContextToolCall,
  formatLocalContextToolBatchResultMessage,
  formatLocalContextToolResultMessage,
  LOCAL_TOOL_RESULT_CHAR_BUDGET,
  parseLocalContextToolCallFromText,
  parseLocalContextToolCallsFromText,
} from './localContextTools';

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
    const payload = result.result as { total: number; matches: unknown[]; _readModel: { unitIndexComplete: boolean; capturedAtMs: number } };
    expect(payload.total).toBe(2);
    expect(payload.matches).toHaveLength(2);
    expect(payload._readModel.unitIndexComplete).toBe(true);
    expect(typeof payload._readModel.capturedAtMs).toBe('number');
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
    expect(payload._readModel).toMatchObject({ unitIndexComplete: true, indexRowCount: 1 });
  });
});

function makeLocalUnitIndexRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `unit-${i}`,
    kind: 'utterance' as const,
    mediaId: 'media-1',
    layerId: 'layer-1',
    startTime: i,
    endTime: i + 0.5,
    text: `line-${i}`,
  }));
}

describe('list_units snapshot paging', () => {
  afterEach(() => {
    clearListUnitsSnapshotsForTests();
  });

  it('returns resultHandle when row count exceeds threshold', async () => {
    const ref = { current: 0 };
    const n = LIST_UNITS_SNAPSHOT_ROW_THRESHOLD + 1;
    const context = {
      shortTerm: {
        timelineReadModelEpoch: 10,
        unitIndexComplete: true,
        localUnitIndex: makeLocalUnitIndexRows(n),
      },
      longTerm: {},
    };
    const events: Array<{ id: string }> = [];
    const dispose = addMetricObserver((e) => events.push({ id: e.id }));
    try {
      const result = await executeLocalContextToolCall(
        { name: 'list_units', arguments: { limit: 5, offset: 0, sort: 'time_asc' } },
        context,
        ref,
      );
      expect(result.ok).toBe(true);
      const payload = result.result as {
        resultHandle: string;
        snapshotPaging: boolean;
        total: number;
        matches: Array<{ id: string }>;
      };
      expect(payload.snapshotPaging).toBe(true);
      expect(typeof payload.resultHandle).toBe('string');
      expect(payload.resultHandle.length).toBeGreaterThan(8);
      expect(payload.total).toBe(n);
      expect(payload.matches).toHaveLength(5);
      expect(payload.matches[0]!.id).toBe('unit-0');
      expect(events.some((e) => e.id === 'ai.list_units_snapshot_created')).toBe(true);
    } finally {
      dispose();
    }
  });

  it('pages with the same resultHandle and offset', async () => {
    const ref = { current: 0 };
    const n = LIST_UNITS_SNAPSHOT_ROW_THRESHOLD + 1;
    const context = {
      shortTerm: {
        timelineReadModelEpoch: 1,
        unitIndexComplete: true,
        localUnitIndex: makeLocalUnitIndexRows(n),
      },
      longTerm: {},
    };
    const first = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 4, offset: 0 } },
      context,
      ref,
    );
    const handle = (first.result as { resultHandle: string }).resultHandle;
    const second = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { resultHandle: handle, limit: 4, offset: 4 } },
      context,
      ref,
    );
    expect(second.ok).toBe(true);
    const p2 = second.result as { matches: Array<{ id: string }>; total: number };
    expect(p2.matches[0]!.id).toBe('unit-4');
    expect(p2.total).toBe(n);
  });

  it('allows snapshot paging offset beyond the non-snapshot 500 cap', async () => {
    const ref = { current: 0 };
    const n = 600;
    const context = {
      shortTerm: {
        timelineReadModelEpoch: 1,
        unitIndexComplete: true,
        localUnitIndex: makeLocalUnitIndexRows(n),
      },
      longTerm: {},
    };
    const first = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 3, offset: 0 } },
      context,
      ref,
    );
    const handle = (first.result as { resultHandle: string }).resultHandle;
    const deep = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { resultHandle: handle, limit: 3, offset: 520 } },
      context,
      ref,
    );
    expect(deep.ok).toBe(true);
    const p = deep.result as { matches: Array<{ id: string }>; offset: number };
    expect(p.offset).toBe(520);
    expect(p.matches[0]!.id).toBe('unit-520');
  });

  it('returns stale_list_handle when epoch changes', async () => {
    const ref = { current: 0 };
    const n = LIST_UNITS_SNAPSHOT_ROW_THRESHOLD + 1;
    const rows = makeLocalUnitIndexRows(n);
    const first = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 3, offset: 0 } },
      { shortTerm: { timelineReadModelEpoch: 5, unitIndexComplete: true, localUnitIndex: rows }, longTerm: {} },
      ref,
    );
    const handle = (first.result as { resultHandle: string }).resultHandle;
    const stale = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { resultHandle: handle, limit: 3, offset: 0 } },
      { shortTerm: { timelineReadModelEpoch: 99, unitIndexComplete: true, localUnitIndex: rows }, longTerm: {} },
      ref,
    );
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe('stale_list_handle');
  });

  it('returns invalid_or_expired_handle for unknown handle', async () => {
    const ref = { current: 0 };
    const bad = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { resultHandle: '00000000-0000-4000-8000-000000000000', limit: 5, offset: 0 } },
      { shortTerm: { unitIndexComplete: true, localUnitIndex: makeLocalUnitIndexRows(3) }, longTerm: {} },
      ref,
    );
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('invalid_or_expired_handle');
  });
});

describe('local context tool result char budget', () => {
  it('does not truncate or emit metric when JSON is under budget', () => {
    const recorded: Array<{ id: string }> = [];
    const dispose = addMetricObserver((event) => recorded.push({ id: event.id }));
    try {
      const msg = formatLocalContextToolResultMessage({
        ok: true,
        name: 'get_project_stats',
        result: { unitCount: 3, translationLayerCount: 1, aiConfidenceAvg: null, _readModel: { unitIndexComplete: true, capturedAtMs: 1 } },
      });
      expect(msg).not.toContain('DATA TRUNCATED');
      expect(recorded.some((e) => e.id === 'ai.local_tool_result_truncated')).toBe(false);
    } finally {
      dispose();
    }
  });

  it('truncates and records ai.local_tool_result_truncated when payload exceeds budget', () => {
    const recorded: Array<{ id: string; tags?: Record<string, unknown> }> = [];
    const dispose = addMetricObserver((event) => recorded.push({ id: event.id, ...(event.tags ? { tags: event.tags as Record<string, unknown> } : {}) }));
    try {
      const filler = 'y'.repeat(LOCAL_TOOL_RESULT_CHAR_BUDGET + 400);
      const msg = formatLocalContextToolResultMessage({
        ok: true,
        name: 'get_project_stats',
        result: { blob: filler, _readModel: { unitIndexComplete: true, capturedAtMs: 1 } },
      });
      expect(msg).toContain('DATA TRUNCATED');
      const hit = recorded.find((e) => e.id === 'ai.local_tool_result_truncated');
      expect(hit).toBeDefined();
      expect(hit?.tags?.scope).toBe('single');
      expect(hit?.tags?.toolName).toBe('get_project_stats');
      expect(typeof hit?.tags?.payloadChars).toBe('number');
      expect(hit?.tags?.payloadChars as number).toBeGreaterThan(LOCAL_TOOL_RESULT_CHAR_BUDGET);
      const jsonBlock = msg.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '';
      expect(jsonBlock.endsWith('...')).toBe(true);
      expect(jsonBlock.length).toBe(LOCAL_TOOL_RESULT_CHAR_BUDGET + 3);
    } finally {
      dispose();
    }
  });

  it('batch formatter uses the same budget and metric scope batch', () => {
    const recorded: Array<{ id: string; tags?: Record<string, unknown> }> = [];
    const dispose = addMetricObserver((event) => recorded.push({ id: event.id, ...(event.tags ? { tags: event.tags as Record<string, unknown> } : {}) }));
    try {
      const chunk = 'z'.repeat(Math.ceil(LOCAL_TOOL_RESULT_CHAR_BUDGET / 2) + 100);
      const msg = formatLocalContextToolBatchResultMessage([
        { ok: true, name: 'get_project_stats', result: { a: chunk, _readModel: { unitIndexComplete: true, capturedAtMs: 1 } } },
        { ok: true, name: 'get_project_stats', result: { b: chunk, _readModel: { unitIndexComplete: true, capturedAtMs: 2 } } },
      ]);
      expect(msg).toContain('DATA TRUNCATED');
      const hit = recorded.find((e) => e.id === 'ai.local_tool_result_truncated');
      expect(hit?.tags?.scope).toBe('batch');
    } finally {
      dispose();
    }
  });
});
