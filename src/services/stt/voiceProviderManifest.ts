import type { CommercialProviderKind, SttEngine, SttProviderCapability } from '../VoiceInputService';
import { sttProviderDefinitions, type SttProviderKind } from './providerMetadata';

export type VoiceProviderLoadFunctionKey =
  | 'browserSpeechRecognition'
  | 'whisperLocalHttp'
  | 'createCommercialProvider';

export type VoiceProviderHealthCheckKey =
  | 'speechRecognitionApi'
  | 'whisperServerProbe'
  | 'commercialProviderAvailability';

export interface VoiceProviderManifest {
  engineId: SttProviderKind;
  displayName: string;
  engine: SttEngine;
  capabilities: SttProviderCapability[];
  loadFunctionKey: VoiceProviderLoadFunctionKey;
  healthCheckKey: VoiceProviderHealthCheckKey;
  locality: 'local' | 'remote';
  requiresConfig: boolean;
}

export interface VoiceProviderHealthReport {
  engineId: SttProviderKind;
  status: 'healthy' | 'degraded';
  reason: string;
}

function loadFunctionKeyFor(engineId: SttProviderKind): VoiceProviderLoadFunctionKey {
  if (engineId === 'web-speech') return 'browserSpeechRecognition';
  if (engineId === 'whisper-local') return 'whisperLocalHttp';
  return 'createCommercialProvider';
}

function healthCheckKeyFor(engineId: SttProviderKind): VoiceProviderHealthCheckKey {
  if (engineId === 'web-speech') return 'speechRecognitionApi';
  if (engineId === 'whisper-local') return 'whisperServerProbe';
  return 'commercialProviderAvailability';
}

export function listVoiceProviderManifests(): VoiceProviderManifest[] {
  return sttProviderDefinitions.map((definition) => ({
    engineId: definition.kind,
    displayName: definition.label,
    engine: definition.engine,
    capabilities: [definition.capability],
    loadFunctionKey: loadFunctionKeyFor(definition.kind),
    healthCheckKey: healthCheckKeyFor(definition.kind),
    locality: definition.capability === 'cloud-api' ? 'remote' : 'local',
    requiresConfig: definition.requiresConfig,
  }));
}

export function getVoiceProviderManifestForEngine(
  engine: SttEngine,
  commercialProviderKind: CommercialProviderKind = 'groq',
): VoiceProviderManifest {
  const engineId: SttProviderKind = engine === 'commercial' ? commercialProviderKind : engine;
  const manifest = listVoiceProviderManifests().find((item) => item.engineId === engineId);
  if (!manifest) {
    throw new Error(`Voice provider manifest not found for engine: ${engineId}`);
  }
  return manifest;
}

export async function resolveVoiceProviderHealth(input: {
  manifest: VoiceProviderManifest;
  check: () => Promise<boolean> | boolean;
}): Promise<VoiceProviderHealthReport> {
  try {
    const ok = await input.check();
    return {
      engineId: input.manifest.engineId,
      status: ok ? 'healthy' : 'degraded',
      reason: ok ? 'health-check-ok' : `${input.manifest.healthCheckKey}-failed`,
    };
  } catch (error) {
    return {
      engineId: input.manifest.engineId,
      status: 'degraded',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
