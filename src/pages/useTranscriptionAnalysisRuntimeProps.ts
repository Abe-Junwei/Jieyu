import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { UtteranceDocType } from '../db';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageEmbeddingProviderConfig,
} from './TranscriptionPage.runtimeContracts';
import { createAnalysisRuntimeProps } from './TranscriptionPage.runtimeProps';

type UseTranscriptionAnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'panel'>;

interface UseTranscriptionAnalysisRuntimePropsInput {
  selectedUnit: UtteranceDocType | null;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  handleJumpToCitation: (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void>;
  handleJumpToEmbeddingMatch: (utteranceId: string) => void;
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
  setEmbeddingProviderConfig: Dispatch<SetStateAction<TranscriptionPageEmbeddingProviderConfig>>;
  aiSidebarError: string | null;
}

export function useTranscriptionAnalysisRuntimeProps(
  input: UseTranscriptionAnalysisRuntimePropsInput,
): UseTranscriptionAnalysisRuntimeProps {
  return useMemo(() => createAnalysisRuntimeProps({
    selectedUnit: input.selectedUnit,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
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
    input.getUtteranceTextForLayer,
    input.handleJumpToCitation,
    input.handleJumpToEmbeddingMatch,
    input.selectedUnit,
    input.setEmbeddingProviderConfig,
    input.utterancesOnCurrentMedia,
  ]);
}
