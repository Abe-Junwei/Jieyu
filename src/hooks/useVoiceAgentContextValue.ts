import { useMemo } from 'react';
import type { VoiceAgentContextValue } from '../contexts/VoiceAgentContext';
import { DEFAULT_VOICE_MODE } from './useVoiceAgent';

export type VoiceAgentContextSource = Partial<VoiceAgentContextValue>;

export function pickVoiceAgentContextValue(P: VoiceAgentContextSource): VoiceAgentContextValue {
  return {
    voiceListening: P.voiceListening ?? false,
    voiceSpeechActive: P.voiceSpeechActive ?? false,
    voiceMode: P.voiceMode ?? DEFAULT_VOICE_MODE,
    voiceInterimText: P.voiceInterimText ?? '',
    voiceFinalText: P.voiceFinalText ?? '',
    voiceConfidence: P.voiceConfidence ?? 0,
    voiceError: P.voiceError ?? null,
    voiceSafeMode: P.voiceSafeMode ?? false,
    voicePendingConfirm: P.voicePendingConfirm ?? null,
    voiceCorpusLang: P.voiceCorpusLang ?? 'cmn',
    voiceLangOverride: P.voiceLangOverride ?? null,
    voiceEnabled: P.voiceEnabled ?? false,
    onVoiceToggle: P.onVoiceToggle,
    onVoiceSwitchMode: P.onVoiceSwitchMode,
    onVoiceConfirm: P.onVoiceConfirm,
    onVoiceCancel: P.onVoiceCancel,
    onVoiceSetSafeMode: P.onVoiceSetSafeMode,
    onVoiceSetLangOverride: P.onVoiceSetLangOverride,
  };
}

export function useVoiceAgentContextValue(source: VoiceAgentContextSource): VoiceAgentContextValue {
  return useMemo(() => pickVoiceAgentContextValue(source), [source]);
}
