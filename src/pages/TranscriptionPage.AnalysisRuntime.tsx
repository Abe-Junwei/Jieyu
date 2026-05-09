import { useCallback, useEffect, useMemo, useRef } from 'react';
import { EmbeddingProvider } from '../contexts/EmbeddingContext';
import { useAiEmbeddingState } from '../hooks/useAiEmbeddingState';
import { useEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import {
  notifyOpenApprovalCenter,
  notifyRequestAgentLoopResume,
  REQUEST_EMBEDDING_TASK_FOCUS_EVENT,
  type RequestEmbeddingTaskFocusDetail,
} from '../ai/tasks/taskRefreshEvents';
import { saveEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { AiAnalysisPanel } from '../components/AiAnalysisPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { createDeferredEmbeddingRuntime } from '../ai/embeddings/DeferredEmbeddingRuntime';
import type { TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.runtimeContracts';

export function TranscriptionPageAnalysisRuntime({
  panel,
  embedding,
}: TranscriptionPageAnalysisRuntimeProps) {
  const embeddingTasksHydratedRef = useRef(false);
  const taskRunner = useMemo(() => getGlobalTaskRunner(), []);
  const deferredEmbeddingRuntime = useMemo(
    () =>
      createDeferredEmbeddingRuntime(
        () => embedding.provider.config.embeddingProviderConfig,
        taskRunner,
      ),
    [embedding.provider.config.embeddingProviderConfig, taskRunner],
  );

  useEffect(() => {
    saveEmbeddingProviderConfig(embedding.provider.config.embeddingProviderConfig);
  }, [embedding.provider.config.embeddingProviderConfig]);

  const {
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    refreshEmbeddingTasks,
    handleCancelAiTask,
    handleRetryAiTask,
    handleBuildUnitEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUnits,
  } = useAiEmbeddingState({
    locale: panel.locale,
    enabled: panel.analysisTab === 'embedding',
    taskRunner,
    embeddingService: deferredEmbeddingRuntime.embeddingService,
    embeddingSearchService: deferredEmbeddingRuntime.embeddingSearchService,
    selectedUnit: embedding.source.selectedUnit,
    unitsOnCurrentMedia: embedding.source.unitsOnCurrentMedia,
    getUnitTextForLayer: embedding.source.getUnitTextForLayer,
    formatTime: embedding.source.formatTime,
  });

  useEffect(() => {
    if (panel.analysisTab !== 'embedding' || embeddingTasksHydratedRef.current) {
      return;
    }
    embeddingTasksHydratedRef.current = true;
    fireAndForget(refreshEmbeddingTasks(), {
      context: 'src/pages/TranscriptionPage.AnalysisRuntime.tsx:L59',
      policy: 'user-visible',
    });
  }, [panel.analysisTab, refreshEmbeddingTasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRequestTaskFocus = (event: Event) => {
      const customEvent = event as CustomEvent<RequestEmbeddingTaskFocusDetail>;
      const taskId = customEvent.detail?.taskId;
      if (taskId === undefined || taskId.trim().length === 0) return;
      panel.onAnalysisTabChange?.('embedding');
      fireAndForget(refreshEmbeddingTasks(), {
        context: 'src/pages/TranscriptionPage.AnalysisRuntime.tsx:L73',
        policy: 'user-visible',
      });
    };
    window.addEventListener(
      REQUEST_EMBEDDING_TASK_FOCUS_EVENT,
      onRequestTaskFocus as EventListener,
    );
    return () => {
      window.removeEventListener(
        REQUEST_EMBEDDING_TASK_FOCUS_EVENT,
        onRequestTaskFocus as EventListener,
      );
    };
  }, [panel, refreshEmbeddingTasks]);

  const handleTestEmbeddingProvider = useMemo(
    () => async () => {
      const { testEmbeddingProvider } = await import('../ai/embeddings/EmbeddingProviderCatalog');
      return testEmbeddingProvider(embedding.provider.config.embeddingProviderConfig);
    },
    [embedding.provider.config.embeddingProviderConfig],
  );

  const handleResumeAiTask = useCallback((taskId: string) => {
    notifyOpenApprovalCenter();
    notifyRequestAgentLoopResume({ taskId });
  }, []);

  const handleCancelAiTaskWithSessionBridge = useCallback(
    async (taskId: string) => {
      const ok = await handleCancelAiTask(taskId);
      if (ok) {
        embedding.navigation.onAgentLoopTaskCancelledFromTaskList?.(taskId);
      }
    },
    [embedding.navigation, handleCancelAiTask],
  );

  const handleRetryAiTaskWithSessionBridge = useCallback(
    async (taskId: string) => {
      const ok = await handleRetryAiTask(taskId);
      if (ok) {
        embedding.navigation.onAgentLoopTaskRetriedFromTaskList?.(taskId);
      }
    },
    [embedding.navigation, handleRetryAiTask],
  );

  const embeddingContextValue = useEmbeddingContextValue({
    selectedUnit: embedding.source.selectedUnit,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError: aiEmbeddingLastError ?? embedding.source.externalErrorMessage,
    aiEmbeddingWarning,
    aiEmbeddingBuildStartedAt: null,
    embeddingProviderKind: embedding.provider.config.embeddingProviderConfig.kind,
    embeddingProviderConfig: embedding.provider.config.embeddingProviderConfig,
    onSetEmbeddingProviderKind: (kind) => {
      embedding.provider.actions.onEmbeddingProviderConfigChange({
        ...embedding.provider.config.embeddingProviderConfig,
        kind,
      });
    },
    onTestEmbeddingProvider: handleTestEmbeddingProvider,
    onBuildUnitEmbeddings: handleBuildUnitEmbeddings,
    onBuildNotesEmbeddings: handleBuildNotesEmbeddings,
    onBuildPdfEmbeddings: handleBuildPdfEmbeddings,
    onFindSimilarUnits: handleFindSimilarUnits,
    onRefreshEmbeddingTasks: refreshEmbeddingTasks,
    onJumpToEmbeddingMatch: embedding.navigation.onJumpToEmbeddingMatch,
    onJumpToCitation: embedding.navigation.onJumpToCitation,
    onResumeAiTask: handleResumeAiTask,
    onCancelAiTask: handleCancelAiTaskWithSessionBridge,
    onRetryAiTask: handleRetryAiTaskWithSessionBridge,
  });

  return (
    <div className="transcription-hub-sidebar-panel-body">
      <EmbeddingProvider value={embeddingContextValue}>
        <AiAnalysisPanel
          isCollapsed={false}
          activeTab={panel.analysisTab}
          onChangeActiveTab={panel.onAnalysisTabChange}
        />
      </EmbeddingProvider>
    </div>
  );
}
