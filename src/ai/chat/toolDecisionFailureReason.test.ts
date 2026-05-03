import { describe, expect, it } from 'vitest';
import {
  getToolDecisionFailureTriage,
  isKnownToolDecisionMetadataReasonCode,
  isNonPersistedToolDecisionReason,
  NON_PERSISTED_TOOL_DECISION_REASONS,
  parseCompactToolDecisionReasonFromNewValue,
  shouldRetryToolCallExecutorThrow,
  TOOL_DECISION_METADATA_REASON_CODES,
  TOOL_DECISION_REASON_FAILURE_TRIAGE,
} from './toolDecisionFailureReason';

describe('toolDecisionFailureReason', () => {
  it('every non-persisted reason is a known metadata code', () => {
    for (const r of NON_PERSISTED_TOOL_DECISION_REASONS) {
      expect(isKnownToolDecisionMetadataReasonCode(r), r).toBe(true);
    }
  });

  it('every known metadata code has a triage bucket', () => {
    for (const code of TOOL_DECISION_METADATA_REASON_CODES) {
      expect(TOOL_DECISION_REASON_FAILURE_TRIAGE[code]).toMatch(/^(retry|clarify|human|abandon)$/);
    }
  });

  it('parses compact newValue third segment for failed decisions only', () => {
    expect(parseCompactToolDecisionReasonFromNewValue('confirm_failed:set_text:invalid_args')).toBe('invalid_args');
    expect(parseCompactToolDecisionReasonFromNewValue('auto_failed:delete_segment:duplicate_requestId')).toBe(
      'duplicate_requestId',
    );
    expect(parseCompactToolDecisionReasonFromNewValue('confirmed:foo')).toBeUndefined();
    expect(parseCompactToolDecisionReasonFromNewValue('')).toBeUndefined();
  });

  it('maps representative reasons to expected triage', () => {
    expect(getToolDecisionFailureTriage('stale_read_model')).toBe('retry');
    expect(getToolDecisionFailureTriage('  stale_read_model  ')).toBe('retry');
    expect(getToolDecisionFailureTriage('ambiguous_target')).toBe('clarify');
    expect(getToolDecisionFailureTriage('no_executor')).toBe('human');
    expect(getToolDecisionFailureTriage('user_directive_never_execute')).toBe('abandon');
    expect(getToolDecisionFailureTriage('unknown_future_reason')).toBe('human');
  });

  it('isNonPersistedToolDecisionReason matches set membership', () => {
    expect(isNonPersistedToolDecisionReason('child_failed')).toBe(true);
    expect(isNonPersistedToolDecisionReason('user_directive_confirmation_required')).toBe(false);
    expect(isNonPersistedToolDecisionReason('  invalid_args  ')).toBe(true);
  });

  it('shouldRetryToolCallExecutorThrow gates destructive tools and attempt cap', () => {
    expect(
      shouldRetryToolCallExecutorThrow({
        enabled: true,
        attemptIndex: 0,
        toolName: 'set_transcription_text',
        isDestructive: () => false,
      }),
    ).toBe(true);
    expect(
      shouldRetryToolCallExecutorThrow({
        enabled: true,
        attemptIndex: 1,
        toolName: 'set_transcription_text',
        isDestructive: () => false,
      }),
    ).toBe(false);
    expect(
      shouldRetryToolCallExecutorThrow({
        enabled: true,
        attemptIndex: 0,
        toolName: 'delete_transcription_segment',
        isDestructive: () => true,
      }),
    ).toBe(false);
    expect(
      shouldRetryToolCallExecutorThrow({
        enabled: false,
        attemptIndex: 0,
        toolName: 'set_transcription_text',
        isDestructive: () => false,
      }),
    ).toBe(false);
  });
});
