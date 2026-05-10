import { useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { useAiPanelContextUpdater } from '../contexts/AiPanelContext';
import {
  useAiPanelLogic,
  type ActionableRecommendation,
  type UseAiPanelLogicInput,
} from '../hooks/useAiPanelLogic';
import type { Locale } from '../i18n';
import type { SaveState } from '../hooks/useTranscriptionData';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';

import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import type {
  BuildTranscriptionSelectionSnapshotInput,
  TranscriptionSelectionSnapshot,
} from './transcriptionSelectionSnapshot';
import type {
  SpectrogramHoverReadout,
  WaveformHoverReadout,
} from './transcriptionWaveformBridge.types';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { useReadyWorkspaceLayoutDerivations } from './useReadyWorkspaceLayoutDerivations';
import { useReadyWorkspaceObserverRecommendationExecutor } from './useReadyWorkspaceObserverRecommendationExecutor';
import { useTranscriptionAcousticPanelState } from './useTranscriptionAcousticPanelState';
import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';

type SelectionSnapshotInputSansPrimary = Omit<
  BuildTranscriptionSelectionSnapshotInput,
  'primaryUnitView'
>;

type SelectionAndAiPrepExtras = {
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  locale: Locale;
  units: UseAiPanelLogicInput['units'];
  unitsOnCurrentMedia: Array<{ endTime?: number }>;
  selectedTimelineMedia: { id: string } | null | undefined;
  getUnitDocById: (id: string) => NonNullable<UseAiPanelLogicInput['selectedUnit']> | undefined;
  player: { instanceRef: RefObject<{ getWidth?: () => number } | null> };
  handleExecuteRecommendation: (match: ActionableRecommendation) => void | Promise<void>;
  translationLayers: UseAiPanelLogicInput['translationLayers'];
  translationDrafts: UseAiPanelLogicInput['translationDrafts'];
  translationTextByLayer: UseAiPanelLogicInput['translationTextByLayer'];
  selectUnit: UseAiPanelLogicInput['selectUnit'];
  setSaveState: (s: SaveState) => void;
  selectedMediaUrl?: string | null;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
};

export type UseReadyWorkspaceSelectionAndAiPrepPhaseParams = SelectionSnapshotInputSansPrimary &
  SelectionAndAiPrepExtras;

export interface UseReadyWorkspaceSelectionAndAiPrepPhaseResult {
  selectionSnapshot: TranscriptionSelectionSnapshot;
  setAiPanelContext: ReturnType<typeof useAiPanelContextUpdater>;
  aiPanelMode: 'auto' | 'all';
  setAiPanelMode: Dispatch<SetStateAction<'auto' | 'all'>>;
  aiSidebarError: string | null;
  setAiSidebarError: Dispatch<SetStateAction<string | null>>;
  embeddingProviderConfig: ReturnType<typeof loadEmbeddingProviderConfig>;
  setEmbeddingProviderConfig: Dispatch<
    SetStateAction<ReturnType<typeof loadEmbeddingProviderConfig>>
  >;
  acousticProviderPreference: string | null;
  setAcousticProviderPreference: Dispatch<SetStateAction<string | null>>;
  deferredAiRuntime: ReturnType<typeof useDeferredAiRuntimeBridge>['deferredAiRuntime'];
  deferredAiRuntimeForSidebar: ReturnType<
    typeof useDeferredAiRuntimeBridge
  >['deferredAiRuntimeForSidebar'];
  setDeferredAiRuntime: ReturnType<typeof useDeferredAiRuntimeBridge>['setDeferredAiRuntime'];
  handleDeferredAiRuntimeChange: ReturnType<
    typeof useDeferredAiRuntimeBridge
  >['handleDeferredAiRuntimeChange'];
  flushDeferredAiRuntime: ReturnType<typeof useDeferredAiRuntimeBridge>['flushDeferredAiRuntime'];
  hiddenByMediaFilterCount: number;
  selectedUnitForAiPanelLogic: ReturnType<
    typeof useReadyWorkspaceLayoutDerivations
  >['selectedUnitForAiPanelLogic'];
  aiChatForSidebar: ReturnType<typeof useReadyWorkspaceLayoutDerivations>['aiChatForSidebar'];
  playerInstanceGetWidth: ReturnType<
    typeof useReadyWorkspaceLayoutDerivations
  >['playerInstanceGetWidth'];
  lexemeMatches: ReturnType<typeof useAiPanelLogic>['lexemeMatches'];
  observerResult: ReturnType<typeof useAiPanelLogic>['observerResult'];
  actionableObserverRecommendations: ReturnType<
    typeof useAiPanelLogic
  >['actionableObserverRecommendations'];
  selectedAiWarning: ReturnType<typeof useAiPanelLogic>['selectedAiWarning'];
  selectedTranslationGapCount: ReturnType<typeof useAiPanelLogic>['selectedTranslationGapCount'];
  aiCurrentTask: ReturnType<typeof useAiPanelLogic>['aiCurrentTask'];
  aiVisibleCards: ReturnType<typeof useAiPanelLogic>['aiVisibleCards'];
  vadCacheStatus: ReturnType<typeof useAiPanelLogic>['vadCacheStatus'];
  handleJumpToTranslationGap: ReturnType<typeof useAiPanelLogic>['handleJumpToTranslationGap'];
  handleExecuteObserverRecommendation: ReturnType<
    typeof useReadyWorkspaceObserverRecommendationExecutor
  >;
  waveformAcousticRuntimeStatus: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['waveformAcousticRuntimeStatus'];
  waveformVadCacheStatus: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['waveformVadCacheStatus'];
  pinnedInspector: ReturnType<typeof useTranscriptionAcousticPanelState>['pinnedInspector'];
  selectedHotspotTimeSec: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['selectedHotspotTimeSec'];
  acousticConfigOverride: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['acousticConfigOverride'];
  acousticInspector: ReturnType<typeof useTranscriptionAcousticPanelState>['acousticInspector'];
  handlePinInspector: ReturnType<typeof useTranscriptionAcousticPanelState>['handlePinInspector'];
  handleClearPinnedInspector: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['handleClearPinnedInspector'];
  handleSelectHotspot: ReturnType<typeof useTranscriptionAcousticPanelState>['handleSelectHotspot'];
  handleChangeAcousticConfig: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['handleChangeAcousticConfig'];
  handleResetAcousticConfig: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['handleResetAcousticConfig'];
  handleChangeAcousticProvider: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['handleChangeAcousticProvider'];
  handleRefreshAcousticProviderState: ReturnType<
    typeof useTranscriptionAcousticPanelState
  >['handleRefreshAcousticProviderState'];
}

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
