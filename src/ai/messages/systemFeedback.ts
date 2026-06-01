import type { Locale } from '../../i18n';

function isZhLocale(locale: Locale | undefined): boolean {
  return locale !== 'en-US';
}

export function formatAiChatDisabledError(locale?: Locale): string {
  return isZhLocale(locale) ? 'AI Chat \u529f\u80fd\u672a\u542f\u7528' : 'AI Chat is not enabled';
}

export function formatHistoryLoadFailedFallbackError(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u52a0\u8f7d\u5386\u53f2\u4f1a\u8bdd\u5931\u8d25'
    : 'Failed to load conversation history';
}

export function formatRecoveredInterruptedMessage(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u4f1a\u8bdd\u6062\u590d\u65f6\u68c0\u6d4b\u5230\u672a\u5b8c\u6210\u54cd\u5e94\uff0c\u5df2\u6807\u8bb0\u4e3a\u4e2d\u65ad\u3002'
    : 'An unfinished response was detected during conversation recovery and marked as interrupted.';
}

export function formatNoExecutorToolFailureDetail(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u5f53\u524d\u8fd8\u6ca1\u6709\u63a5\u5165\u5bf9\u5e94\u7684\u52a8\u4f5c\u6267\u884c\u5668\u3002'
    : 'The matching action executor is not connected yet.';
}

export function formatNoExecutorInternalError(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u5f53\u524d\u672a\u63a5\u5165\u52a8\u4f5c\u6267\u884c\u5668\u3002'
    : 'Action executor is not connected.';
}

export function formatToolExecutionFallbackError(locale?: Locale): string {
  return isZhLocale(locale) ? '\u5de5\u5177\u6267\u884c\u5931\u8d25' : 'Tool execution failed';
}

export function formatDuplicateRequestIgnoredDetail(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u91cd\u590d\u7684\u5de5\u5177\u8c03\u7528\u5df2\u88ab\u5ffd\u7565\uff08\u5e42\u7b49\u4fdd\u62a4\uff09'
    : 'Duplicate tool call ignored (idempotency protection)';
}

export function formatDuplicateRequestIgnoredError(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u91cd\u590d\u7684\u5de5\u5177\u8c03\u7528\u5df2\u88ab\u5ffd\u7565'
    : 'Duplicate tool call ignored';
}

export function formatInvalidArgsError(detail: string, locale?: Locale): string {
  return isZhLocale(locale)
    ? `\u53c2\u6570\u6821\u9a8c\u5931\u8d25\uff1a${detail}`
    : `Argument validation failed: ${detail}`;
}
