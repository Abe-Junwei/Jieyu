import { describe, expect, it } from 'vitest';
import { buildSessionMemoryDigestSuppressionRefs, maybeAppendMemoryBrokerContext } from './useAiChat.memoryBroker';

describe('maybeAppendMemoryBrokerContext', () => {
  it('preserves the existing context when the broker flag is disabled', async () => {
    await expect(maybeAppendMemoryBrokerContext({
      enabled: false,
      query: 'gloss',
      contextBlock: '[CONTEXT]',
      tokenBudget: 100,
      sessionMemory: { conversationSummary: 'Should not be injected.' },
    })).resolves.toBe('[CONTEXT]');
  });

  it('appends selected broker memory when enabled', async () => {
    const contextBlock = await maybeAppendMemoryBrokerContext({
      enabled: true,
      query: 'gloss',
      contextBlock: '[CONTEXT]',
      tokenBudget: 100,
      sessionMemory: { conversationSummary: 'Gloss diagnostics are important.' },
    });

    expect(contextBlock).toContain('[CONTEXT]');
    expect(contextBlock).toContain('[MEMORY_BROKER_CONTEXT]');
    expect(contextBlock).toContain('Gloss diagnostics are important.');
  });

  it('does not duplicate session digest summaries through the broker', async () => {
    const contextBlock = await maybeAppendMemoryBrokerContext({
      enabled: true,
      query: 'gloss',
      contextBlock: '[CONTEXT]',
      tokenBudget: 100,
      sessionMemory: {
        conversationSummary: 'Gloss diagnostics are important.',
        summaryChain: [{ id: 's1', summary: 'Use compact answers.', coveredTurnCount: 1, createdAt: '2026-04-25T00:00:00.000Z' }],
      },
      alreadySurfacedRefs: ['session:rolling-summary', 'session:summary:s1'],
    });

    expect(contextBlock).toBe('[CONTEXT]');
  });

  it('caps appended broker context to maxContextChars', async () => {
    const contextBlock = await maybeAppendMemoryBrokerContext({
      enabled: true,
      query: 'gloss',
      contextBlock: '[CONTEXT]',
      tokenBudget: 100,
      maxContextChars: 32,
      sessionMemory: { conversationSummary: 'Gloss diagnostics are important and should be kept short.' },
    });

    expect(contextBlock.length).toBeLessThanOrEqual(32);
  });

  it('builds suppression refs for summaries already included in the digest', () => {
    expect(buildSessionMemoryDigestSuppressionRefs({
      conversationSummary: 'rolling',
      summaryChain: [
        { id: 'old', summary: 'old', coveredTurnCount: 1, createdAt: '2026-04-25T00:00:00.000Z' },
        { id: 's1', summary: 'one', coveredTurnCount: 2, createdAt: '2026-04-25T00:01:00.000Z' },
        { id: 's2', summary: 'two', coveredTurnCount: 3, createdAt: '2026-04-25T00:02:00.000Z' },
      ],
    }, 'rollingSummary=rolling')).toEqual([
      'session:rolling-summary',
      'session:summary:s1',
      'session:summary:s2',
    ]);
  });
});
