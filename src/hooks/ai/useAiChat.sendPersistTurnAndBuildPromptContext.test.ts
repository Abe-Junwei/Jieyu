import { describe, expect, it, vi } from 'vitest';
import {
  bumpConversationGeneration,
  createConversationGenerationRef,
  StaleConversationTurnError,
} from '../../ai/chat/conversationGeneration';
import { persistOpeningTurnAndBuildPromptContext } from './useAiChat.sendPersistTurnAndBuildPromptContext';

const { ragGate, releaseRagGate } = vi.hoisted(() => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    ragGate: gate,
    releaseRagGate: () => release?.(),
  };
});

vi.mock('../../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      ai_conversations: {
        findOne: () => ({ exec: async () => null }),
        update: vi.fn(),
      },
    },
  })),
}));

vi.mock('./useAiChat.sendTurnPersistPhase', () => ({
  persistUserMessage: vi.fn(async () => {}),
  persistAssistantPlaceholder: vi.fn(async () => {}),
}));

vi.mock('./patchConversationTitleMvp', () => ({
  scheduleConversationTitlePatch: vi.fn(),
}));

vi.mock('../../ai/chat/contextBudget', () => ({
  resolveContextCharBudgets: vi.fn(async () => ({
    historyCharBudget: 8000,
    maxContextChars: 12000,
    conversationSummaryMaxChars: 500,
    sessionMemoryDigestMaxChars: 400,
  })),
}));

vi.mock('./useAiChat.rag', () => ({
  enrichContextWithRag: vi.fn(async ({ contextBlock }: { contextBlock: string }) => {
    await ragGate;
    return {
      contextBlock,
      citations: [],
      memoryRecallShape: undefined,
    };
  }),
}));

vi.mock('./useAiChat.memoryBroker', () => ({
  buildSessionMemoryDigestSuppressionRefs: vi.fn(() => []),
  maybeAppendMemoryBrokerContext: vi.fn(
    async ({ contextBlock }: { contextBlock: string }) => contextBlock,
  ),
}));

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: { aiChatRagEnabled: true, aiMemoryBrokerEnabled: false },
}));

describe('persistOpeningTurnAndBuildPromptContext conversation switch guard', () => {
  it('throws StaleConversationTurnError when conversation switches during async RAG', async () => {
    const generationRef = createConversationGenerationRef(0);
    const sessionMemoryRef = { current: {} };

    const openingPromise = persistOpeningTurnAndBuildPromptContext({
      ensureConversation: async () => 'conv-a',
      providerId: 'mock',
      getSettings: () =>
        ({
          providerKind: 'mock',
          model: 'mock',
          toolFeedbackStyle: 'concise',
        }) as never,
      userMsg: { id: 'usr-1', role: 'user', content: 'hello', status: 'done' },
      assistantId: 'ast-1',
      assistantSeed: {
        id: 'ast-1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        citations: [],
        generationSource: 'local',
        generationModel: '',
        reasoningContent: '',
      },
      messagesSnapshot: [],
      sessionMemoryRef,
      maxContextCharsOverride: undefined,
      historyCharBudgetOverride: undefined,
      getToolFeedbackLocale: () => 'zh-CN',
      getSystemPersonaKey: () => 'transcription',
      trimmed: 'hello',
      resumeCheckpoint: null,
      agentLoopSourceUserText: 'hello',
      effectiveUserText: 'hello',
      setContextDebugSnapshot: vi.fn(),
      getPromptContext: () => null,
      getEmbeddingSearchService: () => null,
      ragContextTimeoutMs: 1000,
      taskSession: { id: 'task-1', status: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' },
      setMetrics: vi.fn(),
      verticalWorkflowSelection: null,
      conversationGenerationRef: { current: generationRef },
    });

    await Promise.resolve();
    bumpConversationGeneration(generationRef);
    releaseRagGate();

    await expect(openingPromise).rejects.toBeInstanceOf(StaleConversationTurnError);
  });
});
