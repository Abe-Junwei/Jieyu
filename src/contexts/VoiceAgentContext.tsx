/**
 * VoiceAgentContext - 语音代理状态 Context
 *
 * 从 AiPanelContext 提取 voice agent 相关字段，独立的 Provider + state。
 * 消费者: AiAssistantHubContext (voice 字段部分)
 */

import { createContext, useContext } from 'react';
import type { VoiceAgentMode, VoicePendingConfirm } from '../hooks/useVoiceAgent';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VoiceAgentContextValue {
  voiceListening: boolean;
  voiceSpeechActive: boolean;
  voiceMode: VoiceAgentMode;
  voiceInterimText: string;
  voiceFinalText: string;
  voiceConfidence: number;
  voiceError: string | null;
  voiceSafeMode: boolean;
  voicePendingConfirm: VoicePendingConfirm | null;
  voiceCorpusLang: string;
  voiceLangOverride: string | null;
  voiceEnabled: boolean;
  onVoiceToggle: ((mode?: VoiceAgentMode) => void) | undefined;
  onVoiceSwitchMode: ((mode: VoiceAgentMode) => void) | undefined;
  onVoiceConfirm: (() => void) | undefined;
  onVoiceCancel: (() => void) | undefined;
  onVoiceSetSafeMode: ((on: boolean) => void) | undefined;
  onVoiceSetLangOverride: ((lang: string | null) => void) | undefined;
}

export const DEFAULT_VOICE_AGENT_CONTEXT_VALUE: VoiceAgentContextValue = {
  voiceListening: false,
  voiceSpeechActive: false,
  voiceMode: 'command',
  voiceInterimText: '',
  voiceFinalText: '',
  voiceConfidence: 0,
  voiceError: null,
  voiceSafeMode: false,
  voicePendingConfirm: null,
  voiceCorpusLang: 'cmn',
  voiceLangOverride: null,
  voiceEnabled: false,
  onVoiceToggle: undefined,
  onVoiceSwitchMode: undefined,
  onVoiceConfirm: undefined,
  onVoiceCancel: undefined,
  onVoiceSetSafeMode: undefined,
  onVoiceSetLangOverride: undefined,
};

// ── Context ───────────────────────────────────────────────────────────────────

const VoiceAgentContext = createContext<VoiceAgentContextValue | null>(null);

export function useVoiceAgentContext(): VoiceAgentContextValue {
  const ctx = useContext(VoiceAgentContext);
  if (!ctx) {
    throw new Error('useVoiceAgentContext must be used within <VoiceAgentProvider>');
  }
  return ctx;
}

interface VoiceAgentProviderProps {
  children: React.ReactNode;
  value: VoiceAgentContextValue;
}

export function VoiceAgentProvider({ children, value }: VoiceAgentProviderProps) {
  return (
    <VoiceAgentContext.Provider value={value}>
      {children}
    </VoiceAgentContext.Provider>
  );
}
