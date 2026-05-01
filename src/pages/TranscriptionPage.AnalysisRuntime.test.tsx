// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { REQUEST_EMBEDDING_TASK_FOCUS_EVENT } from '../ai/tasks/taskRefreshEvents';
import { TranscriptionPageAnalysisRuntime } from './TranscriptionPage.AnalysisRuntime';
import type { TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.runtimeContracts';

const {
  mockNotifyOpenApprovalCenter,
  mockNotifyRequestAgentLoopResume,
  mockUseAiEmbeddingState,
} = vi.hoisted(() => ({
  mockNotifyOpenApprovalCenter: vi.fn(),
  mockNotifyRequestAgentLoopResume: vi.fn(),
  mockUseAiEmbeddingState: vi.fn(),
}));

vi.mock('../ai/tasks/taskRefreshEvents', async () => {
  const actual = await vi.importActual<typeof import('../ai/tasks/taskRefreshEvents')>('../ai/tasks/taskRefreshEvents');
  return {
    ...actual,
    notifyOpenApprovalCenter: mockNotifyOpenApprovalCenter,
    notifyRequestAgentLoopResume: mockNotifyRequestAgentLoopResume,
  };
});

vi.mock('../hooks/useAiEmbeddingState', () => ({
  useAiEmbeddingState: mockUseAiEmbeddingState,
}));

vi.mock('../components/AiAnalysisPanel', async () => {
  const mod = await import('../components/ai/AiEmbeddingCard');
  return {
    AiAnalysisPanel: () => <mod.AiEmbeddingCard />,
  };
});

vi.mock('./TranscriptionPage.helpers', () => ({
  saveEmbeddingProviderConfig: vi.fn(),
}));

vi.mock('../ai/embeddings/DeferredEmbeddingRuntime', () => ({
  createDeferredEmbeddingRuntime: () => ({
    embeddingService: {
      terminate: () => undefined,
      buildEmbeddings: async () => ({ taskId: 'x', total: 0, generated: 0, skipped: 0, modelId: 'm', modelVersion: 'v' }),
      buildNotesEmbeddings: async () => ({ taskId: 'x', total: 0, generated: 0, skipped: 0, modelId: 'm', modelVersion: 'v' }),
      buildPdfEmbeddings: async () => ({ taskId: 'x', total: 0, generated: 0, skipped: 0, modelId: 'm', modelVersion: 'v' }),
    },
    embeddingSearchService: {
      terminate: () => undefined,
      searchSimilarUnits: async () => ({ matches: [] }),
      searchMultiSource: async () => ({ matches: [] }),
      searchMultiSourceHybrid: async () => ({ matches: [] }),
    },
  }),
}));

function makeProps(): TranscriptionPageAnalysisRuntimeProps {
  return {
    panel: {
      locale: 'zh-CN',
      analysisTab: 'embedding',
      onAnalysisTabChange: () => undefined,
    },
    embedding: {
      source: {
        selectedUnit: null,
        unitsOnCurrentMedia: [],
        getUnitTextForLayer: () => '',
        formatTime: () => '',
        externalErrorMessage: null,
      },
      navigation: {
        onJumpToEmbeddingMatch: () => undefined,
        onJumpToCitation: async () => undefined,
      },
      provider: {
        config: {
          embeddingProviderConfig: { kind: 'local' },
        },
        actions: {
          onEmbeddingProviderConfigChange: () => undefined,
        },
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('TranscriptionPageAnalysisRuntime resume bridge', () => {
  it('dispatches approval + targeted resume events when clicking resume on agent_loop task card', () => {
    mockUseAiEmbeddingState.mockReturnValue({
      aiEmbeddingBusy: false,
      aiEmbeddingProgressLabel: null,
      aiEmbeddingLastResult: null,
      aiEmbeddingTasks: [
        {
          id: 'task-loop-resume-runtime',
          taskType: 'agent_loop',
          status: 'pending',
          updatedAt: '2026-04-30T00:00:00.000Z',
          resumable: true,
          checkpointJson: '{"kind":"agent_loop_token_budget_warning"}',
          handoffReason: 'token_budget_warning',
        },
      ],
      aiEmbeddingMatches: [],
      aiEmbeddingLastError: null,
      aiEmbeddingWarning: null,
      refreshEmbeddingTasks: async () => undefined,
      handleCancelAiTask: async () => undefined,
      handleRetryAiTask: async () => undefined,
      handleBuildUnitEmbeddings: async () => undefined,
      handleBuildNotesEmbeddings: async () => undefined,
      handleBuildPdfEmbeddings: async () => undefined,
      handleFindSimilarUnits: async () => undefined,
    });

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageAnalysisRuntime panel={makeProps().panel} embedding={makeProps().embedding} />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));

    expect(mockNotifyOpenApprovalCenter).toHaveBeenCalledTimes(1);
    expect(mockNotifyRequestAgentLoopResume).toHaveBeenCalledTimes(1);
    expect(mockNotifyRequestAgentLoopResume).toHaveBeenCalledWith({ taskId: 'task-loop-resume-runtime' });
  });

  it('switches analysis tab to embedding when receiving reverse task focus request', () => {
    const onAnalysisTabChange = vi.fn();
    const refreshEmbeddingTasks = vi.fn(async () => undefined);
    mockUseAiEmbeddingState.mockReturnValue({
      aiEmbeddingBusy: false,
      aiEmbeddingProgressLabel: null,
      aiEmbeddingLastResult: null,
      aiEmbeddingTasks: [],
      aiEmbeddingMatches: [],
      aiEmbeddingLastError: null,
      aiEmbeddingWarning: null,
      refreshEmbeddingTasks,
      handleCancelAiTask: async () => undefined,
      handleRetryAiTask: async () => undefined,
      handleBuildUnitEmbeddings: async () => undefined,
      handleBuildNotesEmbeddings: async () => undefined,
      handleBuildPdfEmbeddings: async () => undefined,
      handleFindSimilarUnits: async () => undefined,
    });

    const props = makeProps();
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageAnalysisRuntime
          panel={{ ...props.panel, analysisTab: 'stats', onAnalysisTabChange }}
          embedding={props.embedding}
        />
      </LocaleProvider>,
    );

    fireEvent(window, new CustomEvent(REQUEST_EMBEDDING_TASK_FOCUS_EVENT, {
      detail: { taskId: 'task-loop-focus-runtime' },
    }));

    expect(onAnalysisTabChange).toHaveBeenCalledTimes(1);
    expect(onAnalysisTabChange).toHaveBeenCalledWith('embedding');
    expect(refreshEmbeddingTasks).toHaveBeenCalledTimes(1);
  });
});
