import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runSendTurnStreamComposedWorkflowAfterVerticalQuality } from './useAiChat.sendTurnStreamPhase.completionPipelineVerticalComposedWorkflow';
import type { AiSessionMemory } from './useAiChat.types';

vi.mock('../../ai/chat/sessionMemory', () => ({
  persistSessionMemoryAsync: vi.fn(async () => {}),
}));

import { persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';

describe('runSendTurnStreamComposedWorkflowAfterVerticalQuality turn guard', () => {
  beforeEach(() => {
    vi.mocked(persistSessionMemoryAsync).mockClear();
  });

  it('skips session memory and UI updates when conversation generation is stale', async () => {
    const sessionMemory: AiSessionMemory = {
      composedWorkflowState: {
        templateId: 'annotation_qa_then_lexeme_candidates',
        currentStepIndex: 0,
        stepResults: {},
        status: 'running',
        originalUserText: 'test',
      },
    };
    const sessionMemoryRef = { current: sessionMemory };
    const setMessages = vi.fn();
    const queueFlushAssistantDraft = vi.fn();
    const resolution = { content: 'step output', status: 'done' as const };

    await runSendTurnStreamComposedWorkflowAfterVerticalQuality({
      db: { collections: { audit_logs: { insert: vi.fn(async () => {}) } } } as never,
      assistantId: 'ast-1',
      resolution,
      resolutionStatus: 'done',
      sessionMemoryRef,
      queueFlushAssistantDraft,
      awaitQueuedPersistence: vi.fn(async () => {}),
      setMessages,
      reflectionResult: null,
      composedReflectionRetryBlob: undefined,
      locale: 'en-US',
      turnConversationId: 'conv-a',
      shouldApplyTurnSideEffects: () => false,
    });

    expect(persistSessionMemoryAsync).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(queueFlushAssistantDraft).not.toHaveBeenCalled();
    expect(sessionMemoryRef.current.composedWorkflowState?.status).toBe('running');
  });
});
