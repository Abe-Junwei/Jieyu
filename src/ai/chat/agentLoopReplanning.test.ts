import { describe, expect, it } from 'vitest';
import {
  evaluateReplanningNeed,
  isRecoverableValidationError,
  isSearchZeroResults,
  isUnitNotFoundError,
} from './agentLoopReplanning';
import type { LocalToolRoutingPlan } from './localToolSlotTypes';

const basePlan = (overrides: Partial<LocalToolRoutingPlan> = {}): LocalToolRoutingPlan => ({
  queryFamily: 'unknown',
  selectedTools: [],
  scope: 'project',
  ...overrides,
});

describe('agentLoopReplanning detectors', () => {
  it('detects search zero results', () => {
    expect(
      isSearchZeroResults({
        ok: true,
        name: 'search_units',
        result: { count: 0, matches: [] },
      }),
    ).toBe(true);
  });

  it('detects unit not found on detail tool', () => {
    expect(
      isUnitNotFoundError({
        ok: false,
        name: 'get_unit_detail',
        result: null,
        error: 'unit not found: seg-x',
      }),
    ).toBe(true);
  });

  it('detects recoverable validation errors', () => {
    expect(
      isRecoverableValidationError({
        ok: false,
        name: 'get_unit_detail',
        result: null,
        error: 'unitId is required',
      }),
    ).toBe(true);
  });
});

describe('evaluateReplanningNeed', () => {
  it('returns clarify when search family has zero hits', () => {
    const decision = evaluateReplanningNeed(
      basePlan({ queryFamily: 'search', selectedTools: ['search_units'] }),
      [{ ok: true, name: 'search_units', result: { count: 0, matches: [] } }],
      1,
      6,
    );
    expect(decision.action).toBe('clarify');
    expect(decision.messageKey).toBe('agentLoopSearchNoResults');
  });

  it('returns replan search when detail unit is missing', () => {
    const plan = basePlan({
      queryFamily: 'detail',
      selectedTools: ['get_unit_detail'],
      scope: 'current_scope',
    });
    const decision = evaluateReplanningNeed(
      plan,
      [{ ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' }],
      1,
      6,
    );
    expect(decision.action).toBe('replan');
    expect(decision.newPlan?.queryFamily).toBe('search');
    expect(decision.newPlan?.selectedTools).toEqual(['search_units']);
    expect(decision.newPlan?.scope).toBe('current_scope');
  });

  it('returns replan list when count metric has no deterministic value', () => {
    const plan = basePlan({
      queryFamily: 'count',
      selectedTools: ['get_project_stats'],
      requestedMetric: 'speaker_count',
    });
    const decision = evaluateReplanningNeed(
      plan,
      [
        {
          ok: true,
          name: 'get_project_stats',
          result: { requestedMetric: 'unit_count', value: 3 },
        },
      ],
      1,
      6,
    );
    expect(decision.action).toBe('replan');
    expect(decision.newPlan?.queryFamily).toBe('list');
  });

  it('returns clarify for recoverable validation errors', () => {
    const decision = evaluateReplanningNeed(
      basePlan({ queryFamily: 'detail' }),
      [{ ok: false, name: 'get_unit_detail', result: null, error: 'invalid unitId format' }],
      1,
      6,
    );
    expect(decision.action).toBe('clarify');
    expect(decision.messageKey).toBe('agentLoopToolValidationError');
  });

  it('returns abort for unrecoverable failures', () => {
    const decision = evaluateReplanningNeed(
      basePlan(),
      [{ ok: false, name: 'list_layers', result: null, error: 'database unavailable' }],
      1,
      6,
    );
    expect(decision.action).toBe('abort');
  });

  it('returns abort when mixed recoverable and unrecoverable failures', () => {
    const decision = evaluateReplanningNeed(
      basePlan({ queryFamily: 'detail' }),
      [
        { ok: false, name: 'get_unit_detail', result: null, error: 'unitId is required' },
        { ok: false, name: 'list_layers', result: null, error: 'database unavailable' },
      ],
      1,
      6,
    );
    expect(decision.action).toBe('abort');
    expect(decision.reason).toBe('unrecoverable_tool_failure');
  });

  it('does not replan on the last step boundary', () => {
    const decision = evaluateReplanningNeed(
      basePlan({ queryFamily: 'search' }),
      [{ ok: true, name: 'search_units', result: { count: 0, matches: [] } }],
      5,
      6,
    );
    expect(decision.action).toBe('continue');
    expect(decision.reason).toBe('near_max_steps_no_replan');
  });
});
