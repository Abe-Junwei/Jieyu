import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_LOOP_CONFIG, shouldContinueAgentLoop } from './agentLoop';

describe('shouldContinueAgentLoop — closed-loop replanning', () => {
  it('continues on replan decision despite failed detail tool', () => {
    expect(
      shouldContinueAgentLoop(
        1,
        DEFAULT_AGENT_LOOP_CONFIG,
        [{ ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' }],
        { queryFamily: 'detail', scope: 'project', selectedTools: ['get_unit_detail'] },
        {
          closedLoopReplanningEnabled: true,
          replanningDecision: {
            action: 'replan',
            reason: 'detail_unit_not_found',
            newPlan: {
              queryFamily: 'search',
              selectedTools: ['search_units'],
              scope: 'project',
            },
          },
        },
      ),
    ).toBe(true);
  });

  it('stops on clarify/abort replanning decisions', () => {
    expect(
      shouldContinueAgentLoop(
        1,
        DEFAULT_AGENT_LOOP_CONFIG,
        [{ ok: true, name: 'search_units', result: { count: 0, matches: [] } }],
        { queryFamily: 'search', scope: 'project', selectedTools: ['search_units'] },
        {
          closedLoopReplanningEnabled: true,
          replanningDecision: { action: 'clarify', reason: 'search_zero' },
        },
      ),
    ).toBe(false);
  });

  it('does not treat search count 0 as answer-ready when requireSearchHitCount is on', () => {
    expect(
      shouldContinueAgentLoop(
        1,
        DEFAULT_AGENT_LOOP_CONFIG,
        [{ ok: true, name: 'search_units', result: { count: 0, matches: [] } }],
        { queryFamily: 'search', scope: 'project', selectedTools: ['search_units'] },
        {
          closedLoopReplanningEnabled: true,
          requireSearchHitCount: true,
          replanningDecision: { action: 'continue', reason: 'ok' },
        },
      ),
    ).toBe(true);
  });

  it('without replanning flag, failed tools still stop the loop', () => {
    expect(
      shouldContinueAgentLoop(
        1,
        DEFAULT_AGENT_LOOP_CONFIG,
        [{ ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' }],
        { queryFamily: 'detail', scope: 'project', selectedTools: ['get_unit_detail'] },
      ),
    ).toBe(false);
  });
});
