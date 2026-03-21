import { useMemo } from 'react';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { AiAssistantHubContextValue } from '../contexts/AiAssistantHubContext';

export function pickAiAssistantHubContextValue(aiPanelContextValue: AiPanelContextValue): AiAssistantHubContextValue {
  const mapped = {
    selectedUtterance: aiPanelContextValue.selectedUtterance,
    selectedRowMeta: aiPanelContextValue.selectedRowMeta,
    lexemeMatches: aiPanelContextValue.lexemeMatches,
    aiChatEnabled: aiPanelContextValue.aiChatEnabled,
    aiProviderLabel: aiPanelContextValue.aiProviderLabel,
    aiChatSettings: aiPanelContextValue.aiChatSettings,
    aiMessages: aiPanelContextValue.aiMessages,
    aiIsStreaming: aiPanelContextValue.aiIsStreaming,
    aiLastError: aiPanelContextValue.aiLastError,
    aiConnectionTestStatus: aiPanelContextValue.aiConnectionTestStatus,
    aiConnectionTestMessage: aiPanelContextValue.aiConnectionTestMessage,
    aiContextDebugSnapshot: aiPanelContextValue.aiContextDebugSnapshot,
    aiPendingToolCall: aiPanelContextValue.aiPendingToolCall,
    aiToolDecisionLogs: aiPanelContextValue.aiToolDecisionLogs,
    onUpdateAiChatSettings: aiPanelContextValue.onUpdateAiChatSettings,
    onTestAiConnection: aiPanelContextValue.onTestAiConnection,
    onSendAiMessage: aiPanelContextValue.onSendAiMessage,
    onStopAiMessage: aiPanelContextValue.onStopAiMessage,
    onClearAiMessages: aiPanelContextValue.onClearAiMessages,
    onConfirmPendingToolCall: aiPanelContextValue.onConfirmPendingToolCall,
    onCancelPendingToolCall: aiPanelContextValue.onCancelPendingToolCall,
    observerStage: aiPanelContextValue.observerStage,
    onJumpToCitation: aiPanelContextValue.onJumpToCitation,
    voiceEnabled: aiPanelContextValue.voiceEnabled,
    voiceListening: aiPanelContextValue.voiceListening,
    voiceSpeechActive: aiPanelContextValue.voiceSpeechActive,
    voiceMode: aiPanelContextValue.voiceMode,
    voiceInterimText: aiPanelContextValue.voiceInterimText,
    voiceFinalText: aiPanelContextValue.voiceFinalText,
    voiceConfidence: aiPanelContextValue.voiceConfidence,
    voiceError: aiPanelContextValue.voiceError,
    voiceSafeMode: aiPanelContextValue.voiceSafeMode,
    voicePendingConfirm: aiPanelContextValue.voicePendingConfirm,
    onVoiceToggle: aiPanelContextValue.onVoiceToggle,
    onVoiceSwitchMode: aiPanelContextValue.onVoiceSwitchMode,
    onVoiceConfirm: aiPanelContextValue.onVoiceConfirm,
    onVoiceCancel: aiPanelContextValue.onVoiceCancel,
    onVoiceSetSafeMode: aiPanelContextValue.onVoiceSetSafeMode,
  } satisfies AiAssistantHubContextValue;

  return mapped;
}

export function useAiAssistantHubContextValue(aiPanelContextValue: AiPanelContextValue): AiAssistantHubContextValue {
  return useMemo(() => pickAiAssistantHubContextValue(aiPanelContextValue), [aiPanelContextValue]);
}
