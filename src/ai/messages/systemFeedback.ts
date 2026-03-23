export function formatAiChatDisabledError(): string {
  return 'AI Chat 功能未启用';
}

export function formatHistoryLoadFailedFallbackError(): string {
  return '加载历史会话失败';
}

export function formatRecoveredInterruptedMessage(): string {
  return '会话恢复时检测到未完成响应，已标记为中断。';
}

export function formatNoExecutorToolFailureDetail(): string {
  return '当前还没有接入对应的动作执行器。';
}

export function formatNoExecutorInternalError(): string {
  return '当前未接入动作执行器。';
}

export function formatToolExecutionFallbackError(): string {
  return '工具执行失败';
}

export function formatDuplicateRequestIgnoredDetail(): string {
  return '重复的工具调用已被忽略（幂等保护）';
}

export function formatDuplicateRequestIgnoredError(): string {
  return '重复的工具调用已被忽略';
}

export function formatInvalidArgsError(detail: string): string {
  return `参数校验失败：${detail}`;
}