import { createContext, useContext } from 'react';
import type { AiPanelContextValue } from './AiPanelContext';

export type AiAssistantHubContextValue = Pick<AiPanelContextValue,
  | 'selectedUtterance'
  | 'selectedRowMeta'
  | 'lexemeMatches'
  | 'aiChatEnabled'
  | 'aiProviderLabel'
  | 'aiChatSettings'
  | 'aiMessages'
  | 'aiIsStreaming'
  | 'aiLastError'
  | 'aiConnectionTestStatus'
  | 'aiConnectionTestMessage'
  | 'aiContextDebugSnapshot'
  | 'aiPendingToolCall'
  | 'aiToolDecisionLogs'
  | 'onUpdateAiChatSettings'
  | 'onTestAiConnection'
  | 'onSendAiMessage'
  | 'onStopAiMessage'
  | 'onClearAiMessages'
  | 'onConfirmPendingToolCall'
  | 'onCancelPendingToolCall'
  | 'observerStage'
  | 'onJumpToCitation'
  | 'voiceEnabled'
  | 'voiceListening'
  | 'voiceSpeechActive'
  | 'voiceMode'
  | 'voiceInterimText'
  | 'voiceFinalText'
  | 'voiceConfidence'
  | 'voiceError'
  | 'voiceSafeMode'
  | 'voicePendingConfirm'
  | 'onVoiceToggle'
  | 'onVoiceSwitchMode'
  | 'onVoiceConfirm'
  | 'onVoiceCancel'
  | 'onVoiceSetSafeMode'
>;

export const AiAssistantHubContext = createContext<AiAssistantHubContextValue | null>(null);

export function useAiAssistantHubContext(): AiAssistantHubContextValue {
  const value = useContext(AiAssistantHubContext);
  if (!value) {
    throw new Error('useAiAssistantHubContext must be used within AiAssistantHubContext.Provider');
  }
  return value;
}
