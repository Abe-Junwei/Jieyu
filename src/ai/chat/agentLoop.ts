import {
  buildAgentLoopContinuationToolPayload,
  type LocalContextToolResult,
} from './localContextTools';

/** Same guidance as `formatLocalContextToolResultMessage` when structured shrink still leaves gaps. */
const AGENT_LOOP_CONTINUATION_TRUNCATION_TAIL =
  '\n[DATA TRUNCATED — do NOT fabricate missing items. Tell the user that the full list is too long and suggest using more specific queries or smaller limit/offset.]';

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
  const { payloadJson, truncated, cappedUserRequest } = buildAgentLoopContinuationToolPayload(
    originalUserText,
    localToolResults,
    step,
  );

  return [
    '__LOCAL_TOOL_RESULT__',
    `original_user_request: ${JSON.stringify(cappedUserRequest)}`,
    `tool_result_payload: ${payloadJson}`,
    'Please continue from this tool result and provide the next best response. If more tool calls are needed, return tool_call JSON.',
    'IMPORTANT: Only use data present in the tool result above. Do NOT fabricate, infer, or extrapolate items, times, or IDs beyond what the tool returned.',
    ...(truncated ? [AGENT_LOOP_CONTINUATION_TRUNCATION_TAIL] : []),
  ].join('\n');
}
