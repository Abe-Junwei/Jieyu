/**
 * Release-evidence / Node 侧消费：与 `src/ai/chat/toolDecisionFailureReason.ts` **保持字段级一致**。
 * Vitest：`src/ai/chat/toolDecisionFailureReason.bundleParity.test.ts` 校验 triage 不漂移。
 */

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
];

const ADDITIONAL_METADATA_REASON_ORDERED = [
  'user_directive_confirmation_required',
  'propose_changes_requires_confirmation',
  'explicit_target_write_requires_confirmation',
  'destructive_action_requires_confirmation',
];

export const NON_PERSISTED_TOOL_DECISION_REASONS = new Set(NON_PERSISTED_ORDERED);

export const TOOL_DECISION_METADATA_REASON_CODES = [
  ...NON_PERSISTED_ORDERED,
  ...ADDITIONAL_METADATA_REASON_ORDERED,
];

const TOOL_DECISION_REASON_FAILURE_TRIAGE = {
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

function isKnownToolDecisionMetadataReasonCode(reason) {
  const code = String(reason ?? '').trim();
  if (!code) return false;
  return TOOL_DECISION_METADATA_REASON_CODES.includes(code);
}

export function getToolDecisionFailureTriage(reason) {
  const code = String(reason ?? '').trim();
  if (!code) return 'human';
  if (isKnownToolDecisionMetadataReasonCode(code)) {
    return TOOL_DECISION_REASON_FAILURE_TRIAGE[code];
  }
  return 'human';
}
