/**
 * PR-17: 降级路径手动接管 UX — 状态机与类型定义
 *
 * 5 类降级场景：
 * 1. plan_degraded      → 🎮 分步执行
 * 2. reflection_flagged → 🎮 审查矛盾
 * 3. judge_low_score    → 🎮 手动验证引用
 * 4. cost_anomaly       → 🎮 简化查询
 * 5. rag_no_results     → 🎮 扩大检索范围
 *
 * 接管操作仍走现有 policy / sandbox / confirm / audit 门禁链路。
 */

import { t, type Locale } from '../../i18n';

export type DegradationScenario =
  | 'plan_degraded'
  | 'reflection_flagged'
  | 'judge_low_score'
  | 'cost_anomaly'
  | 'rag_no_results';

export const DEGRADATION_SCENARIOS: readonly DegradationScenario[] = [
  'plan_degraded',
  'reflection_flagged',
  'judge_low_score',
  'cost_anomaly',
  'rag_no_results',
];

export type DegradationOverrideStatus = 'pending' | 'overridden' | 'dismissed';

export interface DegradationOverrideState {
  scenario: DegradationScenario;
  messageId: string;
  status: DegradationOverrideStatus;
  overrideAction?: string;
  createdAt: string;
}

const LABEL_KEY_MAP: Record<DegradationScenario, import('../../i18n').DictKey> = {
  plan_degraded: 'msg.aiChat.degradation.label.planDegraded',
  reflection_flagged: 'msg.aiChat.degradation.label.reflectionFlagged',
  judge_low_score: 'msg.aiChat.degradation.label.judgeLowScore',
  cost_anomaly: 'msg.aiChat.degradation.label.costAnomaly',
  rag_no_results: 'msg.aiChat.degradation.label.ragNoResults',
};

const DESCRIPTION_KEY_MAP: Record<DegradationScenario, import('../../i18n').DictKey> = {
  plan_degraded: 'msg.aiChat.degradation.description.planDegraded',
  reflection_flagged: 'msg.aiChat.degradation.description.reflectionFlagged',
  judge_low_score: 'msg.aiChat.degradation.description.judgeLowScore',
  cost_anomaly: 'msg.aiChat.degradation.description.costAnomaly',
  rag_no_results: 'msg.aiChat.degradation.description.ragNoResults',
};

/**
 * 判断给定场景是否支持手动接管。
 * 当前所有 5 类场景均开放接管入口。
 */
export function canOverrideScenario(scenario: DegradationScenario): boolean {
  return DEGRADATION_SCENARIOS.includes(scenario);
}

/**
 * 根据场景和语言生成接管按钮标签。
 */
export function buildOverrideLabel(scenario: DegradationScenario, locale: Locale): string {
  return t(locale, LABEL_KEY_MAP[scenario]);
}

/**
 * 生成所有场景的完整描述文本（用于 tooltip 或辅助说明）。
 */
export function buildOverrideDescription(scenario: DegradationScenario, locale: Locale): string {
  return t(locale, DESCRIPTION_KEY_MAP[scenario]);
}

export function createOverrideState(
  scenario: DegradationScenario,
  messageId: string,
): DegradationOverrideState {
  return {
    scenario,
    messageId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

export function applyOverride(
  state: DegradationOverrideState,
  action: string,
): DegradationOverrideState {
  return {
    ...state,
    status: 'overridden',
    overrideAction: action,
  };
}

export function dismissOverride(state: DegradationOverrideState): DegradationOverrideState {
  return {
    ...state,
    status: 'dismissed',
  };
}
