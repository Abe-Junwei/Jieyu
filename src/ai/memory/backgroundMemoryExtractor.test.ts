import { describe, expect, it, vi } from 'vitest';
import { BackgroundMemoryExtractor, BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION, type BackgroundMemoryExtractionInput } from './backgroundMemoryExtractor';

function baseInput(patch: Partial<BackgroundMemoryExtractionInput> = {}): BackgroundMemoryExtractionInput {
  return {
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
    userText: 'remember this project preference',
    assistantText: 'I will keep it in mind.',
    actorId: 'assistant',
    schemaVersion: BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION,
    ...patch,
  };
}

describe('BackgroundMemoryExtractor', () => {
  it('skips disabled runs without invoking extraction', async () => {
    const extractFacts = vi.fn();
    const extractor = new BackgroundMemoryExtractor({
      enabled: false,
      actorId: 'assistant',
      extractFacts,
      writeFacts: vi.fn(),
      now: () => 1000,
    });

    extractor.schedule(baseInput());
    const audit = await extractor.flush();

    expect(audit?.status).toBe('skipped');
    expect(audit?.skippedReason).toBe('disabled');
    expect(extractFacts).not.toHaveBeenCalled();
  });

  it('skips when the main chain already wrote memory', async () => {
    const extractor = new BackgroundMemoryExtractor({
      enabled: true,
      actorId: 'assistant',
      extractFacts: vi.fn(),
      writeFacts: vi.fn(),
      now: () => 1000,
    });

    extractor.schedule(baseInput({ mainChainMemoryWritten: true }));
    const audit = await extractor.flush();

    expect(audit?.status).toBe('skipped');
    expect(audit?.skippedReason).toBe('main-chain-memory-written');
  });

  it('merges trailing runs before extracting once', async () => {
    const extractFacts = vi.fn(async (input: BackgroundMemoryExtractionInput) => {
      expect(input.userText).toContain('first user text');
      expect(input.userText).toContain('second user text');
      return [{ fact: 'User cares about morphology.', confidence: 0.9 }];
    });
    const writeFacts = vi.fn(async () => 1);
    const extractor = new BackgroundMemoryExtractor({
      enabled: true,
      actorId: 'assistant',
      extractFacts,
      writeFacts,
      now: () => 1000,
    });

    const first = extractor.schedule(baseInput({ assistantMessageId: 'msg-1', userText: 'first user text' }));
    const second = extractor.schedule(baseInput({ assistantMessageId: 'msg-2', userText: 'second user text' }));
    const audit = await extractor.flush();

    expect(first.status).toBe('scheduled');
    expect(second.status).toBe('merged');
    expect(audit?.status).toBe('completed');
    expect(audit?.inputRange.assistantMessageIds).toEqual(['msg-1', 'msg-2']);
    expect(audit?.writtenCount).toBe(1);
    expect(extractFacts).toHaveBeenCalledTimes(1);
  });

  it('skips schema mismatches and sandbox denials', async () => {
    const schemaExtractor = new BackgroundMemoryExtractor({
      enabled: true,
      actorId: 'assistant',
      extractFacts: vi.fn(),
      writeFacts: vi.fn(),
      now: () => 1000,
    });
    schemaExtractor.schedule(baseInput({ schemaVersion: 999 }));
    await expect(schemaExtractor.flush()).resolves.toMatchObject({
      status: 'skipped',
      skippedReason: 'schema-version-mismatch',
    });

    const sandboxExtractor = new BackgroundMemoryExtractor({
      enabled: true,
      actorId: 'assistant',
      sandboxDecision: { action: 'deny', reason: 'deny-by-default' },
      extractFacts: vi.fn(),
      writeFacts: vi.fn(),
      now: () => 1000,
    });
    sandboxExtractor.schedule(baseInput());
    await expect(sandboxExtractor.flush()).resolves.toMatchObject({
      status: 'skipped',
      skippedReason: 'sandbox-denied',
    });
  });

  it('returns failed audit records instead of throwing', async () => {
    const extractor = new BackgroundMemoryExtractor({
      enabled: true,
      actorId: 'assistant',
      extractFacts: vi.fn(async () => {
        throw new Error('extract failed');
      }),
      writeFacts: vi.fn(),
      now: () => 1000,
    });

    extractor.schedule(baseInput());
    const audit = await extractor.flush();

    expect(audit?.status).toBe('failed');
    expect(audit?.errorMessage).toBe('extract failed');
  });
});
