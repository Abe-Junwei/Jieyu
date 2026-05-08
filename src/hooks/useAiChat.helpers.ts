/**
 * useAiChat - Pure Helpers Module
 * 提取自 useAiChat.ts 的纯工具函数，不依赖 React 或外部服务
 */

// ── ID Generation ──────────────────────────────────────────────────────────────

let _messageCounter = 0;
let _sessionStartTime = Date.now();

export function newMessageId(prefix: string): string {
  _messageCounter += 1;
  return `${prefix}_${_sessionStartTime}_${_messageCounter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newAuditLogId(): string {
  return `audit_${nowIso()}_${Math.random().toString(36).slice(2, 10)}`;
}
