/**
 * SpeakerRailContext - 说话人管理 Context
 *
 * 将 LayerRailSidebar 所需的 17+ speaker 相关 props 封装为 Context，
 * 避免在 TranscriptionPage → LayerRailSidebar 链路上逐层透传。
 *
 * SpeakerRailProvider 接收 TranscriptionPage 中 useSpeakerActions 的返回值，
 * 原样透传为 context value，不自行管理状态（避免与 TranscriptionPage 状态重复）。
 */

import { createContext, useContext, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SpeakerDocType } from '../db';
import { createLogger } from '../observability/logger';
import type { SpeakerActionDialogState, SpeakerFilterOption, SpeakerVisual } from '../hooks/speakerManagement/types';
import type { UseSpeakerActionsReturn } from '../hooks/useSpeakerActions';

// ── Context Value Type ────────────────────────────────────────────────────────

export type { SpeakerFilterOption, SpeakerActionDialogState };

export interface SpeakerRailContextValue {
  // Data
  speakerOptions: SpeakerDocType[];
  speakerFilterOptions: SpeakerFilterOption[];
  speakerDialogState: SpeakerActionDialogState | null;
  speakerVisualByUtteranceId: Record<string, SpeakerVisual>;
  selectedUtteranceIds: Set<string>;
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
  handleSelectSpeakerUtterances: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteSpeaker: (sourceSpeakerKey: string) => void;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  closeSpeakerDialog: () => void;
  updateSpeakerDialogDraftName: (value: string) => void;
  updateSpeakerDialogTargetKey: (speakerKey: string) => void;
  confirmSpeakerDialog: () => Promise<void>;
}

// ── Context Setup ─────────────────────────────────────────────────────────────

const SpeakerRailContext = createContext<SpeakerRailContextValue | null>(null);

const log = createLogger('SpeakerRailContext');
const MISSING_PROVIDER_MESSAGE = 'SpeakerRailProvider is missing. LayerRailSidebar speaker actions are unavailable.';

let hasLoggedMissingProvider = false;

function reportMissingProvider(): void {
  if (hasLoggedMissingProvider) return;
  hasLoggedMissingProvider = true;
  log.error(MISSING_PROVIDER_MESSAGE, {
    hint: 'Wrap LayerRailSidebar with SpeakerRailProvider.',
  });
}

function createMissingProviderError(action: string): Error {
  return new Error(`${MISSING_PROVIDER_MESSAGE} Attempted action: ${action}.`);
}

function failMissingProvider(action: string): never {
  reportMissingProvider();
  throw createMissingProviderError(action);
}

function createMissingProviderSetter<T>(action: string): Dispatch<SetStateAction<T>> {
  return (() => failMissingProvider(action)) as Dispatch<SetStateAction<T>>;
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
  speakerDialogState: null,
  speakerVisualByUtteranceId: {},
  selectedUtteranceIds: new Set<string>(),
  selectedSpeakerSummary: '',
  speakerSaving: false,
  speakerDraftName: '',
  setSpeakerDraftName: createMissingProviderSetter<string>('setSpeakerDraftName'),
  batchSpeakerId: '',
  setBatchSpeakerId: createMissingProviderSetter<string>('setBatchSpeakerId'),
  activeSpeakerFilterKey: 'all',
  setActiveSpeakerFilterKey: createMissingProviderSetter<string>('setActiveSpeakerFilterKey'),
  handleSelectSpeakerUtterances: createMissingProviderAction('handleSelectSpeakerUtterances'),
  handleClearSpeakerAssignments: createMissingProviderAction('handleClearSpeakerAssignments'),
  handleExportSpeakerSegments: createMissingProviderAction('handleExportSpeakerSegments'),
  handleRenameSpeaker: createMissingProviderAction('handleRenameSpeaker'),
  handleMergeSpeaker: createMissingProviderAction('handleMergeSpeaker'),
  handleDeleteSpeaker: createMissingProviderAction('handleDeleteSpeaker'),
  handleAssignSpeakerToSelected: createMissingProviderAsyncAction('handleAssignSpeakerToSelected'),
  handleCreateSpeakerAndAssign: createMissingProviderAsyncAction('handleCreateSpeakerAndAssign'),
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

interface SpeakerRailProviderProps {
  children: React.ReactNode;
  speakerManagement: Pick<UseSpeakerActionsReturn,
    | 'speakerOptions'
    | 'speakerDraftName'
    | 'setSpeakerDraftName'
    | 'batchSpeakerId'
    | 'setBatchSpeakerId'
    | 'speakerSaving'
    | 'activeSpeakerFilterKey'
    | 'setActiveSpeakerFilterKey'
    | 'speakerDialogState'
    | 'speakerVisualByUtteranceId'
    | 'speakerFilterOptions'
    | 'selectedSpeakerSummary'
    | 'handleSelectSpeakerUtterances'
    | 'handleClearSpeakerAssignments'
    | 'handleExportSpeakerSegments'
    | 'handleRenameSpeaker'
    | 'handleMergeSpeaker'
    | 'handleDeleteSpeaker'
    | 'handleAssignSpeakerToSelected'
    | 'handleCreateSpeakerAndAssign'
    | 'closeSpeakerDialog'
    | 'updateSpeakerDialogDraftName'
    | 'updateSpeakerDialogTargetKey'
    | 'confirmSpeakerDialog'
  > & {
    selectedUtteranceIds: Set<string>;
  };
}

// ── Provider Implementation ───────────────────────────────────────────────────

export function SpeakerRailProvider({ children, speakerManagement }: SpeakerRailProviderProps) {
  const value = useMemo<SpeakerRailContextValue>(() => ({
    speakerOptions: speakerManagement.speakerOptions,
    speakerDraftName: speakerManagement.speakerDraftName,
    setSpeakerDraftName: speakerManagement.setSpeakerDraftName,
    batchSpeakerId: speakerManagement.batchSpeakerId,
    setBatchSpeakerId: speakerManagement.setBatchSpeakerId,
    speakerSaving: speakerManagement.speakerSaving,
    activeSpeakerFilterKey: speakerManagement.activeSpeakerFilterKey,
    setActiveSpeakerFilterKey: speakerManagement.setActiveSpeakerFilterKey,
    speakerDialogState: speakerManagement.speakerDialogState,
    speakerVisualByUtteranceId: speakerManagement.speakerVisualByUtteranceId,
    speakerFilterOptions: speakerManagement.speakerFilterOptions,
    selectedSpeakerSummary: speakerManagement.selectedSpeakerSummary,
    selectedUtteranceIds: speakerManagement.selectedUtteranceIds,
    handleSelectSpeakerUtterances: speakerManagement.handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments: speakerManagement.handleClearSpeakerAssignments,
    handleExportSpeakerSegments: speakerManagement.handleExportSpeakerSegments,
    handleRenameSpeaker: speakerManagement.handleRenameSpeaker,
    handleMergeSpeaker: speakerManagement.handleMergeSpeaker,
    handleDeleteSpeaker: speakerManagement.handleDeleteSpeaker,
    handleAssignSpeakerToSelected: speakerManagement.handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign: speakerManagement.handleCreateSpeakerAndAssign,
    closeSpeakerDialog: speakerManagement.closeSpeakerDialog,
    updateSpeakerDialogDraftName: speakerManagement.updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey: speakerManagement.updateSpeakerDialogTargetKey,
    confirmSpeakerDialog: speakerManagement.confirmSpeakerDialog,
  }), [speakerManagement]);

  return (
    <SpeakerRailContext.Provider value={value}>
      {children}
    </SpeakerRailContext.Provider>
  );
}
