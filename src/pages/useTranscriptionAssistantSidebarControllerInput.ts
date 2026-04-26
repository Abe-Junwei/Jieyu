import { useMemo } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { UseTranscriptionRuntimePropsInput } from './useTranscriptionRuntimeProps';
import type { AssistantSidebarObserverRecommendationInput, UseTranscriptionAssistantSidebarControllerInput } from './useTranscriptionAssistantSidebarController';

interface UseTranscriptionAssistantSidebarControllerInputInput {
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
    toggleMessagePinned?: AiChatContextValue['onToggleAiMessagePin'];
    deactivateSessionDirective?: AiChatContextValue['onDeactivateAiSessionDirective'];
    pruneSessionDirectivesBySourceMessage?: AiChatContextValue['onPruneAiSessionDirectivesBySourceMessage'];
    confirmPendingToolCall: AiChatContextValue['onConfirmPendingToolCall'];
    cancelPendingToolCall: AiChatContextValue['onCancelPendingToolCall'];
    trackRecommendationEvent: AiChatContextValue['onTrackAiRecommendationEvent'];
  };
  aiToolDecisionLogs: AiChatContextValue['aiToolDecisionLogs'];
  observerStage: AiChatContextValue['observerStage'];
  observerRecommendations: AssistantSidebarObserverRecommendationInput[];
  onJumpToCitation: AiChatContextValue['onJumpToCitation'];
  /** Timeline read-model epoch for pending destructive tool stale UX. */
  timelineReadModelEpoch?: number;
  runtimePropsInput: UseTranscriptionRuntimePropsInput;
}

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
  observerStage,
  observerRecommendations,
  onJumpToCitation,
  timelineReadModelEpoch,
  runtimePropsInput,
}: UseTranscriptionAssistantSidebarControllerInputInput): UseTranscriptionAssistantSidebarControllerInput {
  const aiChatContextInput = useMemo(() => ({
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
    aiLastError: aiChat.lastError,
    aiConnectionTestStatus: aiChat.connectionTestStatus,
    aiConnectionTestMessage: aiChat.connectionTestMessage,
    aiContextDebugSnapshot: aiChat.contextDebugSnapshot,
    aiPendingToolCall: aiChat.pendingToolCall,
    aiTaskSession: aiChat.taskSession,
    aiInteractionMetrics: aiChat.metrics,
    aiSessionMemory: aiChat.sessionMemory,
    aiToolDecisionLogs,
    observerStage,
    observerRecommendations,
    onUpdateAiChatSettings: aiChat.updateSettings,
    onTestAiConnection: aiChat.testConnection,
    onSendAiMessage: aiChat.send,
    onStopAiMessage: aiChat.stop,
    onClearAiMessages: aiChat.clear,
    onToggleAiMessagePin: aiChat.toggleMessagePinned,
    onDeactivateAiSessionDirective: aiChat.deactivateSessionDirective,
    onPruneAiSessionDirectivesBySourceMessage: aiChat.pruneSessionDirectivesBySourceMessage,
    onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
    onCancelPendingToolCall: aiChat.cancelPendingToolCall,
    onTrackAiRecommendationEvent: aiChat.trackRecommendationEvent,
    onJumpToCitation,
    ...(timelineReadModelEpoch !== undefined ? { timelineReadModelEpoch } : {}),
  }), [
    aiChat.cancelPendingToolCall,
    aiChat.clear,
    aiChat.confirmPendingToolCall,
    aiChat.connectionTestMessage,
    aiChat.connectionTestStatus,
    aiChat.contextDebugSnapshot,
    aiChat.enabled,
    aiChat.isStreaming,
    aiChat.lastError,
    aiChat.messages,
    aiChat.metrics,
    aiChat.pendingToolCall,
    aiChat.providerLabel,
    aiChat.send,
    aiChat.sessionMemory,
    aiChat.settings,
    aiChat.stop,
    aiChat.toggleMessagePinned,
    aiChat.deactivateSessionDirective,
    aiChat.pruneSessionDirectivesBySourceMessage,
    aiChat.taskSession,
    aiChat.testConnection,
    aiChat.trackRecommendationEvent,
    aiChat.updateSettings,
    aiToolDecisionLogs,
    currentPage,
    lexemeMatches,
    observerRecommendations,
    observerStage,
    onJumpToCitation,
    selectedLayerType,
    selectedRowMeta,
    selectedText,
    selectedTimeRangeLabel,
    selectedUnitKind,
    selectedUnit,
    timelineReadModelEpoch,
  ]);

  return useMemo<UseTranscriptionAssistantSidebarControllerInput>(() => ({
    locale,
    analysisTab,
    onAnalysisTabChange,
    aiChatContextInput,
    runtimePropsInput,
  }), [aiChatContextInput, analysisTab, locale, onAnalysisTabChange, runtimePropsInput]);
}
