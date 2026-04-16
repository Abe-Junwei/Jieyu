import { useMemo } from 'react';
import type { EmbeddingContextValue } from '../contexts/EmbeddingContext';

export type EmbeddingContextSource = Partial<EmbeddingContextValue>;

export function pickEmbeddingContextValue(P: EmbeddingContextSource): EmbeddingContextValue {
  return {
    selectedUnit: P.selectedUnit ?? null,
    aiEmbeddingBusy: P.aiEmbeddingBusy ?? false,
    aiEmbeddingProgressLabel: P.aiEmbeddingProgressLabel ?? null,
    aiEmbeddingLastResult: P.aiEmbeddingLastResult ?? null,
    aiEmbeddingTasks: P.aiEmbeddingTasks ?? [],
    aiEmbeddingMatches: P.aiEmbeddingMatches ?? [],
    aiEmbeddingLastError: P.aiEmbeddingLastError ?? null,
    aiEmbeddingWarning: P.aiEmbeddingWarning ?? null,
    aiEmbeddingBuildStartedAt: P.aiEmbeddingBuildStartedAt ?? null,
    embeddingProviderKind: P.embeddingProviderKind ?? 'local',
    embeddingProviderConfig: P.embeddingProviderConfig,
    onSetEmbeddingProviderKind: P.onSetEmbeddingProviderKind,
    onTestEmbeddingProvider: P.onTestEmbeddingProvider,
    onBuildUnitEmbeddings: P.onBuildUnitEmbeddings,
    onBuildNotesEmbeddings: P.onBuildNotesEmbeddings,
    onBuildPdfEmbeddings: P.onBuildPdfEmbeddings,
    onFindSimilarUnits: P.onFindSimilarUnits,
    onRefreshEmbeddingTasks: P.onRefreshEmbeddingTasks,
    onJumpToEmbeddingMatch: P.onJumpToEmbeddingMatch,
    onJumpToCitation: P.onJumpToCitation,
    onCancelAiTask: P.onCancelAiTask,
    onRetryAiTask: P.onRetryAiTask,
  } as EmbeddingContextValue;
}

export function useEmbeddingContextValue(source: EmbeddingContextSource): EmbeddingContextValue {
  return useMemo(() => pickEmbeddingContextValue(source), [source]);
}
