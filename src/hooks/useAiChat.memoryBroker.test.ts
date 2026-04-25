import { describe, expect, it } from 'vitest';
import { maybeAppendMemoryBrokerContext } from './useAiChat.memoryBroker';

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
});
