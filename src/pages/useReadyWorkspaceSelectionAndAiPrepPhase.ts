import { useState } from 'react';

import { useAiPanelContextUpdater } from '../contexts/AiPanelContext';
import { useAiPanelLogic } from '../hooks/ai/useAiPanelLogic';

import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { useReadyWorkspaceLayoutDerivations } from './useReadyWorkspaceLayoutDerivations';
import { useReadyWorkspaceObserverRecommendationExecutor } from './useReadyWorkspaceObserverRecommendationExecutor';
import { useTranscriptionAcousticPanelState } from './useTranscriptionAcousticPanelState';
import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';

import type {
  UseReadyWorkspaceSelectionAndAiPrepPhaseParams,
  UseReadyWorkspaceSelectionAndAiPrepPhaseResult,
} from './useReadyWorkspaceSelectionAndAiPrepPhase.types';

export type {
  UseReadyWorkspaceSelectionAndAiPrepPhaseParams,
  UseReadyWorkspaceSelectionAndAiPrepPhaseResult,
};

/** L8：选区快照 + AI 侧栏 / 延迟 runtime + layout 派生 + AI panel + observer 执行器 + 声学面板 */
export function useReadyWorkspaceSelectionAndAiPrepPhase(
  params: UseReadyWorkspaceSelectionAndAiPrepPhaseParams,
): UseReadyWorkspaceSelectionAndAiPrepPhaseResult {
  const {
    timelineUnitViewIndex,
    locale,
    units,
    unitsOnCurrentMedia,
    selectedTimelineMedia,
    getUnitDocById,
    player,
    handleExecuteRecommendation,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    selectUnit,
    setSaveState,
    selectedMediaUrl,
    waveformHoverReadout,
    spectrogramHoverReadout,
    ...selectionSansPrimary
  } = params;

  const primaryUnitView = selectionSansPrimary.selectedTimelineUnit
    ? (timelineUnitViewIndex.resolveBySemanticId(
        selectionSansPrimary.selectedTimelineUnit.unitId,
      ) ?? null)
    : null;

  const selectionSnapshot = useTranscriptionSelectionSnapshot({
    ...selectionSansPrimary,
    primaryUnitView,
  });

  const setAiPanelContext = useAiPanelContextUpdater();
  const [aiPanelMode, setAiPanelMode] = useState<'auto' | 'all'>('auto');
  const [aiSidebarError, setAiSidebarError] = useState<string | null>(null);
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState(() =>
    loadEmbeddingProviderConfig(),
  );
  const [acousticProviderPreference, setAcousticProviderPreference] = useState<string | null>(null);
  const {
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
  } = useDeferredAiRuntimeBridge();

  const {
    hiddenByMediaFilterCount,
    selectedUnitForAiPanelLogic,
    aiChatForSidebar,
    playerInstanceGetWidth,
  } = useReadyWorkspaceLayoutDerivations({
    unitsOnCurrentMedia,
    selectedTimelineMediaId: selectedTimelineMedia?.id,
    unitsCount: units.length,
    selectionSnapshotSelectedUnit: selectionSnapshot.selectedUnit,
    getUnitDocById,
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    playerInstanceRef: player.instanceRef,
  });

  const {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    handleJumpToTranslationGap,
  } = useAiPanelLogic({
    locale,
    units,
    selectedUnit: selectedUnitForAiPanelLogic ?? undefined,
    selectedUnitText: selectionSnapshot.selectedText,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    aiChatConnectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    aiPanelMode,
    selectUnit,
    setSaveState,
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
  });

  const handleExecuteObserverRecommendation = useReadyWorkspaceObserverRecommendationExecutor({
    actionableObserverRecommendations,
    handleExecuteRecommendation,
  });

  const {
    waveformAcousticRuntimeStatus,
    waveformVadCacheStatus,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticConfigOverride,
    acousticInspector,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
  } = useTranscriptionAcousticPanelState({
    deferredAiRuntime,
    setDeferredAiRuntime,
    setAcousticProviderPreference,
    ...(selectedTimelineMedia?.id !== undefined
      ? { selectedTimelineMediaId: selectedTimelineMedia.id }
      : {}),
    ...(selectedMediaUrl !== undefined ? { selectedMediaUrl } : {}),
    waveformHoverReadout,
    spectrogramHoverReadout,
    acousticProviderPreference,
    vadCacheStatus,
  });

  return {
    selectionSnapshot,
    setAiPanelContext,
    aiPanelMode,
    setAiPanelMode,
    aiSidebarError,
    setAiSidebarError,
    embeddingProviderConfig,
    setEmbeddingProviderConfig,
    acousticProviderPreference,
    setAcousticProviderPreference,
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
    hiddenByMediaFilterCount,
    selectedUnitForAiPanelLogic,
    aiChatForSidebar,
    playerInstanceGetWidth,
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    handleJumpToTranslationGap,
    handleExecuteObserverRecommendation,
    waveformAcousticRuntimeStatus,
    waveformVadCacheStatus,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticConfigOverride,
    acousticInspector,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
  };
}
