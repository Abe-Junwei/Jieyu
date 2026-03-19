import { describe, expect, it, vi } from 'vitest';
import { applyVoiceCommercialConfigChange } from './voiceCommercialConfigSync';

describe('applyVoiceCommercialConfigChange', () => {
  it('syncs config to both persisted state and runtime state immediately', () => {
    const persistConfig = vi.fn<(config: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string }) => void>();
    const applyRuntimeConfig = vi.fn<(config: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string }) => void>();

    const config = {
      apiKey: 'k1',
      baseUrl: 'https://api.example.com',
      model: 'm1',
      appId: 'app-01',
      accessToken: 'token-01',
    };

    applyVoiceCommercialConfigChange(config, persistConfig, applyRuntimeConfig);

    expect(persistConfig).toHaveBeenCalledTimes(1);
    expect(applyRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(persistConfig).toHaveBeenCalledWith(config);
    expect(applyRuntimeConfig).toHaveBeenCalledWith(config);
    const persistOrder = persistConfig.mock.invocationCallOrder[0] ?? 0;
    const runtimeOrder = applyRuntimeConfig.mock.invocationCallOrder[0] ?? 0;
    expect(persistOrder).toBeGreaterThan(0);
    expect(runtimeOrder).toBeGreaterThan(0);
    expect(persistOrder).toBeLessThan(runtimeOrder);
  });
});
