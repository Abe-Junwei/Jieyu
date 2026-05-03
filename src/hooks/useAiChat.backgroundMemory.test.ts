import { describe, expect, it, vi } from 'vitest';
import { appendBackgroundFactsToSessionMemory, buildBackgroundMemoryAuditLog, createAiChatBackgroundMemoryRuntime, extractBackgroundMemoryFacts, flushBackgroundMemoryExtractor } from './useAiChat.backgroundMemory';
import type { AiSessionMemory } from './useAiChat.types';
import type { AuditLogDocType } from '../db/types';

describe('useAiChat.backgroundMemory', () => {
  it('does not duplicate explicit user directives as project facts', () => {
    const facts = extractBackgroundMemoryFacts({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-1',
      userText: '记住：我偏好简洁回答\n普通聊天不应该入记忆\nremember that project docs use Chinese headings',
      assistantText: 'ok',
      actorId: 'ai-chat',
    });

    expect(facts.map((item) => item.fact)).toEqual([]);
  });

  it('writes deduplicated background facts into session projectFacts', () => {
    const { nextMemory, writtenCount } = appendBackgroundFactsToSessionMemory(
      { projectFacts: [{ fact: '已有事实', source: 'user', createdAt: '2026-01-01T00:00:00.000Z' }] },
      [
        { fact: '已有事实', confidence: 0.8 },
        { fact: '新事实', confidence: 0.8 },
      ],
      '2026-04-25T00:00:00.000Z',
    );

    expect(writtenCount).toBe(1);
    expect(nextMemory.projectFacts).toEqual([
      { fact: '已有事实', source: 'user', createdAt: '2026-01-01T00:00:00.000Z' },
      { fact: '新事实', source: 'background-extracted', createdAt: '2026-04-25T00:00:00.000Z' },
    ]);
  });

  it('schedules, flushes and emits background extraction audit logs', async () => {
    let memory: AiSessionMemory = {};
    const persisted = vi.fn<(next: AiSessionMemory) => void>();
    const insertAuditLog = vi.fn<(entry: AuditLogDocType) => Promise<void>>(async () => {});
    const runtime = createAiChatBackgroundMemoryRuntime({
      enabled: true,
      getSessionMemory: () => memory,
      setSessionMemory: (next) => { memory = next; },
      persistSessionMemory: persisted,
    });

    const scheduled = runtime.extractor.schedule({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-1',
      userMessageId: 'usr-1',
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await insertAuditLog(buildBackgroundMemoryAuditLog(scheduled));
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(memory).toMatchObject({
      responsePreferences: { language: 'zh-CN' },
      directiveLedger: [expect.objectContaining({ action: 'accepted', sourceMessageId: 'usr-1' })],
    });
    expect(insertAuditLog).toHaveBeenCalledTimes(4);
    expect(insertAuditLog.mock.calls[1]?.[0]).toMatchObject({
      field: 'ai_background_memory_extraction',
      newValue: 'completed',
    });
    expect(insertAuditLog.mock.calls[2]?.[0]).toMatchObject({
      field: 'ai_user_directive_extraction',
    });
    expect(insertAuditLog.mock.calls[3]?.[0]).toMatchObject({
      field: 'ai_user_directive_application',
    });
  });

  it('keeps background extraction behavior when sandbox flag is disabled', async () => {
    let memory: AiSessionMemory = {};
    const persisted = vi.fn<(next: AiSessionMemory) => void>();
    const insertAuditLog = vi.fn<(entry: AuditLogDocType) => Promise<void>>(async () => {});
    const runtime = createAiChatBackgroundMemoryRuntime({
      enabled: true,
      sandboxEnabled: false,
      sandboxProfile: 'deny_by_default',
      getSessionMemory: () => memory,
      setSessionMemory: (next) => { memory = next; },
      persistSessionMemory: persisted,
    });
    runtime.extractor.schedule({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-1',
      userMessageId: 'usr-1',
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(memory.responsePreferences?.language).toBe('zh-CN');
    expect(insertAuditLog.mock.calls[0]?.[0]).toMatchObject({
      field: 'ai_background_memory_extraction',
      newValue: 'completed',
    });
    const metadata = JSON.parse(String(insertAuditLog.mock.calls[0]?.[0].metadataJson ?? '{}')) as Record<string, unknown>;
    expect(metadata.sandboxDecision).toEqual({ action: 'allow', reason: 'sandbox-disabled' });
  });

  it('skips background extraction when sandbox profile requires approval', async () => {
    let memory: AiSessionMemory = {};
    const persisted = vi.fn<(next: AiSessionMemory) => void>();
    const insertAuditLog = vi.fn<(entry: AuditLogDocType) => Promise<void>>(async () => {});
    const runtime = createAiChatBackgroundMemoryRuntime({
      enabled: true,
      sandboxEnabled: true,
      sandboxProfile: 'readonly',
      getSessionMemory: () => memory,
      setSessionMemory: (next) => { memory = next; },
      persistSessionMemory: persisted,
    });
    runtime.extractor.schedule({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-1',
      userMessageId: 'usr-1',
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    expect(persisted).not.toHaveBeenCalled();
    expect(memory.responsePreferences).toBeUndefined();
    expect(insertAuditLog).toHaveBeenCalledTimes(1);
    expect(insertAuditLog.mock.calls[0]?.[0]).toMatchObject({
      field: 'ai_background_memory_extraction',
      newValue: 'skipped',
    });
    const metadata = JSON.parse(String(insertAuditLog.mock.calls[0]?.[0].metadataJson ?? '{}')) as Record<string, unknown>;
    expect(metadata.skippedReason).toBe('sandbox-denied');
    expect(metadata.sandboxDecision).toEqual({ action: 'ask', reason: 'readonly-write-not-allowed' });
  });

  it('does not emit stale directive logs when flush is skipped', async () => {
    let memory: AiSessionMemory = {};
    const insertAuditLog = vi.fn<(entry: AuditLogDocType) => Promise<void>>(async () => {});
    const runtime = createAiChatBackgroundMemoryRuntime({
      enabled: true,
      getSessionMemory: () => memory,
      setSessionMemory: (next) => { memory = next; },
      persistSessionMemory: vi.fn(),
    });
    runtime.extractor.schedule({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-1',
      userMessageId: 'usr-1',
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);
    expect(insertAuditLog.mock.calls.some((call) => call[0].field === 'ai_user_directive_application')).toBe(true);

    const skippedRuntime = createAiChatBackgroundMemoryRuntime({
      enabled: false,
      getSessionMemory: () => memory,
      setSessionMemory: () => {},
      persistSessionMemory: vi.fn(),
    });
    skippedRuntime.extractor.schedule({
      conversationId: 'conv-1',
      assistantMessageId: 'ast-2',
      userMessageId: 'usr-2',
      userText: '普通聊天',
      assistantText: 'ok',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(skippedRuntime, insertAuditLog);
    const latestDirectiveLogs = insertAuditLog.mock.calls.filter((call) => (
      call[0].field === 'ai_user_directive_application' || call[0].field === 'ai_user_directive_extraction'
    ));
    expect(latestDirectiveLogs).toHaveLength(2);
  });

  it('skips background flush when session write quota is enabled and exceeded', async () => {
    let memory: AiSessionMemory = {};
    const persisted = vi.fn<(next: AiSessionMemory) => void>();
    const insertAuditLog = vi.fn<(entry: AuditLogDocType) => Promise<void>>(async () => {});
    const runtime = createAiChatBackgroundMemoryRuntime({
      enabled: true,
      flushQuotaEnabled: true,
      flushQuotaMaxCompletedWriteFlushesPerConversation: 1,
      getSessionMemory: () => memory,
      setSessionMemory: (next) => { memory = next; },
      persistSessionMemory: persisted,
    });

    runtime.extractor.schedule({
      conversationId: 'conv-quota',
      assistantMessageId: 'ast-1',
      userMessageId: 'usr-1',
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    runtime.extractor.schedule({
      conversationId: 'conv-quota',
      assistantMessageId: 'ast-2',
      userMessageId: 'usr-2',
      userText: '请记住：以后用英文',
      assistantText: '好的。',
      actorId: 'ai-chat',
    });
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    expect(persisted).toHaveBeenCalledTimes(1);
    const skippedMetadata = insertAuditLog.mock.calls
      .map((c) => c[0])
      .filter((row) => row.field === 'ai_background_memory_extraction' && row.newValue === 'skipped')
      .map((row) => JSON.parse(String(row.metadataJson ?? '{}')) as { skippedReason?: string });
    expect(skippedMetadata.some((m) => m.skippedReason === 'session-write-quota-exceeded')).toBe(true);
  });
});
