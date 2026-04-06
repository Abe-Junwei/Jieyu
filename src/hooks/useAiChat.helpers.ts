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

// ── JSON Parsing ───────────────────────────────────────────────────────────────

/**
 * 从文本中提取平衡的 JSON 对象数组
 * 用于解析 tool_call JSON 块
 */
export function extractBalancedJsonObjects(rawText: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;

  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i];
    // 跳过字符串内部的花括号 | Skip braces inside JSON string literals
    if (char === '"' && (i === 0 || rawText[i - 1] !== '\\')) {
      if (depth > 0) inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        results.push(rawText.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

// ── Base64 Encoding ─────────────────────────────────────────────────────────────

export function byteArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToByteArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Text Processing ────────────────────────────────────────────────────────────

export function trimTextToMax(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, Math.max(0, maxChars - 3)) + '...';
}

export function compressMessageContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;

  // Try to find a good break point
  const truncated = content.slice(0, maxLen);
  const lastNewline = truncated.lastIndexOf('\n');
  const lastSpace = truncated.lastIndexOf(' ');

  const breakPoint = lastNewline > maxLen * 0.8
    ? lastNewline
    : lastSpace > maxLen * 0.8
      ? lastSpace
      : maxLen;

  return content.slice(0, breakPoint) + '\n[...truncated...]';
}

// ── Destructive Tool Detection ─────────────────────────────────────────────────

export function isDestructiveToolCall(name: string): boolean {
  return name === 'delete_transcription_segment'
    || name === 'delete_layer'
    || name === 'merge_transcription_segments'
    || name === 'clear_translation_segment';
}
