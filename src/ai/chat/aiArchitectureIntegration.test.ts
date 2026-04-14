/**
 * AI 问答架构统一改进方案 — 端到端集成验证 | AI Architecture Improvement — E2E Integration Tests
 *
 * 覆盖：Agent Loop 多步推理、动态上下文预算、摘要触发与钉住、本地工具链路、WebLLM 路径
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgentLoopContinuationInput,
  DEFAULT_AGENT_LOOP_CONFIG,
  estimateRemainingLoopTokens,
  shouldContinueAgentLoop,
  shouldWarnTokenBudget,
} from './agentLoop';
import {
  computeContextBudget,
  resetProviderContextLimitsCacheForTests,
  resolveContextCharBudgets,
} from './contextBudget';
import {
  buildConversationSummaryFromHistory,
  countHistoryUserTurns,
  estimateSummaryCoverageSimilarity,
  splitHistoryByRecentRounds,
  trimHistoryByChars,
  type HistoryChatMessage,
} from './historyTrim';
import {
  executeLocalContextToolCall,
  parseLocalContextToolCallFromText,
  parseLocalContextToolCallsFromText,
  type LocalContextToolCall,
} from './localContextTools';
import {
  setSessionMemoryMessagePinned,
  updateConversationSummaryMemory,
} from './sessionMemory';
import type { AiPromptContext } from './chatDomain.types';

// ───────────────────────────────────────────────────────────────────────────────
// 1. Agent Loop 多步推理 — 边界场景 | Agent Loop multi-step edge cases
// ───────────────────────────────────────────────────────────────────────────────

describe('Agent Loop multi-step integration', () => {
  it('stops on mixed ok/failed results within a batch', () => {
    const mixed = [
      { ok: true, name: 'get_project_stats' as const, result: { segments: 42 } },
      { ok: false, name: 'get_utterance_detail' as const, result: null, error: 'utteranceId is required' },
    ];
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, mixed)).toBe(false);
  });

  it('stops when results array is empty (LLM returned plain text)', () => {
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, [])).toBe(false);
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, undefined)).toBe(false);
  });

  it('estimates token budget correctly at boundary step', () => {
    // step=5, maxSteps=6 → 1 remaining step
    const tokens = estimateRemainingLoopTokens(4000, 5, DEFAULT_AGENT_LOOP_CONFIG);
    expect(tokens).toBe(4000);
    expect(shouldWarnTokenBudget(tokens, DEFAULT_AGENT_LOOP_CONFIG)).toBe(false);

    // step=1, maxSteps=6 → 5 remaining steps × 3000 = 15000 → warns
    const highTokens = estimateRemainingLoopTokens(3000, 1, DEFAULT_AGENT_LOOP_CONFIG);
    expect(highTokens).toBe(15000);
    expect(shouldWarnTokenBudget(highTokens, DEFAULT_AGENT_LOOP_CONFIG)).toBe(true);
  });

  it('continuation prompt preserves original user request across steps', () => {
    const prompt = buildAgentLoopContinuationInput(
      '请给所有低置信度句段标注拼音',
      [{ ok: true, name: 'search_utterances', result: { count: 5, matches: [{id: 's1'}] } }],
      3,
    );
    expect(prompt).toContain('请给所有低置信度句段标注拼音');
    expect(prompt).toContain('"step":3');
    expect(prompt).toContain('search_utterances');
  });

  it('step at exactly maxSteps does not continue', () => {
    expect(shouldContinueAgentLoop(6, DEFAULT_AGENT_LOOP_CONFIG, [
      { ok: true, name: 'get_current_selection', result: {} },
    ])).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. 动态上下文预算 — 跨 Provider 验证 | Dynamic context budget across providers
// ───────────────────────────────────────────────────────────────────────────────

describe('Dynamic context budget cross-provider', () => {
  afterEach(() => {
    resetProviderContextLimitsCacheForTests();
    vi.restoreAllMocks();
  });

  it('allocates vastly different budgets for small vs large models', () => {
    const small = computeContextBudget('ollama', 'llama-3', { ollama: 16_000 });
    const large = computeContextBudget('gemini', 'gemini-2.0-flash', { 'gemini-2.0-flash': 1_000_000 });

    // 小模型 history 预算远小于大模型 | Small model has much smaller history budget
    expect(large.historyBudgetTokens).toBeGreaterThan(small.historyBudgetTokens * 3);
    // 大模型 usable 被 cap 到 64K | Large model capped at 64K usable
    expect(large.usableInputTokens).toBe(64_000);
    expect(small.usableInputTokens).toBeLessThan(16_000);
  });

  it('resolves char budgets end-to-end with fetch fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
    })));

    const budgets = await resolveContextCharBudgets({
      providerKind: 'deepseek',
      model: 'deepseek-chat',
    });

    // 应该从 builtin 取到 64000 tokens | Should use builtin 64000 tokens
    expect(budgets.totalContextTokens).toBe(64_000);
    expect(budgets.historyCharBudget).toBeGreaterThan(6_000);
    expect(budgets.maxContextChars).toBeGreaterThan(1_200);
  });

  it('webllm gets conservative 16K budget', () => {
    const budget = computeContextBudget('webllm', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', { webllm: 16_000 });
    expect(budget.totalContextTokens).toBe(16_000);
    expect(budget.historyBudgetTokens).toBeLessThanOrEqual(6_000);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. 摘要触发与钉住保留 — 长对话模拟 | Summary trigger + pin retention in long conversation
// ───────────────────────────────────────────────────────────────────────────────

describe('Summary + pin retention in long conversation', () => {
  function buildLongHistory(turns: number): HistoryChatMessage[] {
    const history: HistoryChatMessage[] = [];
    for (let i = 1; i <= turns; i++) {
      history.push(
        { role: 'user', content: `用户第 ${i} 轮提问关于语音分析`, messageId: `u-${i}` },
        { role: 'assistant', content: `助手第 ${i} 轮回复：F0 范围正常`, messageId: `a-${i}` },
      );
    }
    return history;
  }

  it('triggers summary compression after enough older turns accumulate', () => {
    const history = buildLongHistory(8);
    const { olderMessages, recentMessages } = splitHistoryByRecentRounds(history, 3);

    // 8 轮 - 3 轮最近 = 5 轮较早，应触发摘要 | 8 turns - 3 recent = 5 older, should trigger
    expect(countHistoryUserTurns(olderMessages)).toBeGreaterThanOrEqual(5);
    expect(recentMessages.length).toBe(6); // 3 轮 × 2 条

    const summary = buildConversationSummaryFromHistory(olderMessages, 400);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(400);
  });

  it('pinned messages survive trimming even with tight budget', () => {
    const history = buildLongHistory(6);
    // 钉住第 2 轮 | Pin turn 2
    history[2]!.pinned = true;
    history[3]!.pinned = true;

    // 极紧预算：只够最后 1 轮 + pinned | Very tight: only fits last 1 round + pinned
    const trimmed = trimHistoryByChars(history, 250, 1, '概要：用户持续询问 F0 分析');
    const contents = trimmed.map((m) => m.content);

    // 摘要注入 | Summary injected
    expect(contents[0]).toContain('Conversation summary:');
    // 钉住的第 2 轮保留 | Pinned turn 2 retained
    expect(trimmed.some((m) => m.content.includes('第 2 轮'))).toBe(true);
    // 最后 1 轮保留 | Last turn retained
    expect(trimmed.some((m) => m.content.includes('第 6 轮'))).toBe(true);
  });

  it('summary quality warning fires on low-similarity summary', () => {
    const memory = updateConversationSummaryMemory({}, '天气预报今日晴', 5, {
      similarityScore: 0.3,
      qualityWarningThreshold: 0.85,
    });

    expect(memory.summaryQualityWarning).toBeDefined();
    expect(memory.summaryQualityWarning!.similarity).toBe(0.3);
    expect(memory.summaryQualityWarning!.threshold).toBe(0.85);
  });

  it('high-quality summary does not trigger warning', () => {
    const memory = updateConversationSummaryMemory({}, '用户持续关注句段质量', 5, {
      similarityScore: 0.92,
      qualityWarningThreshold: 0.85,
    });

    expect(memory.summaryQualityWarning).toBeUndefined();
  });

  it('summary chain accumulates and caps at 24 entries', () => {
    let memory = {};
    for (let i = 1; i <= 30; i++) {
      memory = updateConversationSummaryMemory(memory, `摘要第 ${i} 轮`, i);
    }
    const chain = (memory as { summaryChain?: unknown[] }).summaryChain;
    expect(chain).toBeDefined();
    expect(chain!.length).toBeLessThanOrEqual(24);
  });

  it('unpin + re-pin round-trips correctly', () => {
    let mem = setSessionMemoryMessagePinned({}, 'msg-1', true);
    mem = setSessionMemoryMessagePinned(mem, 'msg-2', true);
    mem = setSessionMemoryMessagePinned(mem, 'msg-1', false);
    mem = setSessionMemoryMessagePinned(mem, 'msg-1', true);
    expect(mem.pinnedMessageIds).toEqual(['msg-2', 'msg-1']);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. 本地工具调用链路 — 实战场景 | Local context tool call chain — real scenarios
// ───────────────────────────────────────────────────────────────────────────────

describe('Local context tool execution chain', () => {
  const mockContext: AiPromptContext = {
    shortTerm: {
      selectedUnitIds: ['seg-1'],
      selectionTimeRange: '0:00-0:03',
      selectedText: '你好世界',
    },
    longTerm: {
      projectStats: { utteranceCount: 42, translationLayerCount: 2, aiConfidenceAvg: 0.85 },
      waveformAnalysis: { lowConfidenceCount: 3, overlapCount: 1, gapCount: 0 },
      acousticSummary: { f0Range: '80-320 Hz', intensityRange: '45-78 dB' },
    },
  };

  it('get_current_selection returns short-term context', async () => {
    const call: LocalContextToolCall = { name: 'get_current_selection', arguments: {} };
    const result = await executeLocalContextToolCall(call, mockContext, { current: 0 });
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({
      ...mockContext.shortTerm,
      projectUnitCount: mockContext.longTerm!.projectStats!.utteranceCount,
      projectUtteranceCount: mockContext.longTerm!.projectStats!.utteranceCount,
    });
  });

  it('get_project_stats returns long-term stats', async () => {
    const call: LocalContextToolCall = { name: 'get_project_stats', arguments: {} };
    const result = await executeLocalContextToolCall(call, mockContext, { current: 0 });
    expect(result.ok).toBe(true);
    expect((result.result as { utteranceCount: number }).utteranceCount).toBe(42);
  });

  it('get_acoustic_summary returns acoustic data', async () => {
    const call: LocalContextToolCall = { name: 'get_acoustic_summary', arguments: {} };
    const result = await executeLocalContextToolCall(call, mockContext, { current: 0 });
    expect(result.ok).toBe(true);
    expect((result.result as { f0Range: string }).f0Range).toContain('Hz');
  });

  it('respects rate limit of 20 calls', async () => {
    const counter = { current: 19 };
    const call: LocalContextToolCall = { name: 'get_project_stats', arguments: {} };

    const last = await executeLocalContextToolCall(call, mockContext, counter);
    expect(last.ok).toBe(true);
    expect(counter.current).toBe(20);

    const over = await executeLocalContextToolCall(call, mockContext, counter);
    expect(over.ok).toBe(false);
    expect(over.error).toContain('limit exceeded');
  });

  it('fails gracefully when context is null', async () => {
    const call: LocalContextToolCall = { name: 'get_current_selection', arguments: {} };
    const result = await executeLocalContextToolCall(call, null, { current: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unavailable');
  });

  it('parses tool call embedded in markdown-fenced LLM output', () => {
    const llmOutput = `我来帮你查看当前选区信息。

\`\`\`json
{"tool_call": {"name": "get_current_selection", "arguments": {}}}
\`\`\``;

    const parsed = parseLocalContextToolCallFromText(llmOutput);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('get_current_selection');
  });

  it('parses batch tool_calls from LLM multi-tool response', () => {
    const llmOutput = JSON.stringify({
      tool_calls: [
        { name: 'get_project_stats', arguments: {} },
        { name: 'get_waveform_analysis', arguments: {} },
        { name: 'get_acoustic_summary', arguments: {} },
      ],
    });

    const parsed = parseLocalContextToolCallsFromText(llmOutput);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.name)).toEqual([
      'get_project_stats',
      'get_waveform_analysis',
      'get_acoustic_summary',
    ]);
  });

  it('rejects unknown tool names silently', () => {
    const llmOutput = '{"tool_call": {"name": "drop_database", "arguments": {}}}';
    const parsed = parseLocalContextToolCallFromText(llmOutput);
    expect(parsed).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Agent Loop + 本地工具 + 摘要 组合流 | Combined flow: loop + tools + summary
// ───────────────────────────────────────────────────────────────────────────────

describe('Combined Agent Loop + local tools + summary flow', () => {
  it('simulates a 3-step search-then-detail-then-answer flow', async () => {
    const context: AiPromptContext = {
      shortTerm: { selectedUnitIds: ['seg-1'] },
      longTerm: { projectStats: { utteranceCount: 10 } },
    };
    const callCounter = { current: 0 };

    // Step 1: LLM asks for project stats
    const step1 = await executeLocalContextToolCall(
      { name: 'get_project_stats', arguments: {} },
      context,
      callCounter,
    );
    expect(step1.ok).toBe(true);
    expect(shouldContinueAgentLoop(1, DEFAULT_AGENT_LOOP_CONFIG, [step1])).toBe(true);

    // Step 2: LLM asks for acoustic
    const step2 = await executeLocalContextToolCall(
      { name: 'get_current_selection', arguments: {} },
      context,
      callCounter,
    );
    expect(step2.ok).toBe(true);
    const continuation = buildAgentLoopContinuationInput('分析当前句段', [step1, step2], 2);
    expect(continuation).toContain('get_project_stats');
    expect(continuation).toContain('get_current_selection');

    // Step 3: LLM gives final answer → no more tool calls → loop stops
    expect(shouldContinueAgentLoop(3, DEFAULT_AGENT_LOOP_CONFIG, [])).toBe(false);

    // Summary could be triggered after this conversation
    const history: HistoryChatMessage[] = [
      { role: 'user', content: '分析当前句段' },
      { role: 'assistant', content: '句段信息：10 个总段' },
      { role: 'user', content: '继续详细分析' },
      { role: 'assistant', content: '选区包含 seg-1' },
      { role: 'user', content: '给出结论' },
      { role: 'assistant', content: '结论：数据正常' },
    ];
    const { olderMessages } = splitHistoryByRecentRounds(history, 2);
    const summary = buildConversationSummaryFromHistory(olderMessages, 300);
    const similarity = estimateSummaryCoverageSimilarity(olderMessages, summary);
    expect(similarity).toBeGreaterThan(0);
  });
});
