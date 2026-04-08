import type { AcousticAnalysisConfig, AcousticFeatureResult } from '../../utils/acousticOverlayTypes';

/**
 * Acoustic analysis provider kind.
 * 'local' is the built-in Web Worker YIN + spectral descriptor chain.
 * Additional kinds can be added for external backends.
 */
export type AcousticProviderKind = 'local' | 'external';

export interface AcousticProviderCapability {
  f0: boolean;
  intensity: boolean;
  spectralDescriptors: boolean;
  formant: boolean;
  mfcc: boolean;
}

export interface AcousticProviderDefinition {
  kind: AcousticProviderKind;
  id: string;
  label: string;
  description: string;
  capabilities: AcousticProviderCapability;
  experimental: boolean;
}

export interface AcousticProviderReachability {
  id: string;
  available: boolean;
  error?: string;
  latencyMs?: number;
}

export interface ResolvedAcousticProviderState {
  requestedProviderId: string;
  effectiveProviderId: string;
  reachability: AcousticProviderReachability;
  fellBackToLocal: boolean;
  fallbackReason?: string;
}

export interface AcousticProviderAnalyzeInput {
  mediaKey: string;
  pcm: Float32Array;
  sampleRate: number;
  config: AcousticAnalysisConfig;
  signal?: AbortSignal;
  onProgress?: (processedFrames: number, totalFrames: number) => void;
}

export interface AcousticProvider {
  readonly definition: AcousticProviderDefinition;
  checkReachability(): Promise<AcousticProviderReachability>;
  analyze(input: AcousticProviderAnalyzeInput): Promise<AcousticFeatureResult>;
}

/**
 * Default local provider definition.
 * This is the built-in YIN + spectral descriptor chain running in a Web Worker.
 */
export const LOCAL_ACOUSTIC_PROVIDER_DEFINITION: AcousticProviderDefinition = {
  kind: 'local',
  id: 'local-yin-spectral',
  label: 'Local (YIN + Spectral)',
  description: 'Built-in pitch detection, intensity, spectral descriptors, and approximate formant estimation.',
  capabilities: {
    f0: true,
    intensity: true,
    spectralDescriptors: true,
    formant: true,
    mfcc: true,
  },
  experimental: false,
};

export const ENHANCED_ACOUSTIC_PROVIDER_DEFINITION: AcousticProviderDefinition = {
  kind: 'external',
  id: 'enhanced-provider',
  label: 'Enhanced Provider (External)',
  description: 'Reserved external acoustic backend entry. Requires explicit configuration and reachability checks.',
  capabilities: {
    f0: true,
    intensity: true,
    spectralDescriptors: true,
    formant: true,
    mfcc: true,
  },
  experimental: true,
};

/**
 * Registry of all available acoustic providers.
 * External providers can be added here once they implement the AcousticProvider interface.
 */
export const acousticProviderDefinitions: AcousticProviderDefinition[] = [
  LOCAL_ACOUSTIC_PROVIDER_DEFINITION,
  ENHANCED_ACOUSTIC_PROVIDER_DEFINITION,
];

/**
 * Resolve which provider to use for a given analysis request.
 * Currently always returns the local provider.
 * Future: can route based on user settings or provider availability.
 */
export function resolveAcousticProvider(
  _preferredId?: string,
): AcousticProviderDefinition {
  if (!_preferredId) return LOCAL_ACOUSTIC_PROVIDER_DEFINITION;
  return acousticProviderDefinitions.find((definition) => definition.id === _preferredId)
    ?? LOCAL_ACOUSTIC_PROVIDER_DEFINITION;
}

export function resolveAcousticProviderReachability(providerId: string): AcousticProviderReachability {
  if (providerId === LOCAL_ACOUSTIC_PROVIDER_DEFINITION.id) {
    return {
      id: providerId,
      available: true,
      latencyMs: 0,
    };
  }

  return {
    id: providerId,
    available: false,
    error: 'Provider is not configured in this workspace.',
  };
}

export function resolveAcousticProviderState(preferredId?: string | null): ResolvedAcousticProviderState {
  const requested = resolveAcousticProvider(preferredId ?? undefined);
  const reachability = resolveAcousticProviderReachability(requested.id);

  if (reachability.available) {
    return {
      requestedProviderId: requested.id,
      effectiveProviderId: requested.id,
      reachability,
      fellBackToLocal: false,
    };
  }

  return {
    requestedProviderId: requested.id,
    effectiveProviderId: LOCAL_ACOUSTIC_PROVIDER_DEFINITION.id,
    reachability,
    fellBackToLocal: true,
    fallbackReason: reachability.error ?? 'Provider unavailable',
  };
}
