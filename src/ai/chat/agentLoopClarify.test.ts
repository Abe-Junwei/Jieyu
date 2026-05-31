import { describe, expect, it } from 'vitest';
import { resolveAgentLoopClarifyTaskPatch } from './agentLoopClarify';

describe('resolveAgentLoopClarifyTaskPatch', () => {
  it('maps search zero to waiting_clarify with search_units + query_ambiguous', () => {
    expect(
      resolveAgentLoopClarifyTaskPatch(
        {
          action: 'clarify',
          reason: 'search_zero_results',
          messageKey: 'agentLoopSearchNoResults',
        },
        [{ ok: true, name: 'search_units', result: { count: 0, matches: [] } }],
        2,
      ),
    ).toEqual({
      status: 'waiting_clarify',
      toolName: 'search_units',
      clarifyReason: 'query_ambiguous',
      step: 2,
    });
  });

  it('maps recoverable validation to target_ambiguous with failing tool name', () => {
    expect(
      resolveAgentLoopClarifyTaskPatch(
        {
          action: 'clarify',
          reason: 'recoverable_validation_error',
          messageKey: 'agentLoopToolValidationError',
        },
        [{ ok: false, name: 'get_unit_detail', result: null, error: 'unitId is required' }],
        1,
      ),
    ).toEqual({
      status: 'waiting_clarify',
      toolName: 'get_unit_detail',
      clarifyReason: 'target_ambiguous',
      step: 1,
    });
  });

  it('returns null for non-clarify decisions', () => {
    expect(
      resolveAgentLoopClarifyTaskPatch(
        { action: 'abort', reason: 'unrecoverable_tool_failure' },
        [],
        1,
      ),
    ).toBeNull();
  });
});
