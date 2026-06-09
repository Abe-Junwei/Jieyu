import { describe, expect, it } from 'vitest';
import {
  compactAgentLoopHistoryForContinuation,
  compactLocalToolResultContinuationContent,
  summarizeLocalToolResultsForCompaction,
} from './agentLoopHistoryCompaction';

describe('agentLoopHistoryCompaction', () => {
  it('summarizes tool results for compaction', () => {
    const summary = summarizeLocalToolResultsForCompaction([
      { ok: true, name: 'search_units', result: { count: 3 } },
      { ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' },
    ]);
    expect(summary).toContain('search_units:ok');
    expect(summary).toContain('count=3');
    expect(summary).toContain('get_unit_detail:fail');
  });

  it('compacts local tool result continuation payload', () => {
    const original = [
      '__LOCAL_TOOL_RESULT__',
      'original_user_request: "find segment"',
      'tool_result_payload: {"type":"local_tool_result","step":2,"results":[{"ok":true,"name":"search_units","result":{"count":1}}]}',
      'Please continue',
    ].join('\n');

    const compacted = compactLocalToolResultContinuationContent(original);
    expect(compacted).toContain('compacted_step: 2');
    expect(compacted).toContain('search_units:ok');
    expect(compacted).not.toContain('tool_result_payload:');
  });

  it('parses nested JSON in tool_result_payload without greedy truncation', () => {
    const original = [
      '__LOCAL_TOOL_RESULT__',
      'tool_result_payload: {"type":"local_tool_result","step":3,"results":[{"ok":true,"name":"search_units","result":{"nested":{"count":2}}}]}',
      'Please continue',
    ].join('\n');

    const compacted = compactLocalToolResultContinuationContent(original);
    expect(compacted).toContain('compacted_step: 3');
    expect(compacted).toContain('search_units:ok');
  });

  it('keeps only the latest carrier message full in history', () => {
    const heavy = `__LOCAL_TOOL_RESULT__\ntool_result_payload: {"type":"local_tool_result","step":1,"results":[{"ok":true,"name":"search_units","result":{"count":2}}]}`;
    const latest = `__LOCAL_TOOL_RESULT__\ntool_result_payload: {"type":"local_tool_result","step":2,"results":[{"ok":true,"name":"get_unit_detail","result":{"id":"u1"}}]}`;

    const history = [
      { role: 'user' as const, content: 'query' },
      { role: 'assistant' as const, content: heavy },
      { role: 'user' as const, content: latest },
    ];

    const compacted = compactAgentLoopHistoryForContinuation(history);
    expect(compacted[1]!.content).toContain('compacted_step');
    expect(compacted[2]!.content).toBe(latest);
  });
});
