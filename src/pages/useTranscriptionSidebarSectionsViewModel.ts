import { useEffect, useMemo } from 'react';
import type { TranscriptionPageAiSidebarProps } from './TranscriptionPage.AiSidebar';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageAssistantRuntimeProps,
} from './TranscriptionPage.runtimeContracts';
import type { TranscriptionPageDialogsProps } from './TranscriptionPage.Dialogs';

export interface UseTranscriptionSidebarSectionsViewModelInput {
  locale: string;
  isAiPanelCollapsed: boolean;
  hubSidebarTab: 'assistant' | 'analysis';
  setHubSidebarTab: (tab: 'assistant' | 'analysis') => void;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
  analysisRuntimeProps: TranscriptionPageAnalysisRuntimeProps;
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiSidebarError: string | null;
  speakerDialogState: TranscriptionPageDialogsProps['speakerDialogState'];
  speakerSaving: boolean;
  closeSpeakerDialog: () => void;
  confirmSpeakerDialog: () => Promise<void>;
  updateSpeakerDialogDraftName: (name: string) => void;
  updateSpeakerDialogTargetKey: (key: string) => void;
  showProjectSetup: boolean;
  setShowProjectSetup: (value: boolean) => void;
  handleProjectSetupSubmit: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
  showAudioImport: boolean;
  setShowAudioImport: (value: boolean) => void;
  handleAudioImport: (file: File, duration: number) => Promise<void>;
  mediaFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDirectMediaImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  audioDeleteConfirm: { filename: string } | null;
  setAudioDeleteConfirm: (value: { filename: string } | null) => void;
  handleConfirmAudioDelete: () => void;
  projectDeleteConfirm: boolean;
  setProjectDeleteConfirm: (value: boolean) => void;
  handleConfirmProjectDelete: () => void;
  showShortcuts: boolean;
  closeShortcuts: () => void;
  isFocusMode: boolean;
  exitFocusMode: () => void;
}

interface UseTranscriptionSidebarSectionsViewModelResult {
  aiSidebarProps: TranscriptionPageAiSidebarProps;
  dialogsProps: TranscriptionPageDialogsProps;
}

export function countAssistantAttentionSignals(input: {
  hasPendingToolCall: boolean;
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiSidebarError: string | null;
}): number {
  return Number(input.hasPendingToolCall)
    + Number(input.selectedAiWarning)
    + Number(input.selectedTranslationGapCount > 0)
    + Number(Boolean(input.aiSidebarError?.trim()));
}

export function useTranscriptionSidebarSectionsViewModel(
  input: UseTranscriptionSidebarSectionsViewModelInput,
): UseTranscriptionSidebarSectionsViewModelResult {
  const {
    locale,
    isAiPanelCollapsed,
    hubSidebarTab,
    setHubSidebarTab,
    assistantRuntimeProps,
    analysisRuntimeProps,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiSidebarError,
    speakerDialogState,
    speakerSaving,
    closeSpeakerDialog,
    confirmSpeakerDialog,
    updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey,
    showProjectSetup,
    setShowProjectSetup,
    handleProjectSetupSubmit,
    showAudioImport,
    setShowAudioImport,
    handleAudioImport,
    mediaFileInputRef,
    handleDirectMediaImport,
    audioDeleteConfirm,
    setAudioDeleteConfirm,
    handleConfirmAudioDelete,
    projectDeleteConfirm,
    setProjectDeleteConfirm,
    handleConfirmProjectDelete,
    showShortcuts,
    closeShortcuts,
    isFocusMode,
    exitFocusMode,
  } = input;

  useEffect(() => {
    if (assistantRuntimeProps.aiChatContextValue.aiPendingToolCall && hubSidebarTab !== 'assistant') {
      setHubSidebarTab('assistant');
    }
  }, [assistantRuntimeProps.aiChatContextValue.aiPendingToolCall, hubSidebarTab, setHubSidebarTab]);

  const aiSidebarProps = useMemo<TranscriptionPageAiSidebarProps>(() => ({
    locale,
    isAiPanelCollapsed,
    hubSidebarTab,
    onHubSidebarTabChange: setHubSidebarTab,
    assistantRuntimeProps,
    analysisRuntimeProps,
    assistantAttentionCount: countAssistantAttentionSignals({
      hasPendingToolCall: Boolean(assistantRuntimeProps.aiChatContextValue.aiPendingToolCall),
      selectedAiWarning,
      selectedTranslationGapCount,
      aiSidebarError,
    }),
  }), [analysisRuntimeProps, aiSidebarError, assistantRuntimeProps, hubSidebarTab, isAiPanelCollapsed, locale, selectedAiWarning, selectedTranslationGapCount, setHubSidebarTab]);

  const dialogsProps = useMemo<TranscriptionPageDialogsProps>(() => ({
    locale,
    speakerDialogState,
    speakerSaving,
    onCloseSpeakerDialog: closeSpeakerDialog,
    onConfirmSpeakerDialog: confirmSpeakerDialog,
    onDraftNameChange: updateSpeakerDialogDraftName,
    onTargetSpeakerChange: updateSpeakerDialogTargetKey,
    showProjectSetup,
    onCloseProjectSetup: () => setShowProjectSetup(false),
    onSubmitProjectSetup: handleProjectSetupSubmit,
    showAudioImport,
    onCloseAudioImport: () => setShowAudioImport(false),
    onImportAudio: handleAudioImport,
    mediaFileInputRef,
    onDirectMediaImport: handleDirectMediaImport,
    audioDeleteConfirm,
    onCancelAudioDelete: () => setAudioDeleteConfirm(null),
    onConfirmAudioDelete: handleConfirmAudioDelete,
    projectDeleteConfirm,
    onCancelProjectDelete: () => setProjectDeleteConfirm(false),
    onConfirmProjectDelete: handleConfirmProjectDelete,
    showShortcuts,
    onCloseShortcuts: closeShortcuts,
    isFocusMode,
    onExitFocusMode: exitFocusMode,
  }), [audioDeleteConfirm, closeShortcuts, closeSpeakerDialog, confirmSpeakerDialog, exitFocusMode, handleAudioImport, handleConfirmAudioDelete, handleConfirmProjectDelete, handleDirectMediaImport, handleProjectSetupSubmit, isFocusMode, locale, mediaFileInputRef, projectDeleteConfirm, setAudioDeleteConfirm, setProjectDeleteConfirm, setShowAudioImport, setShowProjectSetup, showAudioImport, showProjectSetup, showShortcuts, speakerDialogState, speakerSaving, updateSpeakerDialogDraftName, updateSpeakerDialogTargetKey]);

  return {
    aiSidebarProps,
    dialogsProps,
  };
}