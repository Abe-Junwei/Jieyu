import type { LocalContextToolResult } from './localContextTools';

export interface AgentLoopConfig {
  maxSteps: number;
  tokenBudgetWarningThreshold: number;
}

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxSteps: 6,
  tokenBudgetWarningThreshold: 12000,
};

export function shouldContinueAgentLoop(
  step: number,
  config: AgentLoopConfig,
  localToolResults: LocalContextToolResult[] | undefined,
): boolean {
  if (!localToolResults || localToolResults.length === 0) return false;
  if (localToolResults.some((item) => !item.ok)) return false;
  return step < config.maxSteps;
}

export function estimateRemainingLoopTokens(
  perStepInputTokens: number,
  step: number,
  config: AgentLoopConfig,
): number {
  const remainingSteps = Math.max(0, config.maxSteps - step);
  return Math.max(0, perStepInputTokens * remainingSteps);
}

export function shouldWarnTokenBudget(
  estimatedRemainingTokens: number,
  config: AgentLoopConfig,
): boolean {
  return estimatedRemainingTokens >= config.tokenBudgetWarningThreshold;
}

export function buildAgentLoopContinuationInput(
  originalUserText: string,
  localToolResults: LocalContextToolResult[],
  step: number,
): string {
  const payload = JSON.stringify({
    type: 'local_tool_result',
    step,
    originalUserRequest: originalUserText,
    results: localToolResults,
  });

  return [
    '__LOCAL_TOOL_RESULT__',
    `original_user_request: ${JSON.stringify(originalUserText)}`,
    `tool_result_payload: ${payload}`,
    'Please continue from this tool result and provide the next best response. If more tool calls are needed, return tool_call JSON.',
    'IMPORTANT: Only use data present in the tool result above. Do NOT fabricate, infer, or extrapolate items, times, or IDs beyond what the tool returned.',
  ].join('\n');
}
