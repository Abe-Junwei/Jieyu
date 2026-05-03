import { describe, expect, it } from 'vitest';
import { buildAiStateWorkerSlice, createInitialDeferredAiRuntimeState } from './TranscriptionPage.ReadyWorkspace.runtime';
import type { DeferredTranscriptionAiRuntimeState } from './TranscriptionPage.AssistantBridge';

describe('buildAiStateWorkerSlice', () => {
  it('includes pending agent-loop checkpoint in aiChatPendingAgentLoopFingerprint (T1-c deferred bridge)', () => {
    const base = createInitialDeferredAiRuntimeState() as DeferredTranscriptionAiRuntimeState;
    const withCheckpoint: DeferredTranscriptionAiRuntimeState = {
      ...base,
      aiChat: {
        ...base.aiChat,
        sessionMemory: {
          pendingAgentLoopCheckpoint: {
            kind: 'token_budget_warning',
            taskId: 'task_x',
            originalUserText: 'hello',
            continuationInput: 'world',
            step: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
          },
        },
      },
    };

    const emptyFp = buildAiStateWorkerSlice(base).aiChatPendingAgentLoopFingerprint;
    const withFp = buildAiStateWorkerSlice(withCheckpoint).aiChatPendingAgentLoopFingerprint;

    expect(emptyFp).toBe('');
    expect(withFp.length).toBeGreaterThan(0);
    expect(withFp).toContain('task_x');
  });
});
