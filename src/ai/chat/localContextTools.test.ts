import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAiTraceObserver } from '../../observability/aiTrace';
import { addMetricObserver } from '../../observability/metrics';
import { clearListUnitsSnapshotsForTests, LIST_UNITS_SNAPSHOT_ROW_THRESHOLD } from './localContextListUnitsSnapshotStore';

const mockGetDb = vi.fn();
const mockListUnitTextsByUnit = vi.fn();
const mockSegmentMetaListByLayerMedia = vi.fn();
const mockSegmentMetaListByMediaId = vi.fn();
const mockSegmentMetaListAll = vi.fn();
const mockSegmentMetaSearchSegmentMeta = vi.fn();
const mockSegmentMetaRebuildForLayerMedia = vi.fn();
const mockWorkspaceReadModelRebuildForText = vi.fn();
const mockWorkspaceReadModelGetScopeStats = vi.fn();
const mockWorkspaceReadModelSummarizeQuality = vi.fn();
vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    getDb: (...args: unknown[]) => mockGetDb(...args),
  };
});
vi.mock('../../services/LayerSegmentationTextService', () => ({
  listUnitTextsByUnit: (...args: unknown[]) => mockListUnitTextsByUnit(...args),
}));
vi.mock('../../services/SegmentMetaService', () => ({
  SegmentMetaService: {
    listByLayerMedia: (...args: unknown[]) => mockSegmentMetaListByLayerMedia(...args),
    listByMediaId: (...args: unknown[]) => mockSegmentMetaListByMediaId(...args),
    listAll: (...args: unknown[]) => mockSegmentMetaListAll(...args),
    searchSegmentMeta: (...args: unknown[]) => mockSegmentMetaSearchSegmentMeta(...args),
    rebuildForLayerMedia: (...args: unknown[]) => mockSegmentMetaRebuildForLayerMedia(...args),
  },
}));
vi.mock('../../services/WorkspaceReadModelService', () => ({
  WorkspaceReadModelService: {
    rebuildForText: (...args: unknown[]) => mockWorkspaceReadModelRebuildForText(...args),
    getScopeStats: (...args: unknown[]) => mockWorkspaceReadModelGetScopeStats(...args),
    summarizeQuality: (...args: unknown[]) => mockWorkspaceReadModelSummarizeQuality(...args),
  },
}));

import { executeLocalContextToolCall, formatLocalContextToolBatchResultMessage, formatLocalContextToolResultMessage, LOCAL_TOOL_RESULT_CHAR_BUDGET, parseLocalContextToolCallFromText, parseLocalContextToolCallsFromText } from './localContextTools';

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

  it('parses get_unit_linguistic_memory call', () => {
    const raw = '{"tool_call":{"name":"GET_UNIT_LINGUISTIC_MEMORY","arguments":{"unitId":"utt-1"}}}';
    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_unit_linguistic_memory',
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
});

describe('executeLocalContextToolCall with localUnitIndex', () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockListUnitTextsByUnit.mockReset();
    mockSegmentMetaListByLayerMedia.mockReset();
    mockSegmentMetaListByMediaId.mockReset();
    mockSegmentMetaListAll.mockReset();
    mockSegmentMetaSearchSegmentMeta.mockReset();
    mockSegmentMetaRebuildForLayerMedia.mockReset();
    mockWorkspaceReadModelRebuildForText.mockReset();
    mockWorkspaceReadModelGetScopeStats.mockReset();
    mockWorkspaceReadModelSummarizeQuality.mockReset();
    mockGetDb.mockRejectedValue(new Error('getDb must not run when localUnitIndex supplies rows'));
    mockSegmentMetaListByLayerMedia.mockResolvedValue([]);
    mockSegmentMetaListByMediaId.mockResolvedValue([]);
    mockSegmentMetaListAll.mockResolvedValue([]);
    mockSegmentMetaSearchSegmentMeta.mockResolvedValue([]);
    mockSegmentMetaRebuildForLayerMedia.mockResolvedValue([]);
    mockWorkspaceReadModelRebuildForText.mockResolvedValue({
      qualityCount: 0,
      scopeStatsCount: 0,
      speakerProfileCount: 0,
      translationStatusCount: 0,
    });
    mockWorkspaceReadModelGetScopeStats.mockResolvedValue(null);
    mockWorkspaceReadModelSummarizeQuality.mockResolvedValue({
      count: 0,
      items: [],
      breakdown: {
        emptyTextCount: 0,
        missingSpeakerCount: 0,
        lowAiConfidenceCount: 0,
        todoNoteCount: 0,
      },
      totalUnitsInScope: 0,
      completionRate: 1,
    });
  });

  it('list_units reads localUnitIndex without touching the database', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
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

  it('emits tool-execution span on successful call', async () => {
    const removeObserverCalls: Array<{ kind: string; error?: string; tags?: Record<string, unknown> }> = [];
    const removeObserver = addAiTraceObserver((span) => {
      removeObserverCalls.push({
        kind: span.kind,
        ...(span.error ? { error: span.error } : {}),
        ...(span.tags ? { tags: span.tags as Record<string, unknown> } : {}),
      });
    });

    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_current_selection', arguments: {} },
      context,
      ref,
      20,
      { traceId: 'trace-tool-success', step: 1 },
    );

    removeObserver();
    expect(result.ok).toBe(true);
    const span = removeObserverCalls.find((item) => item.kind === 'tool-execution');
    expect(span).toBeDefined();
    expect(span?.error).toBeUndefined();
    expect(span?.tags?.toolName).toBe('get_current_selection');
    expect(span?.tags?.step).toBe(1);
  });

  it('emits tool-execution error span when context is unavailable', async () => {
    const observed: Array<{ kind: string; error?: string }> = [];
    const removeObserver = addAiTraceObserver((span) => {
      observed.push({ kind: span.kind, ...(span.error ? { error: span.error } : {}) });
    });

    const ref = { current: 0 };
    const result = await executeLocalContextToolCall(
      { name: 'get_current_selection', arguments: {} },
      null,
      ref,
      20,
      { traceId: 'trace-tool-error', step: 1 },
    );

    removeObserver();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('context is unavailable');
    const span = observed.find((item) => item.kind === 'tool-execution');
    expect(span?.error).toBe('context is unavailable');
  });

  it('search_units uses localUnitIndex for non-empty query', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello world' },
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

  it('search_units supports local hybrid ranking for token-overlap matches', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUnitIndex: [
          { id: 'best', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'consonant tone checklist' },
          { id: 'weak', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'tone only example' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { query: 'tone consonant', limit: 5 } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { matches: Array<{ id: string }>; ranking?: { strategy?: string } };
    expect(payload.matches.map((row) => row.id)).toEqual(['best', 'weak']);
    expect(payload.ranking?.strategy).toBe('hybrid_local');
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

  it('returns structured unavailable payload for get_waveform_analysis when no playable media exists', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {},
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_waveform_analysis', arguments: {} },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      ok: false,
      reason: 'no_playable_media',
    });
  });

  it('returns structured unavailable payload for get_acoustic_summary when no playable media exists', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {},
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_acoustic_summary', arguments: {} },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      ok: false,
      reason: 'no_playable_media',
    });
  });

  it('search_units prefers segment_meta for current_scope lookups and exposes the read-model source', async () => {
    const ref = { current: 0 };
    mockSegmentMetaSearchSegmentMeta.mockResolvedValue([
      {
        id: 'seg-1',
        segmentId: 'seg-1',
        textId: 'text-1',
        mediaId: 'm1',
        layerId: 'layer-1',
        startTime: 0,
        endTime: 1,
        text: 'morphology note',
        normalizedText: 'morphology note',
        hasText: true,
        effectiveSpeakerId: 'spk-1',
      },
    ]);
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { query: 'morphology', scope: 'current_scope', speakerId: 'spk-1' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      scope: 'current_scope',
      count: 1,
      matches: [{ id: 'seg-1' }],
      _readModel: { source: 'segment_meta' },
    });
    expect(mockSegmentMetaSearchSegmentMeta).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-1',
      mediaId: 'm1',
      query: 'morphology',
      speakerId: 'spk-1',
    }));
  });

  it('get_unit_detail falls back to segment_meta when the local snapshot misses the row', async () => {
    const ref = { current: 0 };
    mockSegmentMetaRebuildForLayerMedia.mockResolvedValue([
      {
        id: 'seg-2',
        segmentId: 'seg-2',
        textId: 'text-1',
        mediaId: 'm1',
        layerId: 'layer-1',
        startTime: 4,
        endTime: 6,
        text: 'fallback detail',
        normalizedText: 'fallback detail',
        hasText: true,
        annotationStatus: 'verified',
      },
    ]);
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        localUnitIndex: [],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { unitId: 'seg-2', scope: 'current_scope' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      id: 'seg-2',
      layerId: 'layer-1',
      mediaId: 'm1',
      transcription: 'fallback detail',
      annotationStatus: 'verified',
      _readModel: { source: 'segment_meta' },
    });
  });

  it('get_current_selection does NOT leak localUnitIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        page: 'transcription',
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'leak test' },
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

  it('get_project_stats prefers scope_stats_snapshot when available', async () => {
    const ref = { current: 0 };
    mockWorkspaceReadModelGetScopeStats.mockResolvedValue({
      id: 'layer::layer-1',
      scopeType: 'layer',
      scopeKey: 'layer-1',
      textId: 'text-1',
      layerId: 'layer-1',
      unitCount: 4,
      segmentCount: 2,
      speakerCount: 2,
      translationLayerCount: 1,
      noteFlaggedCount: 1,
      untranscribedCount: 1,
      missingSpeakerCount: 1,
      avgAiConfidence: 0.75,
      createdAt: '2026-04-16T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
    });
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one', speakerId: 'spk-1' },
        ],
        currentScopeUnitCount: 4,
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_project_stats', arguments: { scope: 'current_scope', metric: 'speaker_count' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      scope: 'current_scope',
      speakerCount: 2,
      requestedMetric: 'speaker_count',
      value: 2,
      _readModel: { source: 'scope_stats_snapshot' },
    });
    expect(mockWorkspaceReadModelRebuildForText).toHaveBeenCalledWith('text-1');
    expect(mockWorkspaceReadModelGetScopeStats).toHaveBeenCalledWith('layer', 'layer-1', 'text-1');
  });

  it('diagnose_quality prefers segment_quality_snapshot when available', async () => {
    const ref = { current: 0 };
    mockWorkspaceReadModelSummarizeQuality.mockResolvedValue({
      count: 2,
      items: [
        { category: 'missing_speaker', count: 1 },
        { category: 'empty_text', count: 1 },
      ],
      breakdown: {
        emptyTextCount: 1,
        missingSpeakerCount: 1,
        lowAiConfidenceCount: 0,
        todoNoteCount: 0,
      },
      totalUnitsInScope: 4,
      completionRate: 0.75,
    });
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'diagnose_quality', arguments: { scope: 'current_scope', metric: 'missing_speaker_count' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      count: 2,
      requestedMetric: 'missing_speaker_count',
      value: 1,
      breakdown: {
        emptyTextCount: 1,
        missingSpeakerCount: 1,
      },
      _readModel: { source: 'segment_quality_snapshot' },
    });
    expect(mockWorkspaceReadModelSummarizeQuality).toHaveBeenCalledWith({
      textId: 'text-1',
      layerId: 'layer-1',
      mediaId: 'm1',
    });
  });

  it('find_incomplete_units prefers segment_meta snapshot path for current_scope', async () => {
    const ref = { current: 0 };
    mockSegmentMetaRebuildForLayerMedia.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'done', normalizedText: 'done', hasText: true, annotationStatus: 'verified', createdAt: '', updatedAt: '' },
      { id: 'l1::seg-2', segmentId: 'seg-2', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: '', normalizedText: '', hasText: false, createdAt: '', updatedAt: '' },
      { id: 'l1::seg-3', segmentId: 'seg-3', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 2, endTime: 3, text: 'draft', normalizedText: 'draft', hasText: true, annotationStatus: 'transcribed', createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'find_incomplete_units', arguments: {} },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { count: number; items: Array<{ id: string; status: string }>; meta: { totalIncomplete: number }; _readModel: { source: string } };
    expect(payload.count).toBe(2);
    expect(payload.items[0]!.id).toBe('seg-2');
    expect(payload.items[0]!.status).toBe('raw');
    expect(payload.items[1]!.id).toBe('seg-3');
    expect(payload.items[1]!.status).toBe('transcribed');
    expect(payload.meta.totalIncomplete).toBe(2);
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('find_incomplete_units falls back to localUnitIndex when segment_meta is unavailable', async () => {
    const ref = { current: 0 };
    mockSegmentMetaRebuildForLayerMedia.mockRejectedValue(new Error('db not available'));
    mockSegmentMetaListByLayerMedia.mockRejectedValue(new Error('db not available'));
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'ok', annotationStatus: 'verified' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: '' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'find_incomplete_units', arguments: {} },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { count: number; items: Array<{ id: string; status: string }> };
    expect(payload.count).toBe(1);
    expect(payload.items[0]!.id).toBe('b');
    expect(payload.items[0]!.status).toBe('raw');
  });

  it('batch_apply prefers segment_meta snapshot path for unit validation', async () => {
    const ref = { current: 0 };
    mockSegmentMetaRebuildForLayerMedia.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one', normalizedText: 'one', hasText: true, createdAt: '', updatedAt: '' },
      { id: 'l1::seg-2', segmentId: 'seg-2', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'two', normalizedText: 'two', hasText: true, createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'batch_apply', arguments: { unitIds: ['seg-1', 'seg-missing'], action: 'mark_verified' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { count: number; items: Array<{ id: string }>; meta: { matchedUnitIdCount: number; unresolvedUnitIds?: string[] }; _readModel: { source: string } };
    expect(payload.count).toBe(1);
    expect(payload.items[0]!.id).toBe('seg-1');
    expect(payload.meta.matchedUnitIdCount).toBe(1);
    expect(payload.meta.unresolvedUnitIds).toEqual(['seg-missing']);
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('list_units with project scope uses segment_meta listAll', async () => {
    const ref = { current: 0 };
    mockSegmentMetaListAll.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello', normalizedText: 'hello', hasText: true, createdAt: '', updatedAt: '' },
      { id: 'l2::seg-2', segmentId: 'seg-2', unitKind: 'segment', textId: 'text-1', mediaId: 'm2', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'world', normalizedText: 'world', hasText: true, createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'project' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(mockSegmentMetaListAll).toHaveBeenCalled();
    const payload = result.result as { scope: string; total: number; _readModel: { source: string } };
    expect(payload.scope).toBe('project');
    expect(payload.total).toBe(2);
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('list_units with current_track scope uses segment_meta listByMediaId', async () => {
    const ref = { current: 0 };
    mockSegmentMetaListByMediaId.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello', normalizedText: 'hello', hasText: true, createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'current_track' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(mockSegmentMetaListByMediaId).toHaveBeenCalledWith('m1');
    const payload = result.result as { scope: string; total: number; _readModel: { source: string } };
    expect(payload.scope).toBe('current_track');
    expect(payload.total).toBe(1);
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('search_units with project scope uses segment_meta searchSegmentMeta', async () => {
    const ref = { current: 0 };
    mockSegmentMetaSearchSegmentMeta.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello world', normalizedText: 'hello world', hasText: true, createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { scope: 'project', query: 'hello' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(mockSegmentMetaSearchSegmentMeta).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello' }));
    // project scope: 不应传 layerId/mediaId 给 searchSegmentMeta | should not pass layerId/mediaId
    const searchCall = mockSegmentMetaSearchSegmentMeta.mock.calls[0]![0] as Record<string, unknown>;
    expect(searchCall.layerId).toBeUndefined();
    expect(searchCall.mediaId).toBeUndefined();
    const payload = result.result as { scope: string; count: number; _readModel: { source: string } };
    expect(payload.scope).toBe('project');
    expect(payload.count).toBe(1);
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('get_unit_detail with project scope resolves from segment_meta listAll', async () => {
    const ref = { current: 0 };
    mockSegmentMetaListAll.mockResolvedValue([
      { id: 'l1::seg-1', segmentId: 'seg-1', unitKind: 'segment', textId: 'text-1', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello', normalizedText: 'hello', hasText: true, effectiveSpeakerId: 'spk-1', annotationStatus: 'transcribed', createdAt: '', updatedAt: '' },
    ]);
    const context = {
      shortTerm: { currentMediaId: 'm1', selectedLayerId: 'layer-1' },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-1' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(mockSegmentMetaListAll).toHaveBeenCalled();
    const payload = result.result as { id: string; scope: string; _readModel: { source: string } };
    expect(payload.id).toBe('seg-1');
    expect(payload.scope).toBe('project');
    expect(payload._readModel.source).toBe('segment_meta');
  });

  it('get_project_stats respects scoped speaker counts from localUnitIndex', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one', speakerId: 'spk-1' },
          { id: 'b', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'two', speakerId: 'spk-2' },
          { id: 'c', kind: 'unit' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 2, endTime: 3, text: 'three', speakerId: 'spk-3' },
        ],
        currentMediaUnitCount: 2,
      },
      longTerm: {
        projectStats: {
          unitCount: 3,
          speakerCount: 3,
          translationLayerCount: 1,
          aiConfidenceAvg: 0.8,
        },
      },
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_project_stats', arguments: { scope: 'current_track', metric: 'speaker_count' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      scope: 'current_track',
      unitCount: 2,
      speakerCount: 2,
      requestedMetric: 'speaker_count',
      value: 2,
    });
  });

  it('get_project_stats falls back to scoped rows instead of project total when current track counters are absent', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'two' },
          { id: 'c', kind: 'unit' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 2, endTime: 3, text: 'three' },
        ],
      },
      longTerm: {
        projectStats: {
          unitCount: 3,
          translationLayerCount: 1,
          aiConfidenceAvg: 0.8,
        },
      },
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_project_stats', arguments: { scope: 'current_track', metric: 'unit_count' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      scope: 'current_track',
      unitCount: 2,
      requestedMetric: 'unit_count',
      value: 2,
    });
  });

  it('diagnose_quality returns scoped gap metric value for untranscribed count', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        localUnitIndex: [
          { id: 'a', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: '' },
          { id: 'b', kind: 'unit' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'done' },
          { id: 'c', kind: 'unit' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 2, endTime: 3, text: '' },
        ],
      },
      longTerm: {
        waveformAnalysis: {
          gapCount: 0,
          overlapCount: 0,
          lowConfidenceCount: 0,
          maxGapSeconds: 0,
        },
      },
    };

    const result = await executeLocalContextToolCall(
      { name: 'diagnose_quality', arguments: { scope: 'current_track', metric: 'untranscribed_count' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      scope: 'current_track',
      requestedMetric: 'untranscribed_count',
      value: 1,
      totalUnitsInScope: 2,
      breakdown: {
        emptyTextCount: 1,
      },
    });
  });

  it('list_units respects current_scope filtering by current media and selected layer', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        currentScopeUnitCount: 1,
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-2', startTime: 1, endTime: 2, text: 'two' },
          { id: 'c', kind: 'segment' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 2, endTime: 3, text: 'three' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 10, scope: 'current_scope' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { scope: string; total: number; matches: Array<{ id: string }> };
    expect(payload.scope).toBe('current_scope');
    expect(payload.total).toBe(1);
    expect(payload.matches.map((row) => row.id)).toEqual(['a']);
  });

  it('list_units current_track returns empty when current media has no rows', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm-missing',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 10, scope: 'current_track' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { scope: string; total: number; count: number; matches: Array<{ id: string }> };
    expect(payload.scope).toBe('current_track');
    expect(payload.total).toBe(0);
    expect(payload.count).toBe(0);
    expect(payload.matches).toEqual([]);
  });

  it('list_units current_scope returns empty when selected layer has no rows on current media', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-missing',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm2', layerId: 'layer-missing', startTime: 1, endTime: 2, text: 'two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 10, scope: 'current_scope' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { scope: string; total: number; count: number; matches: Array<{ id: string }> };
    expect(payload.scope).toBe('current_scope');
    expect(payload.total).toBe(0);
    expect(payload.count).toBe(0);
    expect(payload.matches).toEqual([]);
  });

  it('search_units returns empty matches when scope has no rows but local index is loaded', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm-missing',
        localUnitIndex: [
          { id: 'a', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'hello one' },
          { id: 'b', kind: 'segment' as const, mediaId: 'm2', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'hello two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { query: 'hello', limit: 10, scope: 'current_track' } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    const payload = result.result as { scope: string; query: string; count: number; matches: Array<{ id: string }> };
    expect(payload.scope).toBe('current_track');
    expect(payload.query).toBe('hello');
    expect(payload.count).toBe(0);
    expect(payload.matches).toEqual([]);
  });

  it('get_unit_detail returns scoped not-found when unit exists outside current scope', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        currentMediaId: 'm1',
        selectedLayerId: 'layer-1',
        localUnitIndex: [
          { id: 'in-scope', kind: 'segment' as const, mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' },
          { id: 'out-scope', kind: 'segment' as const, mediaId: 'm2', layerId: 'layer-2', startTime: 1, endTime: 2, text: 'two' },
        ],
      },
      longTerm: {},
    };

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { unitId: 'out-scope', scope: 'current_scope' } },
      context,
      ref,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('unit not found in scope: current_scope');
  });
});

describe('executeLocalContextToolCall get_unit_linguistic_memory', () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockListUnitTextsByUnit.mockReset();
  });

  it('loads sentence translations, token/morpheme annotations and notes by unitId', async () => {
    const ref = { current: 0 };
    const context = {
      shortTerm: {
        localUnitIndex: [
          {
            id: 'utt-1',
            kind: 'unit' as const,
            layerId: 'layer-tr',
            textId: 'text-1',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 3,
            text: 'ni hao',
            speakerId: 'spk-1',
            annotationStatus: 'glossed',
          },
        ],
      },
      longTerm: {},
    };

    const tokenRows = [
      {
        id: 'tok-1',
        tokenIndex: 0,
        unitId: 'utt-1',
        textId: 'text-1',
        form: { default: 'ni' },
        gloss: { eng: 'you' },
        pos: 'PRON',
      },
    ];
    const morphemeRows = [
      {
        id: 'morph-1',
        morphemeIndex: 0,
        tokenId: 'tok-1',
        unitId: 'utt-1',
        textId: 'text-1',
        form: { default: 'ni' },
        gloss: { eng: '2SG' },
        pos: 'PRON',
      },
    ];
    const layers = [
      { id: 'layer-tr', layerType: 'transcription' as const },
      { id: 'layer-zh', layerType: 'translation' as const },
      { id: 'layer-en', layerType: 'translation' as const },
    ];
    const noteRowsByTarget: Record<string, unknown[]> = {
      'unit:utt-1': [{ id: 'note-u', content: { zho: '整句注释' }, category: 'linguistic', updatedAt: '2026-04-15T00:00:00.000Z' }],
      'translation:txt-zh': [{ id: 'note-t', content: { zho: '中文译文备注' }, category: 'comment', updatedAt: '2026-04-15T00:01:00.000Z' }],
      'token:tok-1': [{ id: 'note-tok', content: { zho: '词注释' }, category: 'linguistic', updatedAt: '2026-04-15T00:02:00.000Z' }],
      'morpheme:morph-1': [{ id: 'note-m', content: { zho: '词素注释' }, category: 'linguistic', updatedAt: '2026-04-15T00:03:00.000Z' }],
    };

    const mockDb = {
      dexie: {
        transaction: vi.fn(async (
          _mode: unknown,
          ...args: Array<unknown>
        ) => {
          const callback = args[args.length - 1];
          if (typeof callback !== 'function') {
            throw new Error('transaction callback missing');
          }
          return callback();
        }),
        layer_units: {
          get: vi.fn(async () => ({ id: 'utt-1', layerId: 'layer-tr', textId: 'text-1', mediaId: 'media-1', startTime: 1, endTime: 3, unitType: 'unit' })),
        },
        unit_tokens: {
          where: vi.fn(() => ({
            equals: vi.fn(() => ({
              toArray: vi.fn(async () => tokenRows),
            })),
          })),
        },
        unit_morphemes: {
          where: vi.fn(() => ({
            equals: vi.fn(() => ({
              toArray: vi.fn(async () => morphemeRows),
            })),
          })),
        },
        tier_definitions: {
          where: vi.fn(() => ({
            anyOf: vi.fn((ids: string[]) => ({
              toArray: vi.fn(async () => layers.filter((row) => ids.includes(row.id))),
            })),
          })),
        },
        user_notes: {
          where: vi.fn(() => ({
            equals: vi.fn((pair: [string, string]) => ({
              toArray: vi.fn(async () => noteRowsByTarget[`${pair[0]}:${pair[1]}`] ?? []),
            })),
          })),
        },
      },
      collections: {},
    };

    mockGetDb.mockResolvedValue(mockDb);
    mockListUnitTextsByUnit.mockResolvedValue([
      {
        id: 'txt-tr',
        unitId: 'utt-1',
        layerId: 'layer-tr',
        modality: 'text',
        text: 'ni hao',
        sourceType: 'human',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'txt-zh',
        unitId: 'utt-1',
        layerId: 'layer-zh',
        modality: 'text',
        text: '你好',
        sourceType: 'human',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:01:00.000Z',
      },
      {
        id: 'txt-en',
        unitId: 'utt-1',
        layerId: 'layer-en',
        modality: 'text',
        text: 'Hello',
        sourceType: 'human',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:02:00.000Z',
      },
    ]);

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_linguistic_memory', arguments: { unitId: 'utt-1', includeNotes: true, includeMorphemes: true } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect(result.name).toBe('get_unit_linguistic_memory');
    const payload = result.result as {
      unit: { id: string; notes: unknown[] };
      sentence: { translations: Array<{ text?: string }> };
      tokens: Array<{ pos?: string; morphemes?: Array<{ pos?: string }>; notes?: unknown[] }>;
      coverage: { translationCount: number; tokenCount: number; tokenWithPosCount: number; morphemeCount: number };
      _readModel: { unitIndexComplete: boolean };
    };
    expect(payload.unit.id).toBe('utt-1');
    expect(payload.unit.notes).toHaveLength(1);
    expect(payload.sentence.translations).toHaveLength(2);
    expect(payload.sentence.translations.some((row) => row.text === '你好')).toBe(true);
    expect(payload.tokens).toHaveLength(1);
    expect(payload.tokens[0]?.pos).toBe('PRON');
    expect(payload.tokens[0]?.notes).toHaveLength(1);
    expect(payload.tokens[0]?.morphemes?.[0]?.pos).toBe('PRON');
    expect(payload.coverage.translationCount).toBe(2);
    expect(payload.coverage.tokenCount).toBe(1);
    expect(payload.coverage.tokenWithPosCount).toBe(1);
    expect(payload.coverage.morphemeCount).toBe(1);
    expect(payload._readModel.unitIndexComplete).toBe(true);
  });

  it('reads linguistic memory via Dexie tables even when layer collection adapters are unavailable', async () => {
    const ref = { current: 0 };
    const context = { shortTerm: {}, longTerm: {} };
    const mockDb = {
      dexie: {
        transaction: vi.fn(async (_mode: unknown, ...args: Array<unknown>) => {
          const callback = args[args.length - 1];
          if (typeof callback !== 'function') throw new Error('transaction callback missing');
          return callback();
        }),
        layer_units: {
          get: vi.fn(async () => ({ id: 'utt-safe', layerId: 'layer-tr', textId: 'text-1', mediaId: 'media-1', startTime: 0, endTime: 1, unitType: 'unit' })),
        },
        unit_tokens: {
          where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
        },
        unit_morphemes: {
          where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
        },
        tier_definitions: {
          where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn(async () => ([{ id: 'layer-tr', contentType: 'transcription' }])) })) })),
        },
        user_notes: {
          where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
        },
      },
      collections: {},
    };

    mockGetDb.mockResolvedValue(mockDb);
    mockListUnitTextsByUnit.mockResolvedValue([
      {
        id: 'txt-safe',
        unitId: 'utt-safe',
        layerId: 'layer-tr',
        modality: 'text',
        text: 'safe read',
        sourceType: 'human',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
    ]);

    const result = await executeLocalContextToolCall(
      { name: 'get_unit_linguistic_memory', arguments: { unitId: 'utt-safe', includeNotes: true, includeMorphemes: true } },
      context,
      ref,
    );

    expect(result.ok).toBe(true);
    expect((result.result as { unit: { id: string } }).unit.id).toBe('utt-safe');
  });
});

function makeLocalUnitIndexRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `unit-${i}`,
    kind: 'unit' as const,
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

  it('keeps captured scope when paging by resultHandle even if caller passes another scope', async () => {
    const ref = { current: 0 };
    const n = LIST_UNITS_SNAPSHOT_ROW_THRESHOLD + 3;
    const context = {
      shortTerm: {
        timelineReadModelEpoch: 1,
        unitIndexComplete: true,
        localUnitIndex: makeLocalUnitIndexRows(n),
      },
      longTerm: {},
    };
    const first = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { limit: 5, offset: 0, scope: 'current_scope' } },
      context,
      ref,
    );
    expect(first.ok).toBe(true);
    const handle = (first.result as { resultHandle: string }).resultHandle;
    const second = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { resultHandle: handle, limit: 5, offset: 0, scope: 'project' } },
      context,
      ref,
    );
    expect(second.ok).toBe(true);
    const p2 = second.result as { scope: string };
    expect(p2.scope).toBe('current_scope');
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
  it('formats speaker-count clarification without exposing raw json blocks', () => {
    const msg = formatLocalContextToolResultMessage({
      ok: true,
      name: 'get_current_selection',
      result: {
        currentMediaUnitCount: 6,
        currentScopeUnitCount: 6,
        projectUnitCount: 6,
        _readModel: { unitIndexComplete: true, capturedAtMs: 1 },
      },
    }, 'zh-CN', '当前有多少说话人？');
    expect(msg).not.toContain('```json');
    expect(msg).toContain('说话人');
    expect(msg).toContain('当前音频');
  });

  it('formats unfinished transcription count from diagnose_quality as a direct answer', () => {
    const msg = formatLocalContextToolResultMessage({
      ok: true,
      name: 'diagnose_quality',
      result: {
        count: 1,
        items: [{ category: 'empty_text', count: 5 }],
      },
    }, 'zh-CN', '还有多少未转写？');
    expect(msg).not.toContain('```json');
    expect(msg).toContain('5');
    expect(msg).toContain('未转写');
  });

  it('uses unavailable wording for acoustic tools when playable media is missing', () => {
    const msg = formatLocalContextToolResultMessage({
      ok: true,
      name: 'get_acoustic_summary',
      result: {
        ok: false,
        reason: 'no_playable_media',
        _readModel: { unitIndexComplete: true, capturedAtMs: 1 },
      },
    }, 'zh-CN');

    expect(msg).toContain('当前没有可播放媒体');
    expect(msg).toContain('无法读取声学摘要');
  });

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
      expect(msg).not.toContain('```json');
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
      expect(msg).toContain('internal details were omitted');
      expect(msg).not.toContain('```json');
      const hit = recorded.find((e) => e.id === 'ai.local_tool_result_truncated');
      expect(hit).toBeDefined();
      expect(hit?.tags?.scope).toBe('single');
      expect(hit?.tags?.toolName).toBe('get_project_stats');
      expect(typeof hit?.tags?.payloadChars).toBe('number');
      expect(hit?.tags?.payloadChars as number).toBeGreaterThan(LOCAL_TOOL_RESULT_CHAR_BUDGET);
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
      expect(msg).toContain('internal details were omitted');
      expect(msg).not.toContain('```json');
      const hit = recorded.find((e) => e.id === 'ai.local_tool_result_truncated');
      expect(hit?.tags?.scope).toBe('batch');
    } finally {
      dispose();
    }
  });
});
