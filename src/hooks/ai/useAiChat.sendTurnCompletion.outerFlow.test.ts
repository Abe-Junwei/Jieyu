// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { formatAbortedMessage, formatFirstChunkTimeoutError } from '../../ai/messages';
import { createAssistantPersistenceHelpers } from './useAiChat.assistantPersistence';
import { applyPrimaryStreamUsage } from './useAiChat.sendTurnPreflight';
import {
  finalizeSendTurnStream,
  handleSendTurnStreamCatch,
  type SendTurnCompletionBundle,
} from './useAiChat.sendTurnCompletion';
import { createInitialSendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase';
import type { UiChatMessage } from './useAiChat.types';

const assistantId = 'assistant-outer-finish';
const conversationId = 'conv-outer-finish';
const keptBody = 'kept body';
const queuedDraft = 'queued draft';

async function seedStreamingAssistant(): Promise<void> {
  const db = await getDb();
  const now = '2026-10-15T00:00:00.000Z';
  await db.collections.ai_conversations.insert({
    id: conversationId,
    title: 'Outer finish',
    mode: 'assistant',
    providerId: 'openai',
    model: 'gpt-4',
    createdAt: now,
    updatedAt: now,
  });
  await db.collections.ai_messages.insert({
    id: assistantId,
    conversationId,
    role: 'assistant',
    content: 'seeded',
    status: 'streaming',
    createdAt: now,
    updatedAt: now,
  });
}

async function finishThroughCatchThenFinally(kind: 'timeout' | 'abort'): Promise<void> {
  await resetJieyuDatabaseSingletonForTests();
  await seedStreamingAssistant();
  const db = await getDb();
  const messagesRef = {
    current: [
      {
        id: assistantId,
        role: 'assistant',
        content: keptBody,
        status: 'streaming',
      } satisfies UiChatMessage,
    ],
  };
  const { queueFlushAssistantDraft, awaitQueuedPersistence, finalizeAssistantMessage } =
    createAssistantPersistenceHelpers({
      assistantId,
      setMessages: vi.fn(),
      messagesRef,
      streamPersistIntervalMsRef: { current: 0 },
      getDbRef: () => db,
      getActiveConversationId: () => conversationId,
    });
  queueFlushAssistantDraft(queuedDraft);

  const phaseState = createInitialSendTurnStreamPhaseState();
  phaseState.primaryStreamUsage = { inputTokens: 11, outputTokens: 4 };
  const controller = new AbortController();
  const bundle: SendTurnCompletionBundle = {
    provider: { id: 'openai', label: 'OpenAI' },
    setLastError: vi.fn(),
    setIsStreaming: vi.fn(),
    setConnectionTestStatus: vi.fn(),
    setConnectionTestMessage: vi.fn(),
    setMetrics: vi.fn(),
    messagesRef,
    onMessageCompleteRef: { current: vi.fn() },
    abortRef: { current: controller },
    toolFeedbackLocaleRef: { current: 'zh-CN' },
    assistantId,
    controller,
    phaseState,
    timedOutBeforeFirstChunk: { current: kind === 'timeout' },
    shouldTrackRemoteStatus: false,
    timeoutHandle: null,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    commitPrimaryStreamUsage: () => {
      applyPrimaryStreamUsage(phaseState);
    },
  };

  await handleSendTurnStreamCatch(bundle, new DOMException('Aborted', 'AbortError'));
  finalizeSendTurnStream(bundle);

  const row = await db.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
  expect(row?.toJSON()).toMatchObject({
    content: keptBody,
    status: kind === 'timeout' ? 'error' : 'aborted',
    errorMessage:
      kind === 'timeout'
        ? formatFirstChunkTimeoutError(false, 'OpenAI', 'zh-CN')
        : formatAbortedMessage('zh-CN'),
  });
  expect(phaseState.primaryUsageCommitted).toBe(true);
  expect(phaseState.reportedInputTokens).toBe(11);
  expect(phaseState.totalReportedOutputTokens).toBe(4);
}

describe('send-turn catch then finally', () => {
  it('keeps the assistant body and counts usage once after a first-chunk timeout', async () => {
    await finishThroughCatchThenFinally('timeout');
  });

  it('keeps the assistant body and counts usage once after an abort', async () => {
    await finishThroughCatchThenFinally('abort');
  });
});
