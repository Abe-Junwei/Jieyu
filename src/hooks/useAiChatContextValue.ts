import { useMemo } from 'react';
import type { AiChatContextValue } from '../contexts/AiChatContext';

export type AiChatContextSource = Partial<AiChatContextValue>;

export function pickAiChatContextValue(P: AiChatContextSource): AiChatContextValue {
  const observerRecommendations = (P.observerRecommendations ?? []).map((item) => ({ ...item }));
  return {
    currentPage: P.currentPage ?? 'other',
    selectedUnit: P.selectedUnit ?? null,
    selectedRowMeta: P.selectedRowMeta ?? null,
    selectedUnitKind: P.selectedUnitKind ?? null,
    selectedText: P.selectedText ?? '',
    selectedTimeRangeLabel: P.selectedTimeRangeLabel ?? null,
    ...(P.selectedLayerType !== undefined ? { selectedLayerType: P.selectedLayerType } : {}),
    lexemeMatches: P.lexemeMatches ?? [],
    aiChatEnabled: P.aiChatEnabled ?? false,
    aiProviderLabel: P.aiProviderLabel,
    aiChatSettings: P.aiChatSettings,
    aiMessages: P.aiMessages,
    aiIsStreaming: P.aiIsStreaming,
    aiLastError: P.aiLastError,
    aiConnectionTestStatus: P.aiConnectionTestStatus ?? 'idle',
    aiConnectionTestMessage: P.aiConnectionTestMessage,
    aiContextDebugSnapshot: P.aiContextDebugSnapshot,
    aiPendingToolCall: P.aiPendingToolCall,
    aiTaskSession: P.aiTaskSession,
    aiInteractionMetrics: P.aiInteractionMetrics,
    aiSessionMemory: P.aiSessionMemory,
    aiToolDecisionLogs: P.aiToolDecisionLogs ?? [],
    observerStage: P.observerStage ?? 'collecting',
    observerRecommendations,
    onUpdateAiChatSettings: P.onUpdateAiChatSettings,
    onTestAiConnection: P.onTestAiConnection,
    onSendAiMessage: P.onSendAiMessage,
    onStopAiMessage: P.onStopAiMessage,
    onClearAiMessages: P.onClearAiMessages,
    onToggleAiMessagePin: P.onToggleAiMessagePin,
    onConfirmPendingToolCall: P.onConfirmPendingToolCall,
    onCancelPendingToolCall: P.onCancelPendingToolCall,
    onTrackAiRecommendationEvent: P.onTrackAiRecommendationEvent,
    onJumpToCitation: P.onJumpToCitation,
  };
}

export function useAiChatContextValue(source: AiChatContextSource): AiChatContextValue {
  return useMemo(() => pickAiChatContextValue(source), [source]);
}
