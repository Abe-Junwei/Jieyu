import type { Dispatch, SetStateAction } from 'react';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { UtteranceDocType } from '../db';

interface SelectedRowMetaLike {
  rowNumber: number;
  start: number;
  end: number;
}

interface BuildTranscriptionAssistantContextValueInput {
  state: { phase: string; dbName?: string; utteranceCount?: number; translationLayerCount?: number };
  utterancesLength: number;
  translationLayersLength: number;
  aiConfidenceAvg: number | null;
  selectedTimelineOwnerUtterance: UtteranceDocType | null;
  selectedTimelineRowMeta: SelectedRowMetaLike | null;
  selectedAiWarning: boolean;
  lexemeMatches: AiPanelContextValue['lexemeMatches'];
  handleOpenWordNote: AiPanelContextValue['onOpenWordNote'];
  handleOpenMorphemeNote: AiPanelContextValue['onOpenMorphemeNote'];
  handleUpdateTokenPos: AiPanelContextValue['onUpdateTokenPos'];
  handleBatchUpdateTokenPosByForm: AiPanelContextValue['onBatchUpdateTokenPosByForm'];
  aiPanelMode: NonNullable<AiPanelContextValue['aiPanelMode']>;
  setAiPanelMode: Dispatch<SetStateAction<NonNullable<AiPanelContextValue['aiPanelMode']>>>;
  aiCurrentTask: AiPanelContextValue['aiCurrentTask'];
  aiVisibleCards: AiPanelContextValue['aiVisibleCards'];
  selectedTranslationGapCount: number;
  vadCacheStatus?: AiPanelContextValue['vadCacheStatus'];
  acousticSummary?: AiPanelContextValue['acousticSummary'];
  acousticInspector?: AiPanelContextValue['acousticInspector'];
  acousticDetail?: AiPanelContextValue['acousticDetail'];
  handleJumpToTranslationGap: NonNullable<AiPanelContextValue['onJumpToTranslationGap']>;
  handleJumpToAcousticHotspot?: AiPanelContextValue['onJumpToAcousticHotspot'];
}

export function buildTranscriptionAssistantContextValue(input: BuildTranscriptionAssistantContextValueInput): AiPanelContextValue {
  return {
    dbName: input.state.phase === 'ready' ? input.state.dbName ?? '' : '',
    utteranceCount: input.state.phase === 'ready'
      ? input.state.utteranceCount ?? input.utterancesLength
      : input.utterancesLength,
    translationLayerCount: input.state.phase === 'ready'
      ? input.state.translationLayerCount ?? input.translationLayersLength
      : input.translationLayersLength,
    aiConfidenceAvg: input.aiConfidenceAvg,
    selectedUtterance: input.selectedTimelineOwnerUtterance,
    selectedRowMeta: input.selectedTimelineRowMeta,
    selectedAiWarning: input.selectedAiWarning,
    lexemeMatches: input.lexemeMatches,
    aiPanelMode: input.aiPanelMode,
    selectedTranslationGapCount: input.selectedTranslationGapCount,
    ...(input.vadCacheStatus !== undefined ? { vadCacheStatus: input.vadCacheStatus } : {}),
    ...(input.acousticSummary !== undefined ? { acousticSummary: input.acousticSummary } : {}),
    ...(input.acousticInspector !== undefined ? { acousticInspector: input.acousticInspector } : {}),
    ...(input.acousticDetail !== undefined ? { acousticDetail: input.acousticDetail } : {}),
    onJumpToTranslationGap: input.handleJumpToTranslationGap,
    ...(input.handleJumpToAcousticHotspot ? { onJumpToAcousticHotspot: input.handleJumpToAcousticHotspot } : {}),
    onChangeAiPanelMode: input.setAiPanelMode,
    ...(input.handleOpenWordNote ? { onOpenWordNote: input.handleOpenWordNote } : {}),
    ...(input.handleOpenMorphemeNote ? { onOpenMorphemeNote: input.handleOpenMorphemeNote } : {}),
    ...(input.handleUpdateTokenPos ? { onUpdateTokenPos: input.handleUpdateTokenPos } : {}),
    ...(input.handleBatchUpdateTokenPosByForm ? { onBatchUpdateTokenPosByForm: input.handleBatchUpdateTokenPosByForm } : {}),
    ...(input.aiCurrentTask ? { aiCurrentTask: input.aiCurrentTask } : {}),
    ...(input.aiVisibleCards ? { aiVisibleCards: input.aiVisibleCards } : {}),
  };
}
