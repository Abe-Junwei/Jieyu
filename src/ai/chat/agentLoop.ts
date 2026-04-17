import { buildAgentLoopContinuationToolPayload, type LocalContextToolResult } from './localContextTools';
import type { LocalToolMetric } from './chatDomain.types';
import { generateTraceId } from '../../observability/aiTrace';

/** Same guidance as `formatLocalContextToolResultMessage` when structured shrink still leaves gaps. */
const AGENT_LOOP_CONTINUATION_TRUNCATION_TAIL =
  '\n[DATA TRUNCATED — do NOT fabricate missing items. Tell the user that the full list is too long and suggest using more specific queries or smaller limit/offset.]';

export interface AgentLoopConfig {
  maxSteps: number;
  tokenBudgetWarningThreshold: number;
}

export interface AgentLoopTaskState {
  queryFamily?: 'count' | 'search' | 'detail' | 'list' | 'selection' | 'quality' | 'unknown';
  requestedMetric?: LocalToolMetric;
  scope?: 'project' | 'current_track' | 'current_scope';
  selectedTools?: string[];
  answerReady?: boolean;
  executionState?: 'running' | 'waiting_clarify' | 'answer_ready' | 'error';
}

export interface AgentLoopTraceContext {
  traceId: string;
}

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxSteps: 6,
  tokenBudgetWarningThreshold: 12000,
};

export function createAgentLoopTraceContext(traceId = generateTraceId()): AgentLoopTraceContext {
  return { traceId };
}

export function buildAgentLoopStepTraceTags(
  step: number,
  taskState?: Pick<AgentLoopTaskState, 'queryFamily' | 'scope' | 'selectedTools'>,
): Record<string, string | number | boolean> {
  return {
    step,
    ...(taskState?.queryFamily ? { queryFamily: taskState.queryFamily } : {}),
    ...(taskState?.scope ? { scope: taskState.scope } : {}),
    ...(Array.isArray(taskState?.selectedTools) ? { selectedToolCount: taskState.selectedTools.length } : {}),
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveMetricValue(result: LocalContextToolResult): number | undefined {
  if (!result.ok) return undefined;
  const body = asObjectRecord(result.result);
  if (!body) return undefined;
  if (typeof body.value === 'number' && Number.isFinite(body.value)) return body.value;
  const meta = asObjectRecord(body.meta);
  if (meta && typeof meta.value === 'number' && Number.isFinite(meta.value)) return meta.value;
  return undefined;
}

function isKnownMetric(value: unknown): value is LocalToolMetric {
  return value === 'unit_count'
    || value === 'speaker_count'
    || value === 'translation_layer_count'
    || value === 'ai_confidence_avg'
    || value === 'untranscribed_count'
    || value === 'missing_speaker_count';
}

function resolveRequestedMetric(result: LocalContextToolResult): LocalToolMetric | undefined {
  if (!result.ok) return undefined;
  const body = asObjectRecord(result.result);
  if (!body) return undefined;
  const requestedMetric = typeof body.requestedMetric === 'string' ? body.requestedMetric : undefined;
  if (isKnownMetric(requestedMetric)) {
    return requestedMetric;
  }
  const meta = asObjectRecord(body.meta);
  const metaRequested = meta && typeof meta.requestedMetric === 'string' ? meta.requestedMetric : undefined;
  if (isKnownMetric(metaRequested)) {
    return metaRequested;
  }
  return undefined;
}

function isAnswerReadyForMetricQuery(
  metric: LocalToolMetric | undefined,
  localToolResults: LocalContextToolResult[],
): boolean {
  if (!isKnownMetric(metric)) return false;
  return localToolResults.some((item) => {
    if (!item.ok || (item.name !== 'diagnose_quality' && item.name !== 'get_project_stats')) return false;
    const value = resolveMetricValue(item);
    if (value === undefined) return false;
    return resolveRequestedMetric(item) === metric;
  });
}

function isAnswerReadyForDetailQuery(localToolResults: LocalContextToolResult[]): boolean {
  return localToolResults.some((item) => item.ok && (
    item.name === 'get_unit_detail'
    || item.name === 'get_unit_linguistic_memory'
  ));
}

function isAnswerReadyForSearchQuery(localToolResults: LocalContextToolResult[]): boolean {
  return localToolResults.some((item) => item.ok && item.name === 'search_units');
}

function isTaskStateObject(value: unknown): value is AgentLoopTaskState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return true;
}

export function shouldContinueAgentLoop(
  step: number,
  config: AgentLoopConfig,
  localToolResults: LocalContextToolResult[] | undefined,
  metricOrTaskState?: LocalToolMetric | AgentLoopTaskState,
): boolean {
  const taskState = isTaskStateObject(metricOrTaskState) ? metricOrTaskState : undefined;
  const metric = isTaskStateObject(metricOrTaskState)
    ? metricOrTaskState.requestedMetric
    : metricOrTaskState;

  if (taskState?.answerReady === true) return false;
  if (taskState?.executionState === 'answer_ready') return false;
  if (!localToolResults || localToolResults.length === 0) return false;
  if (localToolResults.some((item) => !item.ok)) return false;

  if (taskState?.queryFamily === 'search' && isAnswerReadyForSearchQuery(localToolResults)) return false;
  if (taskState?.queryFamily === 'detail' && isAnswerReadyForDetailQuery(localToolResults)) return false;
  if (isAnswerReadyForMetricQuery(metric, localToolResults)) return false;
  if (isAnswerReadyForDetailQuery(localToolResults)) return false;
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
