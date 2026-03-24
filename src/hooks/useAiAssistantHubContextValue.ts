import { useMemo } from 'react';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { VoiceAgentContextValue } from '../contexts/VoiceAgentContext';
import type { AiAssistantHubContextValue } from '../contexts/AiAssistantHubContext';

export function pickAiAssistantHubContextValue(
  chat: AiChatContextValue,
  voice: VoiceAgentContextValue,
): AiAssistantHubContextValue {
  // 从 chat 中去掉 observerRecommendations，合并所需的 voice 字段
  // Drop observerRecommendations from chat, merge required voice fields
  const { observerRecommendations: _omit, ...chatRest } = chat;
  return {
    ...chatRest,
    voiceEnabled: voice.voiceEnabled,
    voiceListening: voice.voiceListening,
    voiceSpeechActive: voice.voiceSpeechActive,
    voiceMode: voice.voiceMode,
    voiceInterimText: voice.voiceInterimText,
    voiceFinalText: voice.voiceFinalText,
    voiceConfidence: voice.voiceConfidence,
    voiceError: voice.voiceError,
    voiceSafeMode: voice.voiceSafeMode,
    voicePendingConfirm: voice.voicePendingConfirm,
    onVoiceToggle: voice.onVoiceToggle,
    onVoiceSwitchMode: voice.onVoiceSwitchMode,
    onVoiceConfirm: voice.onVoiceConfirm,
    onVoiceCancel: voice.onVoiceCancel,
    onVoiceSetSafeMode: voice.onVoiceSetSafeMode,
  };
}

export function useAiAssistantHubContextValue(
  chat: AiChatContextValue,
  voice: VoiceAgentContextValue,
): AiAssistantHubContextValue {
  return useMemo(() => pickAiAssistantHubContextValue(chat, voice), [chat, voice]);
}
