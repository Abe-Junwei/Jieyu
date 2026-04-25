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
      userText: '请记住：默认用中文解释',
      assistantText: '我记住了。',
      actorId: 'ai-chat',
    });
    await insertAuditLog(buildBackgroundMemoryAuditLog(scheduled));
    await flushBackgroundMemoryExtractor(runtime, insertAuditLog);

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(memory).toMatchObject({
      responsePreferences: { language: 'zh-CN' },
      directiveLedger: [expect.objectContaining({ action: 'accepted' })],
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
});
