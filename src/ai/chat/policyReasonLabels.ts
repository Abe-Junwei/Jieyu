export type PolicyReasonLocale = 'zh-CN' | 'en-US';

const POLICY_REASON_LABELS_ZH: Record<string, string> = {
  user_directive_never_execute: '\u5df2\u88ab\u7528\u6237\u6307\u4ee4\u7981\u6b62\u81ea\u52a8\u6267\u884c',
  user_directive_deny_destructive: '\u5df2\u88ab\u7528\u6237\u5b89\u5168\u504f\u597d\u963b\u65ad\u9ad8\u98ce\u9669\u7834\u574f\u6027\u64cd\u4f5c',
  user_directive_deny_batch: '\u5df2\u88ab\u7528\u6237\u6307\u4ee4\u963b\u65ad\u6279\u91cf\u5199\u5165\u64cd\u4f5c',
  user_directive_confirmation_required: '\u7528\u6237\u504f\u597d\u8981\u6c42\u5148\u786e\u8ba4\u518d\u6267\u884c',
  propose_changes_requires_confirmation: '\u63d0\u8bae\u53d8\u66f4\u6a21\u5f0f\u8981\u6c42\u4eba\u5de5\u786e\u8ba4\u540e\u6267\u884c',
};

const POLICY_REASON_LABELS_EN: Record<string, string> = {
  user_directive_never_execute: 'Blocked by user directive that forbids auto execution.',
  user_directive_deny_destructive: 'Blocked by user safety preference for destructive actions.',
  user_directive_deny_batch: 'Blocked by user directive against batch write actions.',
  user_directive_confirmation_required: 'User preference requires confirmation before execution.',
  propose_changes_requires_confirmation: 'Proposed-change mode requires human confirmation.',
};

export function resolvePolicyReasonLabel(
  reasonCode: string | undefined,
  locale: PolicyReasonLocale,
): string | undefined {
  const code = (reasonCode ?? '').trim();
  if (!code) return undefined;
  const labels = locale === 'zh-CN' ? POLICY_REASON_LABELS_ZH : POLICY_REASON_LABELS_EN;
  return labels[code];
}

export function formatPolicyReasonLabelWithCode(
  reasonCode: string | undefined,
  locale: PolicyReasonLocale,
): string | undefined {
  const code = (reasonCode ?? '').trim();
  if (!code) return undefined;
  const label = resolvePolicyReasonLabel(code, locale);
  return label ? `${label} (${code})` : code;
}
