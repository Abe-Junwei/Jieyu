import { createContext, useContext } from 'react';
import type { AiChatContextValue } from './AiChatContext';
import type { VoiceAgentContextValue } from './VoiceAgentContext';

// Hub = AiChat 全量字段（去掉仅 Observer 面板用的推荐列表）+ Voice 状态与操作回调（去掉语言切换相关）
// Hub = full AiChat fields (excluding observer-only recommendations) + voice state/callbacks (excluding lang override)
export type AiAssistantHubContextValue =
  Omit<AiChatContextValue, 'observerRecommendations'> &
  Pick<VoiceAgentContextValue,
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
