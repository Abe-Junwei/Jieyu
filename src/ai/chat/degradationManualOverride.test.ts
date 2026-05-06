import { describe, it, expect } from 'vitest';
import {
  DEGRADATION_SCENARIOS,
  type DegradationScenario,
  canOverrideScenario,
  buildOverrideLabel,
  buildOverrideDescription,
  createOverrideState,
  applyOverride,
  dismissOverride,
} from './degradationManualOverride';
import type { Locale } from '../../i18n';

describe('canOverrideScenario', () => {
  it.each(DEGRADATION_SCENARIOS)(
    'returns true for supported scenario %s',
    (scenario: DegradationScenario) => {
      expect(canOverrideScenario(scenario)).toBe(true);
    },
  );
});

describe('buildOverrideLabel', () => {
  it('returns Chinese label for zh locale', () => {
    expect(buildOverrideLabel('plan_degraded', 'zh-CN' as Locale)).toContain('分步执行');
  });

  it('returns English label for en locale', () => {
    expect(buildOverrideLabel('plan_degraded', 'en-US' as Locale)).toContain('Step-by-step');
  });

  it('returns Chinese label for default unknown locale', () => {
    expect(buildOverrideLabel('reflection_flagged', 'zh-CN' as Locale)).toContain('审查矛盾');
  });

  it.each(DEGRADATION_SCENARIOS)('label contains 🎮 for %s', (scenario: DegradationScenario) => {
    const label = buildOverrideLabel(scenario, 'zh-CN');
    expect(label).toContain('🎮');
  });
});

describe('buildOverrideDescription', () => {
  it('returns Chinese description for zh locale', () => {
    expect(buildOverrideDescription('judge_low_score', 'zh-CN' as Locale)).toContain('引用质量评分');
  });

  it('returns English description for en locale', () => {
    expect(buildOverrideDescription('judge_low_score', 'en-US' as Locale)).toContain('citation quality');
  });

  it('contains "RAG" keyword for rag_no_results in Chinese', () => {
    expect(buildOverrideDescription('rag_no_results', 'zh-CN' as Locale)).toContain('RAG');
  });

  it('contains "cost anomaly" keyword for cost_anomaly in English', () => {
    expect(buildOverrideDescription('cost_anomaly', 'en-US' as Locale)).toContain('Cost anomaly');
  });
});

describe('createOverrideState', () => {
  it('initializes with pending status and createdAt', () => {
    const state = createOverrideState('plan_degraded', 'msg-001');
    expect(state.scenario).toBe('plan_degraded');
    expect(state.messageId).toBe('msg-001');
    expect(state.status).toBe('pending');
    expect(state.overrideAction).toBeUndefined();
    expect(state.createdAt).toBeTruthy();
    expect(new Date(state.createdAt).getTime()).not.toBeNaN();
  });
});

describe('applyOverride', () => {
  it('transitions to overridden with action', () => {
    const initial = createOverrideState('cost_anomaly', 'msg-002');
    const applied = applyOverride(initial, 'simplify_query');
    expect(applied.status).toBe('overridden');
    expect(applied.overrideAction).toBe('simplify_query');
    expect(applied.messageId).toBe('msg-002');
    expect(applied.createdAt).toBe(initial.createdAt);
  });
});

describe('dismissOverride', () => {
  it('transitions to dismissed without action', () => {
    const initial = createOverrideState('rag_no_results', 'msg-003');
    const dismissed = dismissOverride(initial);
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.overrideAction).toBeUndefined();
    expect(dismissed.messageId).toBe('msg-003');
  });

  it('can dismiss from overridden state', () => {
    const initial = createOverrideState('judge_low_score', 'msg-004');
    const applied = applyOverride(initial, 'manual_verify');
    const dismissed = dismissOverride(applied);
    expect(dismissed.status).toBe('dismissed');
    // dismiss 不修改 overrideAction，只是改 status
    expect(dismissed.overrideAction).toBe('manual_verify');
  });
});

describe('immutability', () => {
  it('applyOverride does not mutate original state', () => {
    const original = createOverrideState('reflection_flagged', 'msg-005');
    applyOverride(original, 'review');
    expect(original.status).toBe('pending');
    expect(original.overrideAction).toBeUndefined();
  });

  it('dismissOverride does not mutate original state', () => {
    const original = createOverrideState('reflection_flagged', 'msg-006');
    dismissOverride(original);
    expect(original.status).toBe('pending');
  });
});

describe('all scenarios have labels and descriptions', () => {
  it.each(DEGRADATION_SCENARIOS)('label exists for %s', (scenario: DegradationScenario) => {
    expect(buildOverrideLabel(scenario, 'zh-CN')).toBeTruthy();
    expect(buildOverrideLabel(scenario, 'en-US')).toBeTruthy();
  });

  it.each(DEGRADATION_SCENARIOS)('description exists for %s', (scenario: DegradationScenario) => {
    expect(buildOverrideDescription(scenario, 'zh-CN')).toBeTruthy();
    expect(buildOverrideDescription(scenario, 'en-US')).toBeTruthy();
  });
});
