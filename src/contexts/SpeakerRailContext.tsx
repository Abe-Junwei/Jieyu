/**
 * SpeakerRailContext - 说话人管理 Context
 *
 * 将 SidePaneSidebar 所需的 17+ speaker 相关 props 封装为 Context，
 * 避免在 TranscriptionPage → SidePaneSidebar 链路上逐层透传。
 *
 * SpeakerRailProvider 接收 TranscriptionPage 中 useSpeakerActions 的返回值，
 * 原样透传为 context value，不自行管理状态（避免与 TranscriptionPage 状态重复）。
 */

import { createContext, useContext, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SpeakerDocType } from '../db';
import { createLogger } from '../observability/logger';
import {
  EMPTY_SPEAKER_REFERENCE_STATS,
  type SpeakerActionDialogState,
  type SpeakerFilterOption,
  type SpeakerReferenceStats,
  type SpeakerVisual,
} from '../hooks/speakerManagement/types';
import type { UseSpeakerActionsReturn } from '../hooks/speakerManagement/useSpeakerActions';

// ── Context Value Type ────────────────────────────────────────────────────────

export interface SpeakerRailContextValue {
  // Data
  speakerOptions: SpeakerDocType[];
  speakerFilterOptions: SpeakerFilterOption[];
  speakerReferenceStats: Record<string, SpeakerReferenceStats>;
  speakerReferenceUnassignedStats: SpeakerReferenceStats;
  speakerReferenceStatsMediaScoped: boolean;
  speakerReferenceStatsReady: boolean;
  speakerDialogState: SpeakerActionDialogState | null;
  speakerVisualByUnitId: Record<string, SpeakerVisual>;
  selectedUnitIds: Set<string>;
  selectedSpeakerSummary: string;
  speakerSaving: boolean;
  // State setters
  speakerDraftName: string;
  setSpeakerDraftName: Dispatch<SetStateAction<string>>;
  batchSpeakerId: string;
  setBatchSpeakerId: Dispatch<SetStateAction<string>>;
  activeSpeakerFilterKey: string;
  setActiveSpeakerFilterKey: Dispatch<SetStateAction<string>>;
  // Actions
  handleSelectSpeakerUnits: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteUnusedSpeakers: () => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  handleCreateSpeakerOnly: () => Promise<void>;
  closeSpeakerDialog: () => void;
  updateSpeakerDialogDraftName: (value: string) => void;
  updateSpeakerDialogTargetKey: (speakerKey: string) => void;
  confirmSpeakerDialog: () => Promise<void>;
}

// ── Context Setup ─────────────────────────────────────────────────────────────

const SpeakerRailContext = createContext<SpeakerRailContextValue | null>(null);

const log = createLogger('SpeakerRailContext');
const MISSING_PROVIDER_MESSAGE =
  'SpeakerRailProvider is missing. SidePaneSidebar speaker actions are unavailable.';

let hasLoggedMissingProvider = false;

function reportMissingProvider(): void {
  if (hasLoggedMissingProvider) return;
  hasLoggedMissingProvider = true;
  log.error(MISSING_PROVIDER_MESSAGE, {
    hint: 'Wrap SidePaneSidebar with SpeakerRailProvider.',
  });
}

function createMissingProviderError(action: string): Error {
  return new Error(`${MISSING_PROVIDER_MESSAGE} attempt: ${action}.`);
}

function failMissingProvider(action: string): never {
  reportMissingProvider();
  throw createMissingProviderError(action);
}

function createMissingProviderSetter<T>(action: string): Dispatch<SetStateAction<T>> {
  return () => {
    failMissingProvider(action);
  };
}

function createMissingProviderAction(action: string): () => void {
  return () => failMissingProvider(action);
}

function createMissingProviderAsyncAction(action: string): () => Promise<void> {
  return async () => failMissingProvider(action);
}

export function resetSpeakerRailContextDiagnosticsForTests(): void {
  hasLoggedMissingProvider = false;
}

const fallbackSpeakerRailContext: SpeakerRailContextValue = {
  speakerOptions: [],
  speakerFilterOptions: [],
  speakerReferenceStats: {},
  speakerReferenceUnassignedStats: EMPTY_SPEAKER_REFERENCE_STATS,
  speakerReferenceStatsMediaScoped: false,
  speakerReferenceStatsReady: false,
  speakerDialogState: null,
  speakerVisualByUnitId: {},
  selectedUnitIds: new Set<string>(),
  selectedSpeakerSummary: '',
  speakerSaving: false,
  speakerDraftName: '',
  setSpeakerDraftName: createMissingProviderSetter<string>('setSpeakerDraftName'),
  batchSpeakerId: '',
  setBatchSpeakerId: createMissingProviderSetter<string>('setBatchSpeakerId'),
  activeSpeakerFilterKey: 'all',
  setActiveSpeakerFilterKey: createMissingProviderSetter<string>('setActiveSpeakerFilterKey'),
  handleSelectSpeakerUnits: createMissingProviderAction('handleSelectSpeakerUnits'),
  handleClearSpeakerAssignments: createMissingProviderAction('handleClearSpeakerAssignments'),
  handleExportSpeakerSegments: createMissingProviderAction('handleExportSpeakerSegments'),
  handleRenameSpeaker: createMissingProviderAction('handleRenameSpeaker'),
  handleMergeSpeaker: createMissingProviderAction('handleMergeSpeaker'),
  handleDeleteSpeaker: createMissingProviderAction('handleDeleteSpeaker'),
  handleDeleteUnusedSpeakers: createMissingProviderAsyncAction('handleDeleteUnusedSpeakers'),
  handleAssignSpeakerToSelected: createMissingProviderAsyncAction('handleAssignSpeakerToSelected'),
  handleAssignSpeakerToSelectedRouted: createMissingProviderAsyncAction(
    'handleAssignSpeakerToSelectedRouted',
  ),
  handleClearSpeakerOnSelectedRouted: createMissingProviderAsyncAction(
    'handleClearSpeakerOnSelectedRouted',
  ),
  handleCreateSpeakerAndAssign: createMissingProviderAsyncAction('handleCreateSpeakerAndAssign'),
  handleCreateSpeakerOnly: createMissingProviderAsyncAction('handleCreateSpeakerOnly'),
  closeSpeakerDialog: createMissingProviderAction('closeSpeakerDialog'),
  updateSpeakerDialogDraftName: createMissingProviderAction('updateSpeakerDialogDraftName'),
  updateSpeakerDialogTargetKey: createMissingProviderAction('updateSpeakerDialogTargetKey'),
  confirmSpeakerDialog: createMissingProviderAsyncAction('confirmSpeakerDialog'),
};

export function useSpeakerRailContext(): SpeakerRailContextValue {
  const ctx = useContext(SpeakerRailContext);
  if (!ctx) {
    reportMissingProvider();
    return fallbackSpeakerRailContext;
  }
  return ctx;
}

// ── Provider Props ────────────────────────────────────────────────────────────

type SpeakerRailProviderProps = {
  children: React.ReactNode;
  speakerManagement: Pick<
    UseSpeakerActionsReturn,
    | 'speakerOptions'
    | 'speakerDraftName'
    | 'setSpeakerDraftName'
    | 'batchSpeakerId'
    | 'setBatchSpeakerId'
    | 'speakerSaving'
    | 'activeSpeakerFilterKey'
    | 'setActiveSpeakerFilterKey'
    | 'speakerDialogState'
    | 'speakerVisualByUnitId'
    | 'speakerFilterOptions'
    | 'speakerReferenceStats'
    | 'speakerReferenceUnassignedStats'
    | 'speakerReferenceStatsMediaScoped'
    | 'speakerReferenceStatsReady'
    | 'selectedSpeakerSummary'
    | 'handleSelectSpeakerUnits'
    | 'handleClearSpeakerAssignments'
    | 'handleExportSpeakerSegments'
    | 'handleRenameSpeaker'
    | 'handleMergeSpeaker'
    | 'handleDeleteSpeaker'
    | 'handleDeleteUnusedSpeakers'
    | 'handleAssignSpeakerToSelected'
    | 'handleCreateSpeakerAndAssign'
    | 'handleCreateSpeakerOnly'
    | 'closeSpeakerDialog'
    | 'updateSpeakerDialogDraftName'
    | 'updateSpeakerDialogTargetKey'
    | 'confirmSpeakerDialog'
  >;
  selectedUnitIds: Set<string>;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
};

// ── Provider Implementation ───────────────────────────────────────────────────

export function SpeakerRailProvider({
  children,
  speakerManagement,
  handleAssignSpeakerToSelectedRouted,
  handleClearSpeakerOnSelectedRouted,
  selectedUnitIds,
}: SpeakerRailProviderProps) {
  // Depend on individual fields — callers often allocate a fresh `speakerManagement`
  // object each assemble; treating the wrapper as a dep churned context every render
  // and invalidated SidePane registered content memos (AppSidePane notify storms).
  const {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerDialogState,
    speakerVisualByUnitId,
    speakerFilterOptions,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    selectedSpeakerSummary,
    handleSelectSpeakerUnits,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    handleCreateSpeakerOnly,
    closeSpeakerDialog,
    updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey,
    confirmSpeakerDialog,
  } = speakerManagement;

  const value = useMemo<SpeakerRailContextValue>(
    () => ({
      speakerOptions,
      speakerDraftName,
      setSpeakerDraftName,
      batchSpeakerId,
      setBatchSpeakerId,
      speakerSaving,
      activeSpeakerFilterKey,
      setActiveSpeakerFilterKey,
      speakerDialogState,
      speakerVisualByUnitId,
      speakerFilterOptions,
      speakerReferenceStats,
      speakerReferenceUnassignedStats,
      speakerReferenceStatsMediaScoped,
      speakerReferenceStatsReady,
      selectedSpeakerSummary,
      selectedUnitIds,
      handleSelectSpeakerUnits,
      handleClearSpeakerAssignments,
      handleExportSpeakerSegments,
      handleRenameSpeaker,
      handleMergeSpeaker,
      handleDeleteSpeaker,
      handleDeleteUnusedSpeakers,
      handleAssignSpeakerToSelected,
      handleAssignSpeakerToSelectedRouted,
      handleClearSpeakerOnSelectedRouted,
      handleCreateSpeakerAndAssign,
      handleCreateSpeakerOnly,
      closeSpeakerDialog,
      updateSpeakerDialogDraftName,
      updateSpeakerDialogTargetKey,
      confirmSpeakerDialog,
    }),
    [
      activeSpeakerFilterKey,
      batchSpeakerId,
      closeSpeakerDialog,
      confirmSpeakerDialog,
      handleAssignSpeakerToSelected,
      handleAssignSpeakerToSelectedRouted,
      handleClearSpeakerAssignments,
      handleClearSpeakerOnSelectedRouted,
      handleCreateSpeakerAndAssign,
      handleCreateSpeakerOnly,
      handleDeleteSpeaker,
      handleDeleteUnusedSpeakers,
      handleExportSpeakerSegments,
      handleMergeSpeaker,
      handleRenameSpeaker,
      handleSelectSpeakerUnits,
      selectedSpeakerSummary,
      selectedUnitIds,
      setActiveSpeakerFilterKey,
      setBatchSpeakerId,
      setSpeakerDraftName,
      speakerDialogState,
      speakerDraftName,
      speakerFilterOptions,
      speakerOptions,
      speakerReferenceStats,
      speakerReferenceStatsMediaScoped,
      speakerReferenceStatsReady,
      speakerReferenceUnassignedStats,
      speakerSaving,
      speakerVisualByUnitId,
      updateSpeakerDialogDraftName,
      updateSpeakerDialogTargetKey,
    ],
  );

  return <SpeakerRailContext.Provider value={value}>{children}</SpeakerRailContext.Provider>;
}
