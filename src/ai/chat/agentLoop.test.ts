import { describe, expect, it } from 'vitest';
import { addMetricObserver } from '../../observability/metrics';
import { LOCAL_TOOL_RESULT_CHAR_BUDGET } from './localContextTools';
import {
  buildAgentLoopContinuationInput,
  DEFAULT_AGENT_LOOP_CONFIG,
  estimateRemainingLoopTokens,
  shouldWarnTokenBudget,
  shouldContinueAgentLoop,
} from './agentLoop';

describe('agentLoop helpers', () => {
  it('continues within max steps when local tool result is successful', () => {
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, [{
      ok: true,
      name: 'get_current_selection',
      result: { id: 'seg-1' },
    }])).toBe(true);
  });

  it('stops when local tool result failed or step reached max', () => {
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, [{
      ok: false,
      name: 'get_current_selection',
      result: null,
      error: 'failed',
    }])).toBe(false);
    expect(shouldContinueAgentLoop(DEFAULT_AGENT_LOOP_CONFIG.maxSteps, DEFAULT_AGENT_LOOP_CONFIG, [{
      ok: true,
      name: 'get_current_selection',
      result: { id: 'seg-1' },
    }])).toBe(false);
  });

  it('builds continuation prompt with loop marker and payload', () => {
    const prompt = buildAgentLoopContinuationInput(
      'what is this segment?',
      [{
        ok: true,
        name: 'get_current_selection',
        result: { id: 'seg-1' },
      }],
      2,
    );

    expect(prompt).toContain('__LOCAL_TOOL_RESULT__');
    expect(prompt).toContain('step');
    expect(prompt).toContain('get_current_selection');
    expect(prompt).toContain('original_user_request');
    expect(prompt).toContain('what is this segment?');
  });

  it('warns when estimated remaining tokens exceed threshold', () => {
    const estimated = estimateRemainingLoopTokens(3000, 1, DEFAULT_AGENT_LOOP_CONFIG);
    expect(shouldWarnTokenBudget(estimated, DEFAULT_AGENT_LOOP_CONFIG)).toBe(true);
  });

  it('keeps tool_result_payload JSON under char budget and valid JSON', () => {
    const filler = 'x'.repeat(900);
    const results = [{
      ok: true,
      name: 'list_units' as const,
      result: {
        total: 24,
        count: 24,
        offset: 0,
        limit: 24,
        sort: 'time_asc',
        matches: Array.from({ length: 24 }, (_, i) => ({
          id: `u-${i}`,
          kind: 'utterance' as const,
          layerId: 'l',
          mediaId: 'm',
          startTime: i,
          endTime: i + 1,
          transcription: filler,
        })),
        _readModel: { unitIndexComplete: true, capturedAtMs: 1 },
      },
    }];
    const prompt = buildAgentLoopContinuationInput('hello', results, 1);
    const payloadStart = 'tool_result_payload: ';
    const i = prompt.indexOf(payloadStart);
    expect(i).toBeGreaterThan(-1);
    const jsonStart = i + payloadStart.length;
    const jsonEnd = prompt.indexOf('\n', jsonStart);
    const jsonLine = prompt.slice(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonLine) as { results: Array<{ name: string }> };
    expect(parsed.results[0]!.name).toBe('list_units');
    expect(jsonLine.length).toBeLessThanOrEqual(LOCAL_TOOL_RESULT_CHAR_BUDGET);
    expect(prompt).toContain('DATA TRUNCATED');
  });

  it('records ai.local_tool_result_truncated when agent loop payload is shrunk', () => {
    const recorded: Array<{ id: string; tags?: { scope?: string } }> = [];
    const dispose = addMetricObserver((e) => recorded.push({ id: e.id, ...(e.tags ? { tags: e.tags as { scope?: string } } : {}) }));
    try {
      const filler = 'y'.repeat(900);
      const results = [{
        ok: true,
        name: 'list_units' as const,
        result: {
          total: 24,
          count: 24,
          offset: 0,
          limit: 24,
          sort: 'time_asc',
          matches: Array.from({ length: 24 }, (_, i) => ({
            id: `u-${i}`,
            kind: 'utterance' as const,
            layerId: 'l',
            mediaId: 'm',
            startTime: i,
            endTime: i + 1,
            transcription: filler,
          })),
          _readModel: { unitIndexComplete: true, capturedAtMs: 1 },
        },
      }];
      buildAgentLoopContinuationInput('hello', results, 1);
      const hit = recorded.find((e) => e.id === 'ai.local_tool_result_truncated');
      expect(hit?.tags?.scope).toBe('agent_loop');
    } finally {
      dispose();
    }
  });
});
