import { describe, expect, it } from 'vitest';
import { getVoiceProviderManifestForEngine, listVoiceProviderManifests, resolveVoiceProviderHealth } from './voiceProviderManifest';

describe('voiceProviderManifest', () => {
  it('describes built-in and commercial providers with load and health keys', () => {
    const manifests = listVoiceProviderManifests();

    expect(manifests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engineId: 'web-speech',
        engine: 'web-speech',
        loadFunctionKey: 'browserSpeechRecognition',
        healthCheckKey: 'speechRecognitionApi',
        locality: 'local',
      }),
      expect.objectContaining({
        engineId: 'groq',
        engine: 'commercial',
        loadFunctionKey: 'createCommercialProvider',
        healthCheckKey: 'commercialProviderAvailability',
        locality: 'remote',
      }),
    ]));
  });

  it('resolves commercial engine manifests without changing lazy runtime semantics', () => {
    expect(getVoiceProviderManifestForEngine('commercial', 'volcengine')).toMatchObject({
      engineId: 'volcengine',
      engine: 'commercial',
      requiresConfig: true,
    });
  });

  it('throws instead of silently falling back when provider manifest is missing', () => {
    expect(() => getVoiceProviderManifestForEngine(
      'commercial',
      'missing-provider' as Parameters<typeof getVoiceProviderManifestForEngine>[1],
    )).toThrow('Voice provider manifest not found');
  });

  it('reports degraded health instead of throwing', async () => {
    const manifest = getVoiceProviderManifestForEngine('whisper-local');

    await expect(resolveVoiceProviderHealth({
      manifest,
      check: async () => false,
    })).resolves.toEqual({
      engineId: 'whisper-local',
      status: 'degraded',
      reason: 'whisperServerProbe-failed',
    });

    await expect(resolveVoiceProviderHealth({
      manifest,
      check: async () => {
        throw new Error('probe unavailable');
      },
    })).resolves.toMatchObject({
      status: 'degraded',
      reason: 'probe unavailable',
    });
  });
});
