// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { loadConversationUiMessages } from '../../hooks/ai/useAiChat.conversationState';
import {
  AI_CHAT_TURN_VIRTUAL_THRESHOLD,
  AI_CHAT_TURN_ESTIMATE_PX,
} from './aiChatMessageThreadVirtual';
import { shouldVirtualizeAiChatTurns } from './useAiChatMessageThreadVirtualizer';

const coverageRelaxed = process.env.npm_lifecycle_event === 'test:coverage';
const SAMPLE_TURN_COUNT = 64;

describe('AiChatMessageThread virtual perf baseline (G1g)', () => {
  it('records threshold constants for release evidence', () => {
    expect({
      threshold: AI_CHAT_TURN_VIRTUAL_THRESHOLD,
      estimatePx: AI_CHAT_TURN_ESTIMATE_PX,
      sampleTurnCount: SAMPLE_TURN_COUNT,
    }).toEqual({
      threshold: 20,
      estimatePx: 136,
      sampleTurnCount: 64,
    });
    expect(shouldVirtualizeAiChatTurns(SAMPLE_TURN_COUNT)).toBe(true);
  });

  it('loads 64-turn conversation history within baseline budget', async () => {
    await resetJieyuDatabaseSingletonForTests();
    const db = await getDb();
    const conversationId = 'conv-perf';
    const timestamp = '2026-05-17T10:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: conversationId,
      title: 'Perf',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const baseMs = Date.parse('2026-05-17T10:00:00.000Z');
    for (let index = 0; index < SAMPLE_TURN_COUNT; index += 1) {
      const turnTs = new Date(baseMs + index * 1000).toISOString();
      await db.collections.ai_messages.insert({
        id: `user-${index}`,
        conversationId,
        role: 'user',
        content: `question ${index}`,
        status: 'done',
        createdAt: turnTs,
        updatedAt: turnTs,
      });
      await db.collections.ai_messages.insert({
        id: `asst-${index}`,
        conversationId,
        role: 'assistant',
        content: `answer ${index}`,
        status: 'done',
        createdAt: turnTs,
        updatedAt: turnTs,
      });
    }

    const startedAt = performance.now();
    const messages = await loadConversationUiMessages(conversationId);
    const elapsedMs = performance.now() - startedAt;

    expect(messages.length).toBe(SAMPLE_TURN_COUNT * 2);
    const budgetMs = coverageRelaxed ? 4_000 : 400;
    expect(elapsedMs).toBeLessThan(budgetMs);
    globalThis.console.info('[G1g ai-chat-thread perf]', {
      turnCount: SAMPLE_TURN_COUNT,
      messageCount: messages.length,
      elapsedMs: Math.round(elapsedMs),
      budgetMs,
      virtualized: shouldVirtualizeAiChatTurns(SAMPLE_TURN_COUNT),
    });
  });
});
