import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeContextBudget,
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
  });
});
