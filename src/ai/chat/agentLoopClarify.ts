/**
 * agentLoopClarify — Agent loop clarify 分支与 taskSession 对齐。
 */

import type { AiTaskSession } from './chatDomain.types';
import type { LocalContextToolName, LocalContextToolResult } from './localContextToolTypes';
import { isRecoverableValidationError, type ReplanningDecision } from './agentLoopReplanning';

export type AgentLoopClarifyTaskPatch = Pick<
  AiTaskSession,
  'status' | 'toolName' | 'clarifyReason' | 'step'
>;

function resolveClarifyToolName(
  results: LocalContextToolResult[] | undefined,
): LocalContextToolName | undefined {
  const failed = results?.find((r) => !r.ok && isRecoverableValidationError(r));
  return failed?.name;
}

/** 将 replanning clarify 决策映射为 waiting_clarify taskSession 补丁。 */
export function resolveAgentLoopClarifyTaskPatch(
  decision: ReplanningDecision,
  localToolResults: LocalContextToolResult[] | undefined,
  loopStep: number,
): AgentLoopClarifyTaskPatch | null {
  if (decision.action !== 'clarify') return null;

  if (decision.reason === 'search_zero_results') {
    return {
      status: 'waiting_clarify',
      toolName: 'search_units',
      clarifyReason: 'query_ambiguous',
      step: loopStep,
    };
  }

  if (decision.reason === 'recoverable_validation_error') {
    return {
      status: 'waiting_clarify',
      toolName: resolveClarifyToolName(localToolResults) ?? 'get_unit_detail',
      clarifyReason: 'target_ambiguous',
      step: loopStep,
    };
  }

  return {
    status: 'waiting_clarify',
    step: loopStep,
  };
}
