export type VoiceCommercialConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  appId?: string;
  accessToken?: string;
};

export function applyVoiceCommercialConfigChange(
  config: VoiceCommercialConfig,
  persistConfig: (nextConfig: VoiceCommercialConfig) => void,
  applyRuntimeConfig: (nextConfig: VoiceCommercialConfig) => void,
): void {
  persistConfig(config);
  applyRuntimeConfig(config);
}
