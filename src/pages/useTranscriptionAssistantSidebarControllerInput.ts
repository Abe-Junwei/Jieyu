import { useMemo } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { UseTranscriptionRuntimePropsInput } from './useTranscriptionRuntimeProps';
import type {
  AssistantSidebarObserverRecommendationInput,
  UseTranscriptionAssistantSidebarControllerInput,
} from './useTranscriptionAssistantSidebarController';
import type { useAiChat } from '../hooks/useAiChat';

/** Accepts the full aiChat return value to avoid identity-mapping at the call site | 接受完整 aiChat 返回值，避免调用方逐字段映射 */
type AiChatReturn = ReturnType<typeof useAiChat>;

interface UseTranscriptionAssistantSidebarControllerInputInput {
  locale: string;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
  selectedUtterance: AiChatContextValue['selectedUtterance'];
  selectedRowMeta: AiChatContextValue['selectedRowMeta'];
  lexemeMatches: AiChatContextValue['lexemeMatches'];
  aiChat: AiChatReturn;
  aiToolDecisionLogs: AiChatContextValue['aiToolDecisionLogs'];
  observerStage: AiChatContextValue['observerStage'];
  observerRecommendations: AssistantSidebarObserverRecommendationInput[];
  onJumpToCitation: AiChatContextValue['onJumpToCitation'];
  runtimePropsInput: UseTranscriptionRuntimePropsInput;
}

export function useTranscriptionAssistantSidebarControllerInput({
  locale,
  analysisTab,
  onAnalysisTabChange,
  selectedUtterance,
  selectedRowMeta,
  lexemeMatches,
  aiChat,
  aiToolDecisionLogs,
  observerStage,
  observerRecommendations,
  onJumpToCitation,
  runtimePropsInput,
}: UseTranscriptionAssistantSidebarControllerInputInput): UseTranscriptionAssistantSidebarControllerInput {
  const aiChatContextInput = useMemo(() => ({
    selectedUtterance,
    selectedRowMeta,
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
    onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
    onCancelPendingToolCall: aiChat.cancelPendingToolCall,
    onJumpToCitation,
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
    aiChat.taskSession,
    aiChat.testConnection,
    aiChat.updateSettings,
    aiToolDecisionLogs,
    lexemeMatches,
    observerRecommendations,
    observerStage,
    onJumpToCitation,
    selectedRowMeta,
    selectedUtterance,
  ]);

  return useMemo<UseTranscriptionAssistantSidebarControllerInput>(() => ({
    locale,
    analysisTab,
    onAnalysisTabChange,
    aiChatContextInput,
    runtimePropsInput,
  }), [aiChatContextInput, analysisTab, locale, onAnalysisTabChange, runtimePropsInput]);
}
