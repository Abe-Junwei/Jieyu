import { useMemo } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { AiConversationManagementApi } from '../hooks/ai/aiConversationManager.types';
import type { UseTranscriptionRuntimePropsInput } from './useTranscriptionRuntimeProps';
import type {
  AssistantSidebarObserverRecommendationInput,
  UseTranscriptionAssistantSidebarControllerInput,
} from './useTranscriptionAssistantSidebarController';

export interface UseTranscriptionAssistantSidebarControllerInputArgs {
  locale: string;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
  currentPage?: AiChatContextValue['currentPage'];
  selectedUnit: AiChatContextValue['selectedUnit'];
  selectedRowMeta: AiChatContextValue['selectedRowMeta'];
  selectedUnitKind?: AiChatContextValue['selectedUnitKind'];
  selectedLayerType?: AiChatContextValue['selectedLayerType'];
  selectedText?: AiChatContextValue['selectedText'];
  selectedTimeRangeLabel?: AiChatContextValue['selectedTimeRangeLabel'];
  lexemeMatches: AiChatContextValue['lexemeMatches'];
  aiChat: {
    enabled: boolean;
    providerLabel: AiChatContextValue['aiProviderLabel'];
    settings: AiChatContextValue['aiChatSettings'];
    messages: AiChatContextValue['aiMessages'];
    isStreaming: NonNullable<AiChatContextValue['aiIsStreaming']>;
    lastError: AiChatContextValue['aiLastError'];
    conversationId: AiChatContextValue['aiConversationId'];
    connectionTestStatus: AiChatContextValue['aiConnectionTestStatus'];
    connectionTestMessage: AiChatContextValue['aiConnectionTestMessage'];
    contextDebugSnapshot: AiChatContextValue['aiContextDebugSnapshot'];
    pendingToolCall: AiChatContextValue['aiPendingToolCall'];
    taskSession: AiChatContextValue['aiTaskSession'];
    metrics: AiChatContextValue['aiInteractionMetrics'];
    sessionMemory: AiChatContextValue['aiSessionMemory'];
    updateSettings: AiChatContextValue['onUpdateAiChatSettings'];
    testConnection: AiChatContextValue['onTestAiConnection'];
    send: AiChatContextValue['onSendAiMessage'];
    stop: AiChatContextValue['onStopAiMessage'];
    clear: AiChatContextValue['onClearAiMessages'];
    conversationManagement: AiConversationManagementApi | null;
    toggleMessagePinned?: AiChatContextValue['onToggleAiMessagePin'];
    deactivateSessionDirective?: AiChatContextValue['onDeactivateAiSessionDirective'];
    pruneSessionDirectivesBySourceMessage?: AiChatContextValue['onPruneAiSessionDirectivesBySourceMessage'];
    confirmPendingToolCall: AiChatContextValue['onConfirmPendingToolCall'];
    cancelPendingToolCall: (() => void) | (() => Promise<void>) | undefined;
    dismissPendingAgentLoopCheckpoint: (() => void) | (() => Promise<void>) | undefined;
    trackRecommendationEvent: AiChatContextValue['onTrackAiRecommendationEvent'];
  };
  aiToolDecisionLogs: AiChatContextValue['aiToolDecisionLogs'];
  aiVerticalWorkflowAuditEntries: AiChatContextValue['aiVerticalWorkflowAuditEntries'];
  observerStage: AiChatContextValue['observerStage'];
  observerRecommendations: AssistantSidebarObserverRecommendationInput[];
  onJumpToCitation: AiChatContextValue['onJumpToCitation'];
  /** Timeline read-model epoch for pending destructive tool stale UX. */
  timelineReadModelEpoch?: number;
  /** Ref whose `current` receives stream-phase adoption items (wired from ReadyWorkspace + `useTranscriptionAiController`). */
  adoptionItemsPushSinkRef?: AiChatContextValue['adoptionItemsPushSinkRef'];
  runtimePropsInput: UseTranscriptionRuntimePropsInput;
}

export type UseTranscriptionAssistantSidebarControllerInputHeaderArgs = Omit<
  UseTranscriptionAssistantSidebarControllerInputArgs,
  'runtimePropsInput'
>;

export function useTranscriptionAssistantSidebarControllerInput({
  locale,
  analysisTab,
  onAnalysisTabChange,
  currentPage,
  selectedUnit,
  selectedRowMeta,
  selectedUnitKind,
  selectedLayerType,
  selectedText,
  selectedTimeRangeLabel,
  lexemeMatches,
  aiChat,
  aiToolDecisionLogs,
  aiVerticalWorkflowAuditEntries,
  observerStage,
  observerRecommendations,
  onJumpToCitation,
  timelineReadModelEpoch,
  adoptionItemsPushSinkRef,
  runtimePropsInput,
}: UseTranscriptionAssistantSidebarControllerInputArgs): UseTranscriptionAssistantSidebarControllerInput {
  const aiChatContextInput = useMemo(
    () => ({
      currentPage: currentPage ?? 'transcription',
      selectedUnit,
      selectedRowMeta,
      selectedUnitKind: selectedUnitKind ?? null,
      selectedText: selectedText ?? '',
      ...(selectedLayerType !== undefined ? { selectedLayerType } : {}),
      ...(selectedTimeRangeLabel !== undefined ? { selectedTimeRangeLabel } : {}),
      lexemeMatches,
      aiChatEnabled: aiChat.enabled,
      aiProviderLabel: aiChat.providerLabel,
      aiChatSettings: aiChat.settings,
      aiMessages: aiChat.messages,
      aiIsStreaming: aiChat.isStreaming,
      aiConversationId: aiChat.conversationId,
      aiLastError: aiChat.lastError,
      aiConnectionTestStatus: aiChat.connectionTestStatus,
      aiConnectionTestMessage: aiChat.connectionTestMessage,
      aiContextDebugSnapshot: aiChat.contextDebugSnapshot,
      aiPendingToolCall: aiChat.pendingToolCall,
      aiTaskSession: aiChat.taskSession,
      aiInteractionMetrics: aiChat.metrics,
      aiSessionMemory: aiChat.sessionMemory,
      aiToolDecisionLogs,
      aiVerticalWorkflowAuditEntries,
      observerStage,
      observerRecommendations,
      onUpdateAiChatSettings: aiChat.updateSettings,
      onTestAiConnection: aiChat.testConnection,
      onSendAiMessage: aiChat.send,
      onStopAiMessage: aiChat.stop,
      onClearAiMessages: aiChat.conversationManagement?.enabled
        ? aiChat.conversationManagement.clearCurrentConversation
        : aiChat.clear,
      aiConversationManagement: aiChat.conversationManagement,
      onStartNewConversation: aiChat.conversationManagement?.enabled
        ? async () => {
            await aiChat.conversationManagement!.startNewConversation();
          }
        : undefined,
      onSwitchConversation: aiChat.conversationManagement?.enabled
        ? async (conversationId: string) => {
            await aiChat.conversationManagement!.switchConversation(conversationId);
          }
        : undefined,
      onClearCurrentConversation: aiChat.conversationManagement?.enabled
        ? aiChat.conversationManagement.clearCurrentConversation
        : undefined,
      onToggleAiMessagePin: aiChat.toggleMessagePinned,
      onDeactivateAiSessionDirective: aiChat.deactivateSessionDirective,
      onPruneAiSessionDirectivesBySourceMessage: aiChat.pruneSessionDirectivesBySourceMessage,
      onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
      onCancelPendingToolCall: aiChat.cancelPendingToolCall
        ? async () => {
            await aiChat.cancelPendingToolCall?.();
          }
        : undefined,
      onDismissPendingAgentLoopCheckpoint: aiChat.dismissPendingAgentLoopCheckpoint
        ? async () => {
            await aiChat.dismissPendingAgentLoopCheckpoint?.();
          }
        : undefined,
      onTrackAiRecommendationEvent: aiChat.trackRecommendationEvent,
      onJumpToCitation,
      ...(timelineReadModelEpoch !== undefined ? { timelineReadModelEpoch } : {}),
      ...(adoptionItemsPushSinkRef !== undefined ? { adoptionItemsPushSinkRef } : {}),
    }),
    [
      aiChat,
      aiToolDecisionLogs,
      aiVerticalWorkflowAuditEntries,
      currentPage,
      lexemeMatches,
      observerRecommendations,
      observerStage,
      adoptionItemsPushSinkRef,
      onJumpToCitation,
      selectedLayerType,
      selectedRowMeta,
      selectedText,
      selectedTimeRangeLabel,
      selectedUnitKind,
      selectedUnit,
      timelineReadModelEpoch,
    ],
  );

  return useMemo<UseTranscriptionAssistantSidebarControllerInput>(
    () => ({
      locale,
      analysisTab,
      onAnalysisTabChange,
      aiChatContextInput,
      runtimePropsInput,
    }),
    [aiChatContextInput, analysisTab, locale, onAnalysisTabChange, runtimePropsInput],
  );
}
