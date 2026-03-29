import { useEffect, useMemo, useRef } from 'react';
import { EmbeddingProvider } from '../contexts/EmbeddingContext';
import { useAiEmbeddingState } from '../hooks/useAiEmbeddingState';
import { useEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import { saveEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { AiAnalysisPanel, type AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { UtteranceDocType } from '../db';
import { fireAndForget } from '../utils/fireAndForget';
import { createDeferredEmbeddingRuntime } from '../ai/embeddings/DeferredEmbeddingRuntime';

export interface TranscriptionPageEmbeddingProviderConfig {
  kind: EmbeddingProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface TranscriptionPageAnalysisRuntimeProps {
  locale: string;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
  selectedUtterance: UtteranceDocType | null;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  onJumpToCitation: (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void> | void;
  onJumpToEmbeddingMatch: (utteranceId: string) => void;
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
  onEmbeddingProviderConfigChange: (config: TranscriptionPageEmbeddingProviderConfig) => void;
  externalErrorMessage: string | null;
}

export function TranscriptionPageAnalysisRuntime({
  locale,
  analysisTab,
  onAnalysisTabChange,
  selectedUtterance,
  utterancesOnCurrentMedia,
  getUtteranceTextForLayer,
  formatTime,
  onJumpToCitation,
  onJumpToEmbeddingMatch,
  embeddingProviderConfig,
  onEmbeddingProviderConfigChange,
  externalErrorMessage,
}: TranscriptionPageAnalysisRuntimeProps) {
  const embeddingTasksHydratedRef = useRef(false);
  const taskRunner = useMemo(() => getGlobalTaskRunner(), []);
  const deferredEmbeddingRuntime = useMemo(
    () => createDeferredEmbeddingRuntime(() => embeddingProviderConfig, taskRunner),
    [embeddingProviderConfig, taskRunner],
  );

  useEffect(() => {
    saveEmbeddingProviderConfig(embeddingProviderConfig);
  }, [embeddingProviderConfig]);

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
    locale,
    enabled: analysisTab === 'embedding',
    taskRunner,
    embeddingService: deferredEmbeddingRuntime.embeddingService,
    embeddingSearchService: deferredEmbeddingRuntime.embeddingSearchService,
    selectedUtterance,
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    formatTime,
  });

  useEffect(() => {
    if (analysisTab !== 'embedding' || embeddingTasksHydratedRef.current) {
      return;
    }
    embeddingTasksHydratedRef.current = true;
    fireAndForget(refreshEmbeddingTasks());
  }, [analysisTab, refreshEmbeddingTasks]);

  const handleTestEmbeddingProvider = useMemo(
    () => async () => {
      const { testEmbeddingProvider } = await import('../ai/embeddings/EmbeddingProviderCatalog');
      return testEmbeddingProvider(embeddingProviderConfig);
    },
    [embeddingProviderConfig],
  );

  const embeddingContextValue = useEmbeddingContextValue({
    selectedUtterance,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError: aiEmbeddingLastError ?? externalErrorMessage,
    aiEmbeddingWarning,
    aiEmbeddingBuildStartedAt: null,
    embeddingProviderKind: embeddingProviderConfig.kind,
    embeddingProviderConfig,
    onSetEmbeddingProviderKind: (kind) => {
      onEmbeddingProviderConfigChange({ ...embeddingProviderConfig, kind });
    },
    onTestEmbeddingProvider: handleTestEmbeddingProvider,
    onBuildUtteranceEmbeddings: handleBuildUtteranceEmbeddings,
    onBuildNotesEmbeddings: handleBuildNotesEmbeddings,
    onBuildPdfEmbeddings: handleBuildPdfEmbeddings,
    onFindSimilarUtterances: handleFindSimilarUtterances,
    onRefreshEmbeddingTasks: refreshEmbeddingTasks,
    onJumpToEmbeddingMatch: onJumpToEmbeddingMatch,
    onJumpToCitation: onJumpToCitation,
    onCancelAiTask: handleCancelAiTask,
    onRetryAiTask: handleRetryAiTask,
  });

  return (
    <div className="transcription-hub-sidebar-panel-body">
      <EmbeddingProvider value={embeddingContextValue}>
        <AiAnalysisPanel isCollapsed={false} activeTab={analysisTab} onChangeActiveTab={onAnalysisTabChange} />
      </EmbeddingProvider>
    </div>
  );
}