/**
 * T4-a：工具决策审计 `metadata.reason` 与紧凑 `newValue` 第三段的 **真源枚举** + **失败分流**映射。
 * Canonical registry for audit `metadata.reason` / compact `newValue` segment + failure triage hints.
 */

/** 紧凑 `confirm_failed|auto_failed:<tool>:<reason>` 中，视为「未产生可幂等已提交副作用」的 reason（与 `hasPersistedExecutionForRequest` 回退口径一致）。 */
const NON_PERSISTED_ORDERED = [
  'invalid_args',
  'invalid_child_args',
  'no_executor',
  'duplicate_requestId',
  'child_failed',
  'exception',
  'user_directive_never_execute',
  'user_directive_deny_destructive',
  'user_directive_deny_batch',
  'stale_read_model',
  'invalid_proposed_changes',
  'ambiguous_target',
  'unresolved_delete_segment_target',
  'unresolved_write_target',
] as const;

/** 可出现于 `ToolDecisionAuditMetadata.reason` 的其它已知码（门控 / UI policy 文案对齐；不必属于非持久化白名单）。 */
const ADDITIONAL_METADATA_REASON_ORDERED = [
  'user_directive_confirmation_required',
  'propose_changes_requires_confirmation',
  'explicit_target_write_requires_confirmation',
  'destructive_action_requires_confirmation',
] as const;

export type NonPersistedToolDecisionReason = (typeof NON_PERSISTED_ORDERED)[number];

export type ToolDecisionMetadataReasonCode =
  | NonPersistedToolDecisionReason
  | (typeof ADDITIONAL_METADATA_REASON_ORDERED)[number];

export const NON_PERSISTED_TOOL_DECISION_REASONS: ReadonlySet<string> = new Set(NON_PERSISTED_ORDERED);

export const TOOL_DECISION_METADATA_REASON_CODES: readonly ToolDecisionMetadataReasonCode[] = [
  ...NON_PERSISTED_ORDERED,
  ...ADDITIONAL_METADATA_REASON_ORDERED,
];

/** 史诗 T4「重试 / 澄清 / 人工接管 / 放弃」四象限运维分流（T4-c 仅对白名单 reason 做自动重试）。 */
export type AiToolDecisionFailureTriage = 'retry' | 'clarify' | 'human' | 'abandon';

export const TOOL_DECISION_REASON_FAILURE_TRIAGE: Record<ToolDecisionMetadataReasonCode, AiToolDecisionFailureTriage> = {
  invalid_args: 'clarify',
  invalid_child_args: 'clarify',
  no_executor: 'human',
  duplicate_requestId: 'abandon',
  child_failed: 'human',
  exception: 'retry',
  user_directive_never_execute: 'abandon',
  user_directive_deny_destructive: 'abandon',
  user_directive_deny_batch: 'abandon',
  stale_read_model: 'retry',
  invalid_proposed_changes: 'clarify',
  ambiguous_target: 'clarify',
  unresolved_delete_segment_target: 'clarify',
  unresolved_write_target: 'clarify',
  user_directive_confirmation_required: 'human',
  propose_changes_requires_confirmation: 'human',
  explicit_target_write_requires_confirmation: 'human',
  destructive_action_requires_confirmation: 'human',
};

export function isNonPersistedToolDecisionReason(reason: string | undefined | null): boolean {
  const code = (reason ?? '').trim();
  if (!code) return false;
  return NON_PERSISTED_TOOL_DECISION_REASONS.has(code);
}

export function isKnownToolDecisionMetadataReasonCode(
  reason: string | undefined | null,
): reason is ToolDecisionMetadataReasonCode {
  const code = (reason ?? '').trim();
  if (!code) return false;
  return (TOOL_DECISION_METADATA_REASON_CODES as readonly string[]).includes(code);
}

/**
 * 无 `metadataJson` 时从 `newValue` 提取第三段 reason（与 `useAiChat.toolAudit` 幂等回退一致）。
 */
export function parseCompactToolDecisionReasonFromNewValue(newValue: string | undefined | null): string | undefined {
  const parts = String(newValue ?? '').split(':');
  const decision = parts[0] ?? '';
  if (decision !== 'confirm_failed' && decision !== 'auto_failed') return undefined;
  const reason = parts[2] ?? '';
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getToolDecisionFailureTriage(reason: string | undefined | null): AiToolDecisionFailureTriage {
  const code = (reason ?? '').trim();
  if (!code) return 'human';
  if (isKnownToolDecisionMetadataReasonCode(code)) {
    return TOOL_DECISION_REASON_FAILURE_TRIAGE[code];
  }
  return 'human';
}

/** T4-c：单工具确认路径执行器抛错/超时时的最大调用次数（含首次）。 */
export const TOOL_CALL_EXECUTOR_AUTO_RETRY_MAX_ATTEMPTS = 2 as const;

/**
 * T4-c：是否在本次抛错后再试一次 `onToolCall`（仅 catch 支路使用；不重试业务 `ok:false`）。
 */
export function shouldRetryToolCallExecutorThrow(params: {
  enabled: boolean;
  attemptIndex: number;
  toolName: string;
  /** 调用方负责将 `name` 约束到本仓库工具名域。 */
  isDestructive: (name: string) => boolean;
}): boolean {
  if (!params.enabled) return false;
  if (params.attemptIndex >= TOOL_CALL_EXECUTOR_AUTO_RETRY_MAX_ATTEMPTS - 1) return false;
  if (params.isDestructive(params.toolName)) return false;
  return true;
}
