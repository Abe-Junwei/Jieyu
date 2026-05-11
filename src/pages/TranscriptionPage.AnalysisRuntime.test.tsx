// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { REQUEST_EMBEDDING_TASK_FOCUS_EVENT } from '../ai/tasks/taskRefreshEvents';
import { TranscriptionPageAnalysisRuntime } from './TranscriptionPage.AnalysisRuntime';
import type { TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.runtimeContracts';

const { mockNotifyOpenApprovalCenter, mockNotifyRequestAgentLoopResume, mockUseAiEmbeddingState } =
  vi.hoisted(() => ({
    mockNotifyOpenApprovalCenter: vi.fn(),
    mockNotifyRequestAgentLoopResume: vi.fn(),
    mockUseAiEmbeddingState: vi.fn(),
  }));

vi.mock('../ai/tasks/taskRefreshEvents', async () => {
  const actual = await vi.importActual<typeof import('../ai/tasks/taskRefreshEvents')>(
    '../ai/tasks/taskRefreshEvents',
  );
  return {
    ...actual,
    notifyOpenApprovalCenter: mockNotifyOpenApprovalCenter,
    notifyRequestAgentLoopResume: mockNotifyRequestAgentLoopResume,
  };
});

vi.mock('../hooks/ai/useAiEmbeddingState', () => ({
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
      buildEmbeddings: async () => ({
        taskId: 'x',
        total: 0,
        generated: 0,
        skipped: 0,
        modelId: 'm',
        modelVersion: 'v',
      }),
      buildNotesEmbeddings: async () => ({
        taskId: 'x',
        total: 0,
        generated: 0,
        skipped: 0,
        modelId: 'm',
        modelVersion: 'v',
      }),
      buildPdfEmbeddings: async () => ({
        taskId: 'x',
        total: 0,
        generated: 0,
        skipped: 0,
        modelId: 'm',
        modelVersion: 'v',
      }),
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
        <TranscriptionPageAnalysisRuntime
          panel={makeProps().panel}
          embedding={makeProps().embedding}
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '任务列表续跑' }));

    expect(mockNotifyOpenApprovalCenter).toHaveBeenCalledTimes(1);
    expect(mockNotifyRequestAgentLoopResume).toHaveBeenCalledTimes(1);
    expect(mockNotifyRequestAgentLoopResume).toHaveBeenCalledWith({
      taskId: 'task-loop-resume-runtime',
    });
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

    fireEvent(
      window,
      new CustomEvent(REQUEST_EMBEDDING_TASK_FOCUS_EVENT, {
        detail: { taskId: 'task-loop-focus-runtime' },
      }),
    );

    expect(onAnalysisTabChange).toHaveBeenCalledTimes(1);
    expect(onAnalysisTabChange).toHaveBeenCalledWith('embedding');
    expect(refreshEmbeddingTasks).toHaveBeenCalledTimes(1);
  });

  it('invokes onAgentLoopTaskCancelledFromTaskList when task cancel succeeds', async () => {
    const onAgentLoopTaskCancelledFromTaskList = vi.fn();
    const handleCancelAiTask = vi.fn(async () => true);
    mockUseAiEmbeddingState.mockReturnValue({
      aiEmbeddingBusy: false,
      aiEmbeddingProgressLabel: null,
      aiEmbeddingLastResult: null,
      aiEmbeddingTasks: [
        {
          id: 'task-loop-cancel-bridge',
          taskType: 'agent_loop',
          status: 'pending',
          updatedAt: '2026-04-30T00:00:00.000Z',
          resumable: true,
          checkpointJson: '{"kind":"agent_loop_token_budget_warning"}',
        },
      ],
      aiEmbeddingMatches: [],
      aiEmbeddingLastError: null,
      aiEmbeddingWarning: null,
      refreshEmbeddingTasks: async () => undefined,
      handleCancelAiTask,
      handleRetryAiTask: async () => undefined,
      handleBuildUnitEmbeddings: async () => undefined,
      handleBuildNotesEmbeddings: async () => undefined,
      handleBuildPdfEmbeddings: async () => undefined,
      handleFindSimilarUnits: async () => undefined,
    });

    const base = makeProps();
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageAnalysisRuntime
          panel={base.panel}
          embedding={{
            ...base.embedding,
            navigation: {
              ...base.embedding.navigation,
              onAgentLoopTaskCancelledFromTaskList,
            },
          }}
        />
      </LocaleProvider>,
    );

    const row = document.querySelector('[data-task-id="task-loop-cancel-bridge"]');
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(handleCancelAiTask).toHaveBeenCalledWith('task-loop-cancel-bridge');
    });
    expect(onAgentLoopTaskCancelledFromTaskList).toHaveBeenCalledTimes(1);
    expect(onAgentLoopTaskCancelledFromTaskList).toHaveBeenCalledWith('task-loop-cancel-bridge');
  });

  it('does not invoke onAgentLoopTaskCancelledFromTaskList when cancel fails', async () => {
    const onAgentLoopTaskCancelledFromTaskList = vi.fn();
    const handleCancelAiTask = vi.fn(async () => false);
    mockUseAiEmbeddingState.mockReturnValue({
      aiEmbeddingBusy: false,
      aiEmbeddingProgressLabel: null,
      aiEmbeddingLastResult: null,
      aiEmbeddingTasks: [
        {
          id: 'task-loop-cancel-fail',
          taskType: 'agent_loop',
          status: 'pending',
          updatedAt: '2026-04-30T00:00:00.000Z',
          resumable: true,
          checkpointJson: '{"kind":"agent_loop_token_budget_warning"}',
        },
      ],
      aiEmbeddingMatches: [],
      aiEmbeddingLastError: null,
      aiEmbeddingWarning: null,
      refreshEmbeddingTasks: async () => undefined,
      handleCancelAiTask,
      handleRetryAiTask: async () => undefined,
      handleBuildUnitEmbeddings: async () => undefined,
      handleBuildNotesEmbeddings: async () => undefined,
      handleBuildPdfEmbeddings: async () => undefined,
      handleFindSimilarUnits: async () => undefined,
    });

    const base = makeProps();
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageAnalysisRuntime
          panel={base.panel}
          embedding={{
            ...base.embedding,
            navigation: {
              ...base.embedding.navigation,
              onAgentLoopTaskCancelledFromTaskList,
            },
          }}
        />
      </LocaleProvider>,
    );

    const row = document.querySelector('[data-task-id="task-loop-cancel-fail"]');
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(handleCancelAiTask).toHaveBeenCalled();
    });
    expect(onAgentLoopTaskCancelledFromTaskList).not.toHaveBeenCalled();
  });

  it('invokes onAgentLoopTaskRetriedFromTaskList when agent_loop retry succeeds', async () => {
    const onAgentLoopTaskRetriedFromTaskList = vi.fn();
    const handleRetryAiTask = vi.fn(async () => true);
    mockUseAiEmbeddingState.mockReturnValue({
      aiEmbeddingBusy: false,
      aiEmbeddingProgressLabel: null,
      aiEmbeddingLastResult: null,
      aiEmbeddingTasks: [
        {
          id: 'task-loop-retry-bridge',
          taskType: 'agent_loop',
          status: 'failed',
          updatedAt: '2026-04-30T00:00:00.000Z',
          errorMessage: 'cancelled_by_user',
        },
      ],
      aiEmbeddingMatches: [],
      aiEmbeddingLastError: null,
      aiEmbeddingWarning: null,
      refreshEmbeddingTasks: async () => undefined,
      handleCancelAiTask: async () => true,
      handleRetryAiTask,
      handleBuildUnitEmbeddings: async () => undefined,
      handleBuildNotesEmbeddings: async () => undefined,
      handleBuildPdfEmbeddings: async () => undefined,
      handleFindSimilarUnits: async () => undefined,
    });

    const base = makeProps();
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageAnalysisRuntime
          panel={base.panel}
          embedding={{
            ...base.embedding,
            navigation: {
              ...base.embedding.navigation,
              onAgentLoopTaskRetriedFromTaskList,
            },
          }}
        />
      </LocaleProvider>,
    );

    const row = document.querySelector('[data-task-id="task-loop-retry-bridge"]');
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '任务列表重试' }));

    await waitFor(() => {
      expect(handleRetryAiTask).toHaveBeenCalledWith('task-loop-retry-bridge');
    });
    expect(onAgentLoopTaskRetriedFromTaskList).toHaveBeenCalledTimes(1);
    expect(onAgentLoopTaskRetriedFromTaskList).toHaveBeenCalledWith('task-loop-retry-bridge');
  });
});
