import { useMemo } from 'react';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { AiAssistantHubContextValue } from '../contexts/AiAssistantHubContext';

export function pickAiAssistantHubContextValue(P: AiPanelContextValue): AiAssistantHubContextValue {
  // AiAssistantHubContextValue = Pick<AiPanelContextValue, K>，显式映射以确保只暴露必要的 37 个字段 | Explicit mapping to expose only the 37 required fields.
  return {
    selectedUtterance: P.selectedUtterance,
    selectedRowMeta: P.selectedRowMeta,
    lexemeMatches: P.lexemeMatches,
    aiChatEnabled: P.aiChatEnabled,
    aiProviderLabel: P.aiProviderLabel,
    aiChatSettings: P.aiChatSettings,
    aiMessages: P.aiMessages,
    aiIsStreaming: P.aiIsStreaming,
    aiLastError: P.aiLastError,
    aiConnectionTestStatus: P.aiConnectionTestStatus,
    aiConnectionTestMessage: P.aiConnectionTestMessage,
    aiContextDebugSnapshot: P.aiContextDebugSnapshot,
    aiPendingToolCall: P.aiPendingToolCall,
    aiToolDecisionLogs: P.aiToolDecisionLogs,
    onUpdateAiChatSettings: P.onUpdateAiChatSettings,
    onTestAiConnection: P.onTestAiConnection,
    onSendAiMessage: P.onSendAiMessage,
    onStopAiMessage: P.onStopAiMessage,
    onClearAiMessages: P.onClearAiMessages,
    onConfirmPendingToolCall: P.onConfirmPendingToolCall,
    onCancelPendingToolCall: P.onCancelPendingToolCall,
    observerStage: P.observerStage,
    onJumpToCitation: P.onJumpToCitation,
    voiceEnabled: P.voiceEnabled,
    voiceListening: P.voiceListening,
    voiceSpeechActive: P.voiceSpeechActive,
    voiceMode: P.voiceMode,
    voiceInterimText: P.voiceInterimText,
    voiceFinalText: P.voiceFinalText,
    voiceConfidence: P.voiceConfidence,
    voiceError: P.voiceError,
    voiceSafeMode: P.voiceSafeMode,
    voicePendingConfirm: P.voicePendingConfirm,
    onVoiceToggle: P.onVoiceToggle,
    onVoiceSwitchMode: P.onVoiceSwitchMode,
    onVoiceConfirm: P.onVoiceConfirm,
    onVoiceCancel: P.onVoiceCancel,
    onVoiceSetSafeMode: P.onVoiceSetSafeMode,
  } as AiAssistantHubContextValue;
}

export function useAiAssistantHubContextValue(aiPanelContextValue: AiPanelContextValue): AiAssistantHubContextValue {
  return useMemo(() => pickAiAssistantHubContextValue(aiPanelContextValue), [aiPanelContextValue]);
}
