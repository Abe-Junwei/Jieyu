import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ActionableRecommendation, UseAiPanelLogicInput } from '../hooks/ai/useAiPanelLogic';
import type { Locale } from '../i18n';
import type { SaveState } from '../hooks/useTranscriptionData';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/transcription/useTimelineUnitViewIndex';

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
import { useAiPanelLogic } from '../hooks/ai/useAiPanelLogic';

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
  setAiPanelContext: ReturnType<
    typeof import('../contexts/AiPanelContext').useAiPanelContextUpdater
  >;
  aiPanelMode: 'auto' | 'all';
  setAiPanelMode: Dispatch<SetStateAction<'auto' | 'all'>>;
  aiSidebarError: string | null;
  setAiSidebarError: Dispatch<SetStateAction<string | null>>;
  embeddingProviderConfig: ReturnType<
    typeof import('./TranscriptionPage.helpers').loadEmbeddingProviderConfig
  >;
  setEmbeddingProviderConfig: Dispatch<
    SetStateAction<
      ReturnType<typeof import('./TranscriptionPage.helpers').loadEmbeddingProviderConfig>
    >
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
