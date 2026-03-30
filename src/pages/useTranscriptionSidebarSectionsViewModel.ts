import { useEffect, useMemo } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { TranscriptionPageAiSidebarProps } from './TranscriptionPage.AiSidebar';
import type { TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.AnalysisRuntime';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.AssistantRuntime';
import type { TranscriptionPageDialogsProps } from './TranscriptionPage.Dialogs';
import { buildTranscriptionAssistantStatusSummary } from './transcriptionAssistantStatusSummary';

export interface UseTranscriptionSidebarSectionsViewModelInput {
  locale: string;
  isAiPanelCollapsed: boolean;
  hubSidebarTab: 'assistant' | 'analysis';
  setHubSidebarTab: (tab: 'assistant' | 'analysis') => void;
  aiChatContextValue: AiChatContextValue;
  analysisTab: AnalysisBottomTab;
  setAnalysisTab: (tab: AnalysisBottomTab) => void;
  assistantRuntimeProps: Omit<TranscriptionPageAssistantRuntimeProps, 'locale' | 'aiChatContextValue'>;
  analysisRuntimeProps: Omit<TranscriptionPageAnalysisRuntimeProps, 'locale' | 'analysisTab' | 'onAnalysisTabChange'>;
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
  handleProjectSetupSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string }) => Promise<void>;
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
  useEffect(() => {
    if (input.aiChatContextValue.aiPendingToolCall && input.hubSidebarTab !== 'assistant') {
      input.setHubSidebarTab('assistant');
    }
  }, [input.aiChatContextValue.aiPendingToolCall, input.hubSidebarTab, input.setHubSidebarTab]);

  const aiSidebarProps = useMemo<TranscriptionPageAiSidebarProps>(() => ({
    locale: input.locale,
    isAiPanelCollapsed: input.isAiPanelCollapsed,
    hubSidebarTab: input.hubSidebarTab,
    onHubSidebarTabChange: input.setHubSidebarTab,
    aiChatContextValue: input.aiChatContextValue,
    analysisTab: input.analysisTab,
    onAnalysisTabChange: input.setAnalysisTab,
    assistantRuntimeProps: input.assistantRuntimeProps,
    analysisRuntimeProps: input.analysisRuntimeProps,
    assistantAttentionCount: countAssistantAttentionSignals({
      hasPendingToolCall: Boolean(input.aiChatContextValue.aiPendingToolCall),
      selectedAiWarning: input.selectedAiWarning,
      selectedTranslationGapCount: input.selectedTranslationGapCount,
      aiSidebarError: input.aiSidebarError,
    }),
    assistantStatusSummary: buildTranscriptionAssistantStatusSummary({
      locale: input.locale,
      aiChatContextValue: {
        aiPendingToolCall: input.aiChatContextValue.aiPendingToolCall,
        aiTaskSession: input.aiChatContextValue.aiTaskSession,
        aiInteractionMetrics: input.aiChatContextValue.aiInteractionMetrics,
        aiToolDecisionLogs: input.aiChatContextValue.aiToolDecisionLogs,
      },
      selectedAiWarning: input.selectedAiWarning,
      selectedTranslationGapCount: input.selectedTranslationGapCount,
      aiSidebarError: input.aiSidebarError,
    }),
  }), [input]);

  const dialogsProps = useMemo<TranscriptionPageDialogsProps>(() => ({
    speakerDialogState: input.speakerDialogState,
    speakerSaving: input.speakerSaving,
    onCloseSpeakerDialog: input.closeSpeakerDialog,
    onConfirmSpeakerDialog: input.confirmSpeakerDialog,
    onDraftNameChange: input.updateSpeakerDialogDraftName,
    onTargetSpeakerChange: input.updateSpeakerDialogTargetKey,
    showProjectSetup: input.showProjectSetup,
    onCloseProjectSetup: () => input.setShowProjectSetup(false),
    onSubmitProjectSetup: input.handleProjectSetupSubmit,
    showAudioImport: input.showAudioImport,
    onCloseAudioImport: () => input.setShowAudioImport(false),
    onImportAudio: input.handleAudioImport,
    mediaFileInputRef: input.mediaFileInputRef,
    onDirectMediaImport: input.handleDirectMediaImport,
    audioDeleteConfirm: input.audioDeleteConfirm,
    onCancelAudioDelete: () => input.setAudioDeleteConfirm(null),
    onConfirmAudioDelete: input.handleConfirmAudioDelete,
    projectDeleteConfirm: input.projectDeleteConfirm,
    onCancelProjectDelete: () => input.setProjectDeleteConfirm(false),
    onConfirmProjectDelete: input.handleConfirmProjectDelete,
    showShortcuts: input.showShortcuts,
    onCloseShortcuts: input.closeShortcuts,
    isFocusMode: input.isFocusMode,
    onExitFocusMode: input.exitFocusMode,
  }), [input]);

  return {
    aiSidebarProps,
    dialogsProps,
  };
}