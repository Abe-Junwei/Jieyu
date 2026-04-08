import type { CommercialProviderCreateConfig, SttEnhancementConfig, SttEnhancementSelectionKind } from '../stt';
import type { CommercialProviderKind } from '../VoiceInputService';

export interface VoiceAgentRuntimeConfig {
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  sttEnhancementKind: SttEnhancementSelectionKind;
  sttEnhancementConfig: SttEnhancementConfig;
}

export interface VoiceAgentRuntimeConfigInput {
  whisperServerUrl?: string;
  whisperServerModel?: string;
  commercialProviderKind?: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderCreateConfig;
  sttEnhancementKind?: SttEnhancementSelectionKind;
  sttEnhancementConfig?: SttEnhancementConfig;
}

const DEFAULT_VOICE_AGENT_RUNTIME_CONFIG: VoiceAgentRuntimeConfig = {
  whisperServerUrl: 'http://localhost:3040',
  whisperServerModel: 'ggml-small-q5_k.bin',
  commercialProviderKind: 'groq',
  commercialProviderConfig: {},
  sttEnhancementKind: 'none',
  sttEnhancementConfig: {},
};

export function resolveVoiceAgentRuntimeConfig(
  input: VoiceAgentRuntimeConfigInput,
): VoiceAgentRuntimeConfig {
  return {
    whisperServerUrl: input.whisperServerUrl ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.whisperServerUrl,
    whisperServerModel: input.whisperServerModel ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.whisperServerModel,
    commercialProviderKind: input.commercialProviderKind ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.commercialProviderKind,
    commercialProviderConfig: input.commercialProviderConfig ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.commercialProviderConfig,
    sttEnhancementKind: input.sttEnhancementKind ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.sttEnhancementKind,
    sttEnhancementConfig: input.sttEnhancementConfig ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.sttEnhancementConfig,
  };
}
