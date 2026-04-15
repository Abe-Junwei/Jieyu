import type { AiChatProviderKind } from '../providers/providerCatalog';

const DEFAULT_CONTEXT_LIMIT_TOKENS = 16_000;
const MAX_USABLE_INPUT_TOKENS = 64_000;
const RESERVED_OUTPUT_RATIO = 0.3;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MIN_CONTEXT_CHARS = 1200;
const MIN_HISTORY_CHARS = 6000;
/** Upper bound for [CONTEXT] block sizing from usable input tokens (chars ≈ tokens × 4). */
const MAX_CONTEXT_CHARS_FROM_USABLE_CAP = 100_000;

const BUILTIN_PROVIDER_CONTEXT_LIMITS: Record<string, number> = {
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 64_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'claude-sonnet': 200_000,
  'claude-3-5-sonnet-latest': 200_000,
  'qwen-plus': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  deepseek: 64_000,
  gemini: 1_000_000,
  anthropic: 200_000,
  qwen: 128_000,
  'openai-compatible': 128_000,
  minimax: 128_000,
  ollama: 16_000,
  webllm: 16_000,
  mock: 16_000,
};

export interface ContextBudgetTokens {
  totalContextTokens: number;
  usableInputTokens: number;
  systemBudgetTokens: number;
  historyBudgetTokens: number;
  toolResultBudgetTokens: number;
}

export interface ContextCharBudgets extends ContextBudgetTokens {
  maxContextChars: number;
  historyCharBudget: number;
  /**
   * Soft floor for tier-1 [CONTEXT] fields when trimming `worldModelSnapshot`
   * (Phase 14 — prefer keeping grounding before tier-2 expansion).
   */
  tier1ContextFloorChars: number;
  /** Max chars for `sessionMemoryDigest` injected into ShortTerm (tier 2). */
  sessionMemoryDigestMaxChars: number;
  /** Max chars for `buildConversationSummaryFromHistory` on each summary pass. */
  conversationSummaryMaxChars: number;
}

let limitsCache: Record<string, number> | null = null;
let loadPromise: Promise<Record<string, number>> | null = null;

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeProviderLimits(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const next: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) continue;
    next[normalizeKey(rawKey)] = Math.floor(rawValue);
  }
  return next;
}

function resolveContextLimitTokens(
  providerKind: string,
  model: string,
  limits: Record<string, number>,
): number {
  const modelKey = normalizeKey(model);
  const providerKey = normalizeKey(providerKind);
  if (modelKey && limits[modelKey] !== undefined) return limits[modelKey]!;

  const scopedModelKey = `${providerKey}:${modelKey}`;
  if (modelKey && limits[scopedModelKey] !== undefined) return limits[scopedModelKey]!;

  if (limits[providerKey] !== undefined) return limits[providerKey]!;
  return DEFAULT_CONTEXT_LIMIT_TOKENS;
}

function tokensToChars(tokenBudget: number): number {
  return Math.max(0, Math.floor(tokenBudget * CHARS_PER_TOKEN_ESTIMATE));
}

/** Tier-1 context floor: clamped fraction of the context block cap. */
export function computeTier1ContextFloorChars(maxContextChars: number): number {
  const raw = Math.floor(maxContextChars * 0.38);
  return Math.min(3600, Math.max(480, raw));
}

export function computeSessionMemoryDigestMaxChars(maxContextChars: number): number {
  const raw = Math.floor(maxContextChars * 0.2);
  return Math.min(2400, Math.max(160, raw));
}

export function computeConversationSummaryMaxChars(historyCharBudget: number): number {
  const raw = Math.floor(historyCharBudget * 0.3);
  return Math.min(4000, Math.max(280, raw));
}

export function computeContextBudget(
  providerKind: string,
  model: string,
  limits: Record<string, number>,
): ContextBudgetTokens {
  const totalContextTokens = resolveContextLimitTokens(providerKind, model, limits);
  const usableInputTokens = Math.max(
    0,
    Math.floor(Math.min(totalContextTokens * (1 - RESERVED_OUTPUT_RATIO), MAX_USABLE_INPUT_TOKENS)),
  );

  return {
    totalContextTokens,
    usableInputTokens,
    systemBudgetTokens: Math.floor(Math.min(2000, (usableInputTokens * 15) / 100)),
    historyBudgetTokens: Math.floor(Math.min((usableInputTokens * 50) / 100, 32_000)),
    toolResultBudgetTokens: Math.floor(Math.min((usableInputTokens * 35) / 100, 24_000)),
  };
}

export async function loadProviderContextLimits(): Promise<Record<string, number>> {
  if (limitsCache) return limitsCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const mergedLimits: Record<string, number> = { ...BUILTIN_PROVIDER_CONTEXT_LIMITS };
    try {
      if (typeof fetch === 'function') {
        try {
          const response = await fetch('/data/provider-context-limits.json');
          if (response.ok) {
            Object.assign(mergedLimits, normalizeProviderLimits(await response.json()));
          }
        } catch {
          // Ignore config fetch failures and keep builtin fallback limits.
        }
      }
      limitsCache = mergedLimits;
      return mergedLimits;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function resolveContextCharBudgets(input: {
  providerKind: AiChatProviderKind;
  model: string;
  maxContextCharsOverride?: number;
  historyCharBudgetOverride?: number;
}): Promise<ContextCharBudgets> {
  const limits = await loadProviderContextLimits();
  const tokenBudget = computeContextBudget(input.providerKind, input.model, limits);

  const derivedMaxContextChars = Math.max(
    MIN_CONTEXT_CHARS,
    Math.min(MAX_CONTEXT_CHARS_FROM_USABLE_CAP, tokensToChars(tokenBudget.usableInputTokens)),
  );
  const maxContextChars = input.maxContextCharsOverride ?? derivedMaxContextChars;
  const historyCharBudget = input.historyCharBudgetOverride
    ?? Math.max(MIN_HISTORY_CHARS, tokensToChars(tokenBudget.historyBudgetTokens));

  return {
    ...tokenBudget,
    maxContextChars,
    historyCharBudget,
    tier1ContextFloorChars: computeTier1ContextFloorChars(maxContextChars),
    sessionMemoryDigestMaxChars: computeSessionMemoryDigestMaxChars(maxContextChars),
    conversationSummaryMaxChars: computeConversationSummaryMaxChars(historyCharBudget),
  };
}

export function resetProviderContextLimitsCacheForTests(): void {
  limitsCache = null;
  loadPromise = null;
}
