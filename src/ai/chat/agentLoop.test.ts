import { describe, expect, it } from 'vitest';
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
});
