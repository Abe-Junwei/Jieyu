import { useEffect, useMemo, useRef } from 'react';
import { EmbeddingProvider } from '../contexts/EmbeddingContext';
import { useAiEmbeddingState } from '../hooks/useAiEmbeddingState';
import { useEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import { saveEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { AiAnalysisPanel } from '../components/AiAnalysisPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { createDeferredEmbeddingRuntime } from '../ai/embeddings/DeferredEmbeddingRuntime';
import type {
  TranscriptionPageAnalysisRuntimeProps,
} from './TranscriptionPage.runtimeContracts';

export function TranscriptionPageAnalysisRuntime({
  panel,
  embedding,
}: TranscriptionPageAnalysisRuntimeProps) {
  const embeddingTasksHydratedRef = useRef(false);
  const taskRunner = useMemo(() => getGlobalTaskRunner(), []);
  const deferredEmbeddingRuntime = useMemo(
    () => createDeferredEmbeddingRuntime(() => embedding.provider.config.embeddingProviderConfig, taskRunner),
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
    handleBuildUtteranceEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUtterances,
  } = useAiEmbeddingState({
    locale: panel.locale,
    enabled: panel.analysisTab === 'embedding',
    taskRunner,
    embeddingService: deferredEmbeddingRuntime.embeddingService,
    embeddingSearchService: deferredEmbeddingRuntime.embeddingSearchService,
    selectedUtterance: embedding.source.selectedUtterance,
    utterancesOnCurrentMedia: embedding.source.utterancesOnCurrentMedia,
    getUtteranceTextForLayer: embedding.source.getUtteranceTextForLayer,
    formatTime: embedding.source.formatTime,
  });

  useEffect(() => {
    if (panel.analysisTab !== 'embedding' || embeddingTasksHydratedRef.current) {
      return;
    }
    embeddingTasksHydratedRef.current = true;
    fireAndForget(refreshEmbeddingTasks());
  }, [panel.analysisTab, refreshEmbeddingTasks]);

  const handleTestEmbeddingProvider = useMemo(
    () => async () => {
      const { testEmbeddingProvider } = await import('../ai/embeddings/EmbeddingProviderCatalog');
      return testEmbeddingProvider(embedding.provider.config.embeddingProviderConfig);
    },
    [embedding.provider.config.embeddingProviderConfig],
  );

  const embeddingContextValue = useEmbeddingContextValue({
    selectedUtterance: embedding.source.selectedUtterance,
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
      embedding.provider.actions.onEmbeddingProviderConfigChange({ ...embedding.provider.config.embeddingProviderConfig, kind });
    },
    onTestEmbeddingProvider: handleTestEmbeddingProvider,
    onBuildUtteranceEmbeddings: handleBuildUtteranceEmbeddings,
    onBuildNotesEmbeddings: handleBuildNotesEmbeddings,
    onBuildPdfEmbeddings: handleBuildPdfEmbeddings,
    onFindSimilarUtterances: handleFindSimilarUtterances,
    onRefreshEmbeddingTasks: refreshEmbeddingTasks,
    onJumpToEmbeddingMatch: embedding.navigation.onJumpToEmbeddingMatch,
    onJumpToCitation: embedding.navigation.onJumpToCitation,
    onCancelAiTask: handleCancelAiTask,
    onRetryAiTask: handleRetryAiTask,
  });

  return (
    <div className="transcription-hub-sidebar-panel-body">
      <EmbeddingProvider value={embeddingContextValue}>
        <AiAnalysisPanel isCollapsed={false} activeTab={panel.analysisTab} onChangeActiveTab={panel.onAnalysisTabChange} />
      </EmbeddingProvider>
    </div>
  );
}