import type { CommercialProviderCreateConfig } from '../stt';
import type { CommercialProviderKind } from '../VoiceInputService';

export interface VoiceAgentRuntimeConfig {
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
}

export interface VoiceAgentRuntimeConfigInput {
  whisperServerUrl?: string;
  whisperServerModel?: string;
  commercialProviderKind?: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderCreateConfig;
}

const DEFAULT_VOICE_AGENT_RUNTIME_CONFIG: VoiceAgentRuntimeConfig = {
  whisperServerUrl: 'http://localhost:3040',
  whisperServerModel: 'ggml-small-q5_k.bin',
  commercialProviderKind: 'groq',
  commercialProviderConfig: {},
};

export function resolveVoiceAgentRuntimeConfig(
  input: VoiceAgentRuntimeConfigInput,
): VoiceAgentRuntimeConfig {
  return {
    whisperServerUrl: input.whisperServerUrl ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.whisperServerUrl,
    whisperServerModel: input.whisperServerModel ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.whisperServerModel,
    commercialProviderKind: input.commercialProviderKind ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.commercialProviderKind,
    commercialProviderConfig: input.commercialProviderConfig ?? DEFAULT_VOICE_AGENT_RUNTIME_CONFIG.commercialProviderConfig,
  };
}
