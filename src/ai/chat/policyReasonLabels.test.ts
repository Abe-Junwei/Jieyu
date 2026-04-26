import { describe, expect, it } from 'vitest';
import { formatPolicyReasonLabelWithCode, resolvePolicyReasonLabel } from './policyReasonLabels';

describe('policyReasonLabels', () => {
  it('resolves known reason labels for zh/en', () => {
    expect(resolvePolicyReasonLabel('user_directive_confirmation_required', 'en-US'))
      .toContain('requires confirmation');
    expect(resolvePolicyReasonLabel('user_directive_confirmation_required', 'zh-CN'))
      .toContain('要求先确认再执行');
  });

  it('formats label with reason code fallback', () => {
    expect(formatPolicyReasonLabelWithCode('user_directive_deny_destructive', 'en-US'))
      .toContain('(user_directive_deny_destructive)');
    expect(formatPolicyReasonLabelWithCode('unknown_reason_code', 'en-US'))
      .toBe('unknown_reason_code');
  });
});
