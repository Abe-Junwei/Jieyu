import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeContextBudget,
  computeConversationSummaryMaxChars,
  computeSessionMemoryDigestMaxChars,
  computeTier1ContextFloorChars,
  loadProviderContextLimits,
  resetProviderContextLimitsCacheForTests,
  resolveContextCharBudgets,
} from './contextBudget';

describe('contextBudget', () => {
  afterEach(() => {
    resetProviderContextLimitsCacheForTests();
    vi.restoreAllMocks();
  });

  it('computes high-cap provider budgets with safety cap', () => {
    const budget = computeContextBudget('gemini', 'gemini-2.0-flash', {
      'gemini-2.0-flash': 1_000_000,
    });

    expect(budget.totalContextTokens).toBe(1_000_000);
    expect(budget.usableInputTokens).toBe(64_000);
    expect(budget.systemBudgetTokens).toBe(2000);
    expect(budget.historyBudgetTokens).toBe(32_000);
    expect(budget.toolResultBudgetTokens).toBe(22_400);
  });

  it('falls back to default window for unknown provider/model', () => {
    const budget = computeContextBudget('unknown-provider', 'unknown-model', {});

    expect(budget.totalContextTokens).toBe(16_000);
    expect(budget.usableInputTokens).toBe(11_200);
    expect(budget.systemBudgetTokens).toBe(1680);
    expect(budget.historyBudgetTokens).toBe(5600);
    expect(budget.toolResultBudgetTokens).toBe(3920);
  });

  it('loads provider limits from runtime JSON and merges fallback defaults', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        'deepseek-chat': 32_000,
      }),
    })));

    const limits = await loadProviderContextLimits();

    expect(limits['deepseek-chat']).toBe(32_000);
    expect(limits.gemini).toBe(1_000_000);
  });

  it('keeps explicit char overrides higher priority than dynamic budgets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        'deepseek-chat': 64_000,
      }),
    })));

    const budgets = await resolveContextCharBudgets({
      providerKind: 'deepseek',
      model: 'deepseek-chat',
      maxContextCharsOverride: 3333,
      historyCharBudgetOverride: 7777,
    });

    expect(budgets.maxContextChars).toBe(3333);
    expect(budgets.historyCharBudget).toBe(7777);
    expect(budgets.tier1ContextFloorChars).toBe(computeTier1ContextFloorChars(3333));
    expect(budgets.sessionMemoryDigestMaxChars).toBe(computeSessionMemoryDigestMaxChars(3333));
    expect(budgets.conversationSummaryMaxChars).toBe(computeConversationSummaryMaxChars(7777));
  });

  it('exposes Phase-14 tier helpers with sane clamps', () => {
    expect(computeTier1ContextFloorChars(2000)).toBe(760);
    expect(computeSessionMemoryDigestMaxChars(2000)).toBe(400);
    expect(computeConversationSummaryMaxChars(10_000)).toBe(3000);
  });

  it('derives maxContextChars from usable input tokens with a safety cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })));

    const highCap = await resolveContextCharBudgets({
      providerKind: 'gemini',
      model: 'gemini-2.0-flash',
    });
    expect(highCap.usableInputTokens).toBe(64_000);
    expect(highCap.maxContextChars).toBe(100_000);

    const modest = await resolveContextCharBudgets({
      providerKind: 'mock',
      model: '__test-unknown-model__',
    });
    expect(modest.usableInputTokens).toBe(11_200);
    expect(modest.maxContextChars).toBe(44_800);
  });
});
