export type PolicyReasonLocale = 'zh-CN' | 'en-US';

const POLICY_REASON_LABELS_ZH: Record<string, string> = {
  user_directive_never_execute: '已被用户指令禁止自动执行',
  user_directive_deny_destructive: '已被用户安全偏好阻断高风险破坏性操作',
  user_directive_deny_batch: '已被用户指令阻断批量写入操作',
  user_directive_confirmation_required: '用户偏好要求先确认再执行',
  propose_changes_requires_confirmation: '提议变更模式要求人工确认后执行',
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
