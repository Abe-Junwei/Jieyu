/**
 * useAiChat - Configuration & Constants Module
 * 存储键、指标默认值、agent-loop 预算、超时与 dev 读取等。
 * 聊天 system prompt / persona 的唯一来源：src/ai/chat/promptContext.ts（buildAiSystemPrompt）。
 */

// ── Storage Keys ───────────────────────────────────────────────────────────────

export const AI_CHAT_SETTINGS_STORAGE_KEY = 'jieyu.aiChat.settings';
export const AI_CHAT_SETTINGS_SECURE_STORAGE_KEY = 'jieyu.aiChat.settings.secure';
export const AI_CHAT_SETTINGS_SECURE_VERSION = 'v1';
export const AI_CHAT_STREAM_PERSIST_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.streamPersistIntervalMs';
export const AI_CHAT_AUTO_PROBE_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.autoProbeIntervalMs';
export const AI_CHAT_RAG_CONTEXT_TIMEOUT_STORAGE_KEY = 'jieyu.aiChat.ragContextTimeoutMs';
export const AI_CHAT_SESSION_TOKEN_BUDGET_STORAGE_KEY = 'jieyu.aiChat.sessionTokenBudget';
export const AI_CHAT_OUTPUT_TOKEN_CAP_STORAGE_KEY = 'jieyu.aiChat.outputTokenCap';
export const AI_CHAT_OUTPUT_TOKEN_RETRY_CAP_STORAGE_KEY = 'jieyu.aiChat.outputTokenRetryCap';
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

export const DEFAULT_SESSION_TOKEN_BUDGET = 12_000;
export const DEFAULT_OUTPUT_TOKEN_CAP = 480;
export const DEFAULT_OUTPUT_TOKEN_RETRY_CAP = 960;

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

export function normalizeSessionTokenBudget(input: number | undefined): number {
  if (!Number.isFinite(input)) return DEFAULT_SESSION_TOKEN_BUDGET;
  return Math.min(200_000, Math.max(1000, Math.floor(input ?? DEFAULT_SESSION_TOKEN_BUDGET)));
}

export function normalizeOutputTokenCap(input: number | undefined, fallback: number): number {
  if (!Number.isFinite(input)) return fallback;
  return Math.min(16_000, Math.max(64, Math.floor(input ?? fallback)));
}

export function normalizeOutputTokenRetryCap(input: number | undefined, outputTokenCap: number): number {
  if (!Number.isFinite(input)) {
    return Math.max(outputTokenCap + 64, DEFAULT_OUTPUT_TOKEN_RETRY_CAP);
  }
  return Math.min(24_000, Math.max(outputTokenCap + 1, Math.floor(input ?? DEFAULT_OUTPUT_TOKEN_RETRY_CAP)));
}

export function estimateTokensFromText(content: string): number {
  return Math.max(1, Math.ceil(content.trim().length / 4));
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

export function readDevSessionTokenBudget(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_SESSION_TOKEN_BUDGET__?: unknown }).__JIEYU_AI_SESSION_TOKEN_BUDGET__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_SESSION_TOKEN_BUDGET_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readDevOutputTokenCap(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_OUTPUT_TOKEN_CAP__?: unknown }).__JIEYU_AI_OUTPUT_TOKEN_CAP__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_OUTPUT_TOKEN_CAP_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readDevOutputTokenRetryCap(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_OUTPUT_TOKEN_RETRY_CAP__?: unknown }).__JIEYU_AI_OUTPUT_TOKEN_RETRY_CAP__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_OUTPUT_TOKEN_RETRY_CAP_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}
