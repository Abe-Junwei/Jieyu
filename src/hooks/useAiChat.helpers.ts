/**
 * useAiChat - Pure Helpers Module
 * 提取自 useAiChat.ts 的纯工具函数，不依赖 React 或外部服务
 */

import type { AiChatToolName } from './useAiChat.types';

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

  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i];
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

// ── Tool Name Normalization ────────────────────────────────────────────────────

const TOOL_NAME_ALIASES: Record<string, AiChatToolName> = {
  'create-segment': 'create_transcription_segment',
  'create_transcription': 'create_transcription_segment',
  'split-segment': 'split_transcription_segment',
  'split': 'split_transcription_segment',
  'delete-segment': 'delete_transcription_segment',
  'delete_transcription': 'delete_transcription_segment',
  'delete_text': 'delete_transcription_segment',
  'clear_translation': 'clear_translation_segment',
  'clear': 'clear_translation_segment',
  'set-text': 'set_transcription_text',
  'set_transcription': 'set_transcription_text',
  'set_translation': 'set_translation_text',
  'set_translation_text': 'set_translation_text',
  'create_layer': 'create_transcription_layer',
  'create_transcription_layer': 'create_transcription_layer',
  'create_translation_layer': 'create_translation_layer',
  'delete_layer': 'delete_layer',
  'link_layer': 'link_translation_layer',
  'link': 'link_translation_layer',
  'unlink_layer': 'unlink_translation_layer',
  'unlink': 'unlink_translation_layer',
  'auto_gloss': 'auto_gloss_utterance',
  'gloss': 'auto_gloss_utterance',
  'set_pos': 'set_token_pos',
  'set_pos_tag': 'set_token_pos',
  'set_gloss': 'set_token_gloss',
  'token_gloss': 'set_token_gloss',
};

export function normalizeToolCallName(rawName: string): AiChatToolName | null {
  const normalized = rawName.trim().replace(/\s+/g, '_').toLowerCase();
  if (TOOL_NAME_ALIASES[normalized]) {
    return TOOL_NAME_ALIASES[normalized]!;
  }
  // Direct match
  if (normalized in TOOL_NAME_ALIASES) {
    return TOOL_NAME_ALIASES[normalized]!;
  }
  return null;
}

// ── Language Target Helpers ─────────────────────────────────────────────────────

const AMBIGUOUS_LANGUAGE_TARGET_PATTERN = /^(und|unknown|auto|default)$/i;

export function isAmbiguousLanguageTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return AMBIGUOUS_LANGUAGE_TARGET_PATTERN.test(value);
}

export function requiresConcreteLanguageTarget(callName: AiChatToolName): boolean {
  const requiresLanguage = [
    'set_translation_text',
    'create_translation_layer',
    'auto_gloss_utterance',
  ] as const;
  return (requiresLanguage as readonly string[]).includes(callName);
}

export function getFirstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  return '';
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

export function isDestructiveToolCall(name: AiChatToolName): boolean {
  const destructiveTools: AiChatToolName[] = [
    'delete_transcription_segment',
    'delete_layer',
  ];
  return destructiveTools.includes(name);
}

// ── Tool Call Validation (pure) ─────────────────────────────────────────────────

export const TOOL_ARG_MAX_ID_LENGTH = 128;
export const TOOL_ARG_MAX_TEXT_LENGTH = 5000;

export function validateArgId(
  args: Record<string, unknown>,
  key: string,
  required: boolean,
): string | null {
  const value = args[key];
  if (value === undefined || value === null) {
    return required ? `Missing required: ${key}` : null;
  }
  if (typeof value !== 'string') {
    return `Expected string for ${key}`;
  }
  if (value.length > TOOL_ARG_MAX_ID_LENGTH) {
    return `${key} exceeds max length ${TOOL_ARG_MAX_ID_LENGTH}`;
  }
  if (!/^[\w-]+$/.test(value)) {
    return `${key} contains invalid characters`;
  }
  return null;
}

export function validateArgText(args: Record<string, unknown>): string | null {
  const value = args.text ?? args.content ?? args.translation;
  if (value === undefined || value === null) {
    return null; // Optional
  }
  if (typeof value !== 'string') {
    return 'Text argument must be a string';
  }
  if (value.length > TOOL_ARG_MAX_TEXT_LENGTH) {
    return `Text exceeds max length ${TOOL_ARG_MAX_TEXT_LENGTH}`;
  }
  return null;
}

export function validateSplitSegmentArgs(args: Record<string, unknown>): string | null {
  if (typeof args.segmentId !== 'string') {
    return 'Missing or invalid segmentId';
  }
  if (typeof args.splitPosition !== 'number') {
    if (typeof args.splitPosition !== 'string') {
      return 'Missing or invalid splitPosition';
    }
    const parsed = Number(args.splitPosition);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 'splitPosition must be a non-negative number';
    }
  }
  return validateArgText(args);
}

export function validateDeleteLayerArgs(args: Record<string, unknown>): string | null {
  if (typeof args.layerId !== 'string') {
    return 'Missing or invalid layerId';
  }
  return null;
}
