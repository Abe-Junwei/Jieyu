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

const stableJumpToAcousticHotspot = vi.fn();

describe('TranscriptionPageAssistantBridge', () => {
  it('does not re-emit runtime state when aiChat wrapper identity changes but fields stay stable', () => {
    const stableSettings = { provider: 'mock' };
    const stableMessages: Array<{ id: string; role: string; content: string }> = [];
    const stableMetrics = { turnCount: 0 };
    const stableTaskSession = { id: 'task-1', status: 'idle' };
    const stableLogs = [{ id: 'log-1', toolName: 'noop', decision: 'allow', timestamp: '2026-04-06T00:00:00.000Z' }];
    const stableAcousticSummary = {
      selectionStartSec: 1.2,
      selectionEndSec: 3.4,
      f0MinHz: 120,
      f0MaxHz: 280,
      f0MeanHz: 195,
      intensityPeakDb: -12,
      reliabilityMean: 0.82,
      voicedFrameCount: 12,
      frameCount: 16,
    };
    const stableAcousticDetail = {
      mediaKey: 'media-1',
      sampleRate: 16000,
      frameStepSec: 0.01,
      selectionStartSec: 1.2,
      selectionEndSec: 3.4,
      sampleCount: 4,
      voicedSampleCount: 4,
      frames: [
        { timeSec: 1.3, relativeTimeSec: 0.1, timeRatio: 0.05, f0Hz: 132, intensityDb: -19, reliability: 0.71, normalizedF0: 0.1, normalizedIntensity: 0.2 },
        { timeSec: 2.1, relativeTimeSec: 0.9, timeRatio: 0.4, f0Hz: 184, intensityDb: -15, reliability: 0.82, normalizedF0: 0.58, normalizedIntensity: 0.56 },
        { timeSec: 2.7, relativeTimeSec: 1.5, timeRatio: 0.68, f0Hz: 228, intensityDb: -13, reliability: 0.86, normalizedF0: 0.82, normalizedIntensity: 0.8 },
        { timeSec: 3.2, relativeTimeSec: 2, timeRatio: 0.91, f0Hz: 244, intensityDb: -12, reliability: 0.88, normalizedF0: 1, normalizedIntensity: 1 },
      ],
      toneBins: [
        { index: 0, timeSec: 1.3, timeRatio: 0, f0Hz: 132, intensityDb: -19, reliability: 0.71, normalizedF0: 0.1, normalizedIntensity: 0.2 },
        { index: 1, timeSec: 2.1, timeRatio: 0.33, f0Hz: 184, intensityDb: -15, reliability: 0.82, normalizedF0: 0.58, normalizedIntensity: 0.56 },
        { index: 2, timeSec: 2.7, timeRatio: 0.67, f0Hz: 228, intensityDb: -13, reliability: 0.86, normalizedF0: 0.82, normalizedIntensity: 0.8 },
        { index: 3, timeSec: 3.2, timeRatio: 1, f0Hz: 244, intensityDb: -12, reliability: 0.88, normalizedF0: 1, normalizedIntensity: 1 },
      ],
    };

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
      acousticSummary: stableAcousticSummary,
      acousticDetail: stableAcousticDetail,
      handleJumpToTranslationGap: vi.fn(),
      handleJumpToAcousticHotspot: stableJumpToAcousticHotspot,
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
    expect(onRuntimeStateChange.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      acousticSummary: expect.objectContaining({ selectionStartSec: 1.2, selectionEndSec: 3.4 }),
      acousticDetail: expect.objectContaining({ selectionStartSec: 1.2, sampleCount: 4 }),
      onJumpToAcousticHotspot: stableJumpToAcousticHotspot,
    }));

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