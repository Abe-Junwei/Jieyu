import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { TranscriptionPageAnalysisRuntimeProps, TranscriptionPageEmbeddingProviderConfig } from './TranscriptionPage.runtimeContracts';
import { createAnalysisRuntimeProps } from './TranscriptionPage.runtimeProps';

type UseTranscriptionAnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'panel'>;

interface UseTranscriptionAnalysisRuntimePropsInput {
  selectedUnit: LayerUnitDocType | null;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  handleJumpToCitation: (
    citationType: 'unit' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void>;
  handleJumpToEmbeddingMatch: (unitId: string) => void;
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
  setEmbeddingProviderConfig: Dispatch<SetStateAction<TranscriptionPageEmbeddingProviderConfig>>;
  aiSidebarError: string | null;
}

export function useTranscriptionAnalysisRuntimeProps(
  input: UseTranscriptionAnalysisRuntimePropsInput,
): UseTranscriptionAnalysisRuntimeProps {
  return useMemo(() => createAnalysisRuntimeProps({
    selectedUnit: input.selectedUnit,
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    getUnitTextForLayer: input.getUnitTextForLayer,
    formatTime: input.formatTime,
    onJumpToCitation: input.handleJumpToCitation,
    onJumpToEmbeddingMatch: input.handleJumpToEmbeddingMatch,
    embeddingProviderConfig: input.embeddingProviderConfig,
    onEmbeddingProviderConfigChange: input.setEmbeddingProviderConfig,
    externalErrorMessage: input.aiSidebarError,
  }), [
    input.aiSidebarError,
    input.embeddingProviderConfig,
    input.formatTime,
    input.getUnitTextForLayer,
    input.handleJumpToCitation,
    input.handleJumpToEmbeddingMatch,
    input.selectedUnit,
    input.setEmbeddingProviderConfig,
    input.unitsOnCurrentMedia,
  ]);
}
