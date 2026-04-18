/**
 * useAiChat - Configuration & Constants Module
 * 提取自 useAiChat.ts 的配置常量和系统提示词
 */

import type { AiSystemPersonaKey } from './useAiChat.types';

// ── Storage Keys ───────────────────────────────────────────────────────────────

export const AI_CHAT_SETTINGS_STORAGE_KEY = 'jieyu.aiChat.settings';
export const AI_CHAT_SETTINGS_SECURE_STORAGE_KEY = 'jieyu.aiChat.settings.secure';
export const AI_CHAT_SETTINGS_SECURE_VERSION = 'v1';
export const AI_CHAT_STREAM_PERSIST_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.streamPersistIntervalMs';
export const AI_CHAT_AUTO_PROBE_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.autoProbeIntervalMs';
export const AI_CHAT_RAG_CONTEXT_TIMEOUT_STORAGE_KEY = 'jieyu.aiChat.ragContextTimeoutMs';
export const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';

// ── Defaults ───────────────────────────────────────────────────────────────────

export const INITIAL_METRICS: AiInteractionMetrics = {
  turnCount: 0,
  successCount: 0,
  failureCount: 0,
  clarifyCount: 0,
  explainFallbackCount: 0,
  cancelCount: 0,
  recoveryCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  currentTurnTokens: 0,
  totalInputTokensAvailable: false,
  totalOutputTokensAvailable: false,
  currentTurnTokensAvailable: false,
};

export const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 25000;

// ── Local tool channel & agent loop continuation budgets ───────────────────────
// Single source of truth for Phase C / agent-loop payload shaping (see localContextTools).

/** Max characters for formatted local tool JSON (single tool, batch, and agent-loop `tool_result_payload`). */
export const AI_LOCAL_TOOL_RESULT_CHAR_BUDGET = 8000;

/** Max characters of user text embedded as `originalUserRequest` inside agent-loop continuation JSON. */
export const AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS = 3000;

/** When shrinking agent-loop payloads, cap each `matches[].transcription` preview at this length. */
export const AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS = 480;

/** Upper bound on shrink iterations (truncate + pop cycles) to avoid pathological loops. */
export const AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS = 8000;

/** Deep string trim limits when match-level shrinking is insufficient (two passes, descending). */
export const AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1 = 240;
export const AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2 = 120;

// ── System Prompts ────────────────────────────────────────────────────────────

export const AI_FUNCTION_CALLING_SYSTEM_PROMPT = `You are a helpful AI assistant with access to transcription editing tools.

When the user asks you to make edits to the transcription, you should respond with a JSON tool call.
The tool call should have this structure:
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { ... }
  }
}

Available tools:
- create_transcription_segment: Create a new segment after a target segment
- split_transcription_segment: Split an existing target segment at a position
- delete_transcription_segment: Delete a segment
- clear_translation_segment: Clear translation text
- set_transcription_text: Set the text of a transcription segment
- set_translation_text: Set the translation text
- create_transcription_layer: Create a new transcription layer
- create_translation_layer: Create a translation layer
- delete_layer: Delete a layer
- link_translation_layer: Link a translation layer
- unlink_translation_layer: Unlink a translation layer
- auto_gloss_unit: Auto-generate gloss for a segment
- set_token_pos: Set POS tag for a token
- set_token_gloss: Set gloss for a token

IMPORTANT: Always use the tool calls when the user wants to make edits.`;

export const AI_SYSTEM_PERSONAS: Record<AiSystemPersonaKey, string> = {
  transcription: `You are a helpful AI assistant specialized in language documentation and transcription.
You help users edit and annotate transcriptions, manage speakers, and maintain translation layers.
Be precise and follow the user's instructions exactly.`,
  glossing: `You are a helpful AI assistant specialized in interlinear glossing (ELAN/EZH).
You help users add morpheme-level annotations, POS tags, and glosses to transcription segments.
Follow Leipzig Glossing Rules when applicable.`,
  review: `You are a helpful AI assistant specialized in reviewing transcription quality.
You help users identify inconsistencies, check speaker labels, and verify translations.
Be thorough and provide constructive feedback.`,
};

// ── Helper Types ──────────────────────────────────────────────────────────────

interface AiInteractionMetrics {
  turnCount: number;
  successCount: number;
  failureCount: number;
  clarifyCount: number;
  explainFallbackCount: number;
  cancelCount: number;
  recoveryCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  currentTurnTokens: number;
  totalInputTokensAvailable?: boolean;
  totalOutputTokensAvailable?: boolean;
  currentTurnTokensAvailable?: boolean;
}

// Note: Message formatters are in ../ai/messages - import from there
// This config file only contains storage keys and normalization utilities

// ── Normalization Functions ────────────────────────────────────────────────────

export function normalizeStreamPersistInterval(input: number | undefined): number {
  if (!Number.isFinite(input)) return 120;
  return Math.min(1000, Math.max(16, Math.floor(input ?? 120)));
}

export function normalizeFirstChunkTimeoutMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return DEFAULT_FIRST_CHUNK_TIMEOUT_MS;
  return Math.min(120000, Math.max(1000, Math.floor(input ?? DEFAULT_FIRST_CHUNK_TIMEOUT_MS)));
}

export function normalizeAutoProbeIntervalMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return 8000;
  return Math.min(60000, Math.max(3000, Math.floor(input ?? 8000)));
}

export function normalizeRagContextTimeoutMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return 1800;
  return Math.min(10000, Math.max(300, Math.floor(input ?? 1800)));
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ── Dev-Only Helpers ──────────────────────────────────────────────────────────

export function readDevStreamPersistIntervalMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_STREAM_PERSIST_MS__?: unknown }).__JIEYU_AI_STREAM_PERSIST_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_STREAM_PERSIST_INTERVAL_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readDevAutoProbeIntervalMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_AUTO_PROBE_MS__?: unknown }).__JIEYU_AI_AUTO_PROBE_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_AUTO_PROBE_INTERVAL_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readDevRagContextTimeoutMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_RAG_TIMEOUT_MS__?: unknown }).__JIEYU_AI_RAG_TIMEOUT_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_RAG_CONTEXT_TIMEOUT_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}
