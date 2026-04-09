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
  acousticRuntimeStatus?: AiPanelContextValue['acousticRuntimeStatus'];
  acousticSummary?: AiPanelContextValue['acousticSummary'];
  acousticInspector?: AiPanelContextValue['acousticInspector'];
  pinnedInspector?: AiPanelContextValue['pinnedInspector'];
  selectedHotspotTimeSec?: AiPanelContextValue['selectedHotspotTimeSec'];
  acousticDetail?: AiPanelContextValue['acousticDetail'];
  acousticDetailFullMedia?: AiPanelContextValue['acousticDetailFullMedia'];
  acousticBatchDetails?: AiPanelContextValue['acousticBatchDetails'];
  acousticBatchSelectionCount?: AiPanelContextValue['acousticBatchSelectionCount'];
  acousticBatchDroppedSelectionRanges?: AiPanelContextValue['acousticBatchDroppedSelectionRanges'];
  acousticCalibrationStatus?: AiPanelContextValue['acousticCalibrationStatus'];
  handleJumpToTranslationGap: NonNullable<AiPanelContextValue['onJumpToTranslationGap']>;
  handleJumpToAcousticHotspot?: AiPanelContextValue['onJumpToAcousticHotspot'];
  handlePinInspector?: AiPanelContextValue['onPinInspector'];
  handleClearPinnedInspector?: AiPanelContextValue['onClearPinnedInspector'];
  handleSelectHotspot?: AiPanelContextValue['onSelectHotspot'];
  handleChangeAcousticConfig?: AiPanelContextValue['onChangeAcousticConfig'];
  handleResetAcousticConfig?: AiPanelContextValue['onResetAcousticConfig'];
  handleChangeAcousticProvider?: AiPanelContextValue['onChangeAcousticProvider'];
  handleRefreshAcousticProviderState?: AiPanelContextValue['onRefreshAcousticProviderState'];
  acousticConfigOverride?: AiPanelContextValue['acousticConfigOverride'];
  acousticProviderPreference?: AiPanelContextValue['acousticProviderPreference'];
  acousticProviderState?: AiPanelContextValue['acousticProviderState'];
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
    ...(input.acousticRuntimeStatus !== undefined ? { acousticRuntimeStatus: input.acousticRuntimeStatus } : {}),
    ...(input.acousticSummary !== undefined ? { acousticSummary: input.acousticSummary } : {}),
    ...(input.acousticInspector !== undefined ? { acousticInspector: input.acousticInspector } : {}),
    ...(input.pinnedInspector !== undefined ? { pinnedInspector: input.pinnedInspector } : {}),
    ...(input.selectedHotspotTimeSec !== undefined ? { selectedHotspotTimeSec: input.selectedHotspotTimeSec } : {}),
    ...(input.acousticDetail !== undefined ? { acousticDetail: input.acousticDetail } : {}),
    ...(input.acousticDetailFullMedia !== undefined ? { acousticDetailFullMedia: input.acousticDetailFullMedia } : {}),
    ...(input.acousticBatchDetails !== undefined ? { acousticBatchDetails: input.acousticBatchDetails } : {}),
    ...(input.acousticBatchSelectionCount !== undefined ? { acousticBatchSelectionCount: input.acousticBatchSelectionCount } : {}),
    ...(input.acousticBatchDroppedSelectionRanges !== undefined ? { acousticBatchDroppedSelectionRanges: input.acousticBatchDroppedSelectionRanges } : {}),
    ...(input.acousticCalibrationStatus !== undefined ? { acousticCalibrationStatus: input.acousticCalibrationStatus } : {}),
    ...(input.acousticConfigOverride !== undefined ? { acousticConfigOverride: input.acousticConfigOverride } : {}),
    ...(input.acousticProviderPreference !== undefined ? { acousticProviderPreference: input.acousticProviderPreference } : {}),
    ...(input.acousticProviderState !== undefined ? { acousticProviderState: input.acousticProviderState } : {}),
    onJumpToTranslationGap: input.handleJumpToTranslationGap,
    ...(input.handleJumpToAcousticHotspot ? { onJumpToAcousticHotspot: input.handleJumpToAcousticHotspot } : {}),
    ...(input.handlePinInspector ? { onPinInspector: input.handlePinInspector } : {}),
    ...(input.handleClearPinnedInspector ? { onClearPinnedInspector: input.handleClearPinnedInspector } : {}),
    ...(input.handleSelectHotspot ? { onSelectHotspot: input.handleSelectHotspot } : {}),
    ...(input.handleChangeAcousticConfig ? { onChangeAcousticConfig: input.handleChangeAcousticConfig } : {}),
    ...(input.handleResetAcousticConfig ? { onResetAcousticConfig: input.handleResetAcousticConfig } : {}),
    ...(input.handleChangeAcousticProvider ? { onChangeAcousticProvider: input.handleChangeAcousticProvider } : {}),
    ...(input.handleRefreshAcousticProviderState ? { onRefreshAcousticProviderState: input.handleRefreshAcousticProviderState } : {}),
    onChangeAiPanelMode: input.setAiPanelMode,
    ...(input.handleOpenWordNote ? { onOpenWordNote: input.handleOpenWordNote } : {}),
    ...(input.handleOpenMorphemeNote ? { onOpenMorphemeNote: input.handleOpenMorphemeNote } : {}),
    ...(input.handleUpdateTokenPos ? { onUpdateTokenPos: input.handleUpdateTokenPos } : {}),
    ...(input.handleBatchUpdateTokenPosByForm ? { onBatchUpdateTokenPosByForm: input.handleBatchUpdateTokenPosByForm } : {}),
    ...(input.aiCurrentTask ? { aiCurrentTask: input.aiCurrentTask } : {}),
    ...(input.aiVisibleCards ? { aiVisibleCards: input.aiVisibleCards } : {}),
  };
}
