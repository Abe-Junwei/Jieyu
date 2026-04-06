// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptionPageAssistantBridge } from './TranscriptionPage.AssistantBridge';
import { useTranscriptionAiController } from './useTranscriptionAiController';
import type { UseTranscriptionAiControllerInput } from './useTranscriptionAiController';

vi.mock('./useTranscriptionAiController', () => ({
  useTranscriptionAiController: vi.fn(),
}));

const mockUseTranscriptionAiController = vi.mocked(useTranscriptionAiController);

const stableAiChatFns = {
  updateSettings: vi.fn(),
  testConnection: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  confirmPendingToolCall: vi.fn(),
  cancelPendingToolCall: vi.fn(),
  trackRecommendationEvent: vi.fn(),
};

describe('TranscriptionPageAssistantBridge', () => {
  it('does not re-emit runtime state when aiChat wrapper identity changes but fields stay stable', () => {
    const stableSettings = { provider: 'mock' };
    const stableMessages: Array<{ id: string; role: string; content: string }> = [];
    const stableMetrics = { turnCount: 0 };
    const stableTaskSession = { id: 'task-1', status: 'idle' };
    const stableLogs = [{ id: 'log-1', toolName: 'noop', decision: 'allow', timestamp: '2026-04-06T00:00:00.000Z' }];

    let connectionTestStatus = 'idle';

    mockUseTranscriptionAiController.mockImplementation(() => ({
      aiPanelMode: 'auto',
      setAiPanelMode: vi.fn(),
      aiSidebarError: null,
      setAiSidebarError: vi.fn(),
      embeddingProviderConfig: { kind: 'local' },
      setEmbeddingProviderConfig: vi.fn(),
      aiToolDecisionLogs: stableLogs,
      aiChat: {
        enabled: true,
        providerLabel: 'Mock Provider',
        settings: stableSettings,
        messages: stableMessages,
        isStreaming: false,
        lastError: null,
        connectionTestStatus,
        connectionTestMessage: null,
        contextDebugSnapshot: null,
        pendingToolCall: null,
        taskSession: stableTaskSession,
        metrics: stableMetrics,
        sessionMemory: null,
        toolDecisionMode: 'enabled' as const,
        isBootstrapping: false,
        ...stableAiChatFns,
      },
      lexemeMatches: [],
      observerResult: { stage: 'idle' },
      actionableObserverRecommendations: [],
      selectedAiWarning: false,
      selectedTranslationGapCount: 0,
      aiCurrentTask: null,
      aiVisibleCards: [],
      handleJumpToTranslationGap: vi.fn(),
      handleExecuteObserverRecommendation: vi.fn(),
    }) as unknown as ReturnType<typeof useTranscriptionAiController>);

    const onRuntimeStateChange = vi.fn();
    const controllerInput = {} as UseTranscriptionAiControllerInput;
    const view = render(
      <TranscriptionPageAssistantBridge
        controllerInput={controllerInput}
        onRuntimeStateChange={onRuntimeStateChange}
      />,
    );

    const firstCallCount = onRuntimeStateChange.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    view.rerender(
      <TranscriptionPageAssistantBridge
        controllerInput={controllerInput}
        onRuntimeStateChange={onRuntimeStateChange}
      />,
    );

    expect(onRuntimeStateChange).toHaveBeenCalledTimes(firstCallCount);

    connectionTestStatus = 'success';

    view.rerender(
      <TranscriptionPageAssistantBridge
        controllerInput={controllerInput}
        onRuntimeStateChange={onRuntimeStateChange}
      />,
    );

    expect(onRuntimeStateChange).toHaveBeenCalledTimes(firstCallCount + 1);
  });
});