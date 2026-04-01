export function formatAiChatDisabledError(): string {
  return 'AI Chat \u529f\u80fd\u672a\u542f\u7528';
}

export function formatHistoryLoadFailedFallbackError(): string {
  return '\u52a0\u8f7d\u5386\u53f2\u4f1a\u8bdd\u5931\u8d25';
}

export function formatRecoveredInterruptedMessage(): string {
  return '\u4f1a\u8bdd\u6062\u590d\u65f6\u68c0\u6d4b\u5230\u672a\u5b8c\u6210\u54cd\u5e94\uff0c\u5df2\u6807\u8bb0\u4e3a\u4e2d\u65ad\u3002';
}

export function formatNoExecutorToolFailureDetail(): string {
  return '\u5f53\u524d\u8fd8\u6ca1\u6709\u63a5\u5165\u5bf9\u5e94\u7684\u52a8\u4f5c\u6267\u884c\u5668\u3002';
}

export function formatNoExecutorInternalError(): string {
  return '\u5f53\u524d\u672a\u63a5\u5165\u52a8\u4f5c\u6267\u884c\u5668\u3002';
}

export function formatToolExecutionFallbackError(): string {
  return '\u5de5\u5177\u6267\u884c\u5931\u8d25';
}

export function formatDuplicateRequestIgnoredDetail(): string {
  return '\u91cd\u590d\u7684\u5de5\u5177\u8c03\u7528\u5df2\u88ab\u5ffd\u7565\uff08\u5e42\u7b49\u4fdd\u62a4\uff09';
}

export function formatDuplicateRequestIgnoredError(): string {
  return '\u91cd\u590d\u7684\u5de5\u5177\u8c03\u7528\u5df2\u88ab\u5ffd\u7565';
}

export function formatInvalidArgsError(detail: string): string {
  return `\u53c2\u6570\u6821\u9a8c\u5931\u8d25\uff1a${detail}`;
}
