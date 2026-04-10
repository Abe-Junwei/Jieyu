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

export type AcousticProviderRoutingStrategy = 'local-first' | 'prefer-external';

export interface ExternalAcousticProviderConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface AcousticProviderRuntimeConfig {
  routingStrategy: AcousticProviderRoutingStrategy;
  externalProvider: ExternalAcousticProviderConfig;
}

export type ExternalAcousticProviderHealthState =
  | 'available'
  | 'disabled'
  | 'unconfigured'
  | 'aborted'
  | 'unauthorized'
  | 'forbidden'
  | 'timeout'
  | 'network-error'
  | 'http-error'
  | 'unknown-error';

export interface ExternalAcousticProviderHealthCheckResult {
  state: ExternalAcousticProviderHealthState;
  available: boolean;
  endpoint?: string;
  status?: number;
  latencyMs?: number;
  message?: string;
}

export interface ExternalAcousticProviderHealthCheckOptions {
  runtimeConfig?: AcousticProviderRuntimeConfig;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface ResolveAcousticProviderStateOptions {
  runtimeConfig?: AcousticProviderRuntimeConfig;
}

export const DEFAULT_EXTERNAL_ACOUSTIC_PROVIDER_CONFIG: ExternalAcousticProviderConfig = {
  enabled: false,
  timeoutMs: 10_000,
};

export const DEFAULT_ACOUSTIC_PROVIDER_RUNTIME_CONFIG: AcousticProviderRuntimeConfig = {
  routingStrategy: 'local-first',
  externalProvider: DEFAULT_EXTERNAL_ACOUSTIC_PROVIDER_CONFIG,
};

export const ACOUSTIC_PROVIDER_STORAGE_KEYS = {
  routingStrategy: 'jieyu.acoustic.routingStrategy',
  externalEnabled: 'jieyu.acoustic.external.enabled',
  externalEndpoint: 'jieyu.acoustic.external.endpoint',
  // Deprecated: API key is intentionally kept in memory only.
  externalApiKey: 'jieyu.acoustic.external.apiKey',
  externalTimeoutMs: 'jieyu.acoustic.external.timeoutMs',
} as const;

const inMemoryProviderSecrets: {
  externalApiKey?: string;
} = {};

const INVALID_EXTERNAL_PROVIDER_ENDPOINT_MESSAGE = 'External provider endpoint must use HTTPS. HTTP is allowed only for localhost.';

function parseEndpointUrl(endpoint: string): URL | null {
  try {
    return new URL(endpoint);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]';
}

export function isAllowedExternalProviderEndpoint(endpoint: string): boolean {
  const parsed = parseEndpointUrl(endpoint.trim());
  if (!parsed) return false;
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;
  return isLoopbackHostname(parsed.hostname);
}

function assertValidExternalProviderEndpoint(endpoint?: string): void {
  const trimmed = endpoint?.trim();
  if (!trimmed) return;
  if (!isAllowedExternalProviderEndpoint(trimmed)) {
    throw new Error(INVALID_EXTERNAL_PROVIDER_ENDPOINT_MESSAGE);
  }
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

function normalizeTimeoutMs(value: string | null | undefined): number {
  if (!value) return DEFAULT_EXTERNAL_ACOUSTIC_PROVIDER_CONFIG.timeoutMs;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EXTERNAL_ACOUSTIC_PROVIDER_CONFIG.timeoutMs;
  return Math.max(500, Math.min(120_000, Math.round(parsed)));
}

function readStorageValue(key: string): string | null {
  try {
    if (!('localStorage' in globalThis) || !globalThis.localStorage) return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string | null | undefined): void {
  try {
    if (!('localStorage' in globalThis) || !globalThis.localStorage) return;
    if (!value) {
      globalThis.localStorage.removeItem(key);
      return;
    }
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures and keep runtime behavior resilient.
  }
}

function normalizeExternalAcousticProviderConfig(
  config?: Partial<ExternalAcousticProviderConfig> | null,
): ExternalAcousticProviderConfig {
  const endpointCandidate = config?.endpoint?.trim();
  const endpoint = endpointCandidate && isAllowedExternalProviderEndpoint(endpointCandidate)
    ? endpointCandidate
    : undefined;
  const apiKey = config?.apiKey?.trim();

  return {
    enabled: Boolean(config?.enabled),
    ...(endpoint ? { endpoint } : {}),
    ...(apiKey ? { apiKey } : {}),
    timeoutMs: normalizeTimeoutMs(
      typeof config?.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
        ? String(config.timeoutMs)
        : undefined,
    ),
  };
}

export function normalizeAcousticProviderRuntimeConfig(
  config?: Partial<AcousticProviderRuntimeConfig> | null,
): AcousticProviderRuntimeConfig {
  const routingStrategy: AcousticProviderRoutingStrategy = config?.routingStrategy === 'prefer-external'
    ? 'prefer-external'
    : 'local-first';

  return {
    routingStrategy,
    externalProvider: normalizeExternalAcousticProviderConfig(config?.externalProvider),
  };
}

function readExternalAcousticProviderConfigFromStorage(): ExternalAcousticProviderConfig {
  const enabledRaw = readStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEnabled);
  const endpoint = (readStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEndpoint) ?? '').trim();
  const timeoutMsRaw = readStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalTimeoutMs);

  return {
    enabled: enabledRaw === '1' || enabledRaw === 'true',
    ...(endpoint ? { endpoint } : {}),
    timeoutMs: normalizeTimeoutMs(timeoutMsRaw),
  };
}

export function resolveAcousticProviderRuntimeConfig(): AcousticProviderRuntimeConfig {
  const strategyRaw = (readStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.routingStrategy) ?? '').trim();
  const routingStrategy: AcousticProviderRoutingStrategy = strategyRaw === 'prefer-external'
    ? 'prefer-external'
    : DEFAULT_ACOUSTIC_PROVIDER_RUNTIME_CONFIG.routingStrategy;

  const persistedExternalConfig = readExternalAcousticProviderConfigFromStorage();

  return normalizeAcousticProviderRuntimeConfig({
    routingStrategy,
    externalProvider: {
      ...persistedExternalConfig,
      ...(inMemoryProviderSecrets.externalApiKey
        ? { apiKey: inMemoryProviderSecrets.externalApiKey }
        : {}),
    },
  });
}

export function persistAcousticProviderRuntimeConfig(
  config: AcousticProviderRuntimeConfig,
): AcousticProviderRuntimeConfig {
  assertValidExternalProviderEndpoint(config.externalProvider?.endpoint);
  const normalized = normalizeAcousticProviderRuntimeConfig(config);
  if (normalized.externalProvider.apiKey) {
    inMemoryProviderSecrets.externalApiKey = normalized.externalProvider.apiKey;
  } else {
    delete inMemoryProviderSecrets.externalApiKey;
  }

  writeStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.routingStrategy, normalized.routingStrategy);
  writeStorageValue(
    ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEnabled,
    normalized.externalProvider.enabled ? 'true' : 'false',
  );
  writeStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEndpoint, normalized.externalProvider.endpoint);
  // Ensure secrets are never persisted to localStorage.
  writeStorageValue(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalApiKey, null);
  writeStorageValue(
    ACOUSTIC_PROVIDER_STORAGE_KEYS.externalTimeoutMs,
    String(normalized.externalProvider.timeoutMs),
  );
  return normalized;
}

export async function probeExternalAcousticProviderHealth(
  options: ExternalAcousticProviderHealthCheckOptions = {},
): Promise<ExternalAcousticProviderHealthCheckResult> {
  const runtimeConfig = normalizeAcousticProviderRuntimeConfig(
    options.runtimeConfig ?? resolveAcousticProviderRuntimeConfig(),
  );
  const externalConfig = runtimeConfig.externalProvider;

  if (!externalConfig.enabled) {
    return {
      state: 'disabled',
      available: false,
      message: 'External provider is disabled.',
    };
  }

  const endpoint = externalConfig.endpoint?.trim();
  if (!endpoint) {
    return {
      state: 'unconfigured',
      available: false,
      message: 'External provider endpoint is not configured.',
    };
  }

  if (!isAllowedExternalProviderEndpoint(endpoint)) {
    return {
      state: 'unconfigured',
      available: false,
      endpoint,
      message: INVALID_EXTERNAL_PROVIDER_ENDPOINT_MESSAGE,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutController = new AbortController();
  const timeoutMs = externalConfig.timeoutMs;
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), timeoutMs);
  const abortListener = () => timeoutController.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      timeoutController.abort();
    } else {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }
  }

  const cleanup = () => {
    globalThis.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortListener);
  };

  if (options.signal?.aborted) {
    cleanup();
    return {
      state: 'aborted',
      available: false,
      endpoint,
      message: 'External provider health check aborted.',
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(externalConfig.apiKey ? { authorization: `Bearer ${externalConfig.apiKey}` } : {}),
      },
      signal: timeoutController.signal,
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);

    if (response.ok) {
      return {
        state: 'available',
        available: true,
        endpoint,
        status: response.status,
        latencyMs,
      };
    }

    if (response.status === 401) {
      return {
        state: 'unauthorized',
        available: false,
        endpoint,
        status: response.status,
        latencyMs,
        message: 'External provider rejected API key (401).',
      };
    }

    if (response.status === 403) {
      return {
        state: 'forbidden',
        available: false,
        endpoint,
        status: response.status,
        latencyMs,
        message: 'External provider denied access (403).',
      };
    }

    if (response.status === 405) {
      return {
        state: 'available',
        available: true,
        endpoint,
        status: response.status,
        latencyMs,
        message: 'External provider endpoint is reachable but only accepts non-GET methods.',
      };
    }

    return {
      state: 'http-error',
      available: false,
      endpoint,
      status: response.status,
      latencyMs,
      message: `External provider returned HTTP ${response.status}.`,
    };
  } catch (error) {
    const timedOut = timeoutController.signal.aborted && !options.signal?.aborted;
    const isAbortError = error instanceof Error && error.name === 'AbortError';

    if (options.signal?.aborted || (isAbortError && !timedOut)) {
      return {
        state: 'aborted',
        available: false,
        endpoint,
        message: 'External provider health check aborted.',
      };
    }

    if (timedOut) {
      return {
        state: 'timeout',
        available: false,
        endpoint,
        message: `External provider health check timed out after ${timeoutMs}ms.`,
      };
    }

    if (error instanceof TypeError) {
      return {
        state: 'network-error',
        available: false,
        endpoint,
        message: error.message || 'Network error while probing external provider.',
      };
    }

    return {
      state: 'unknown-error',
      available: false,
      endpoint,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cleanup();
  }
}

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

export function resolveAcousticProviderReachability(
  providerId: string,
  runtimeConfig: AcousticProviderRuntimeConfig = DEFAULT_ACOUSTIC_PROVIDER_RUNTIME_CONFIG,
): AcousticProviderReachability {
  if (providerId === LOCAL_ACOUSTIC_PROVIDER_DEFINITION.id) {
    return {
      id: providerId,
      available: true,
      latencyMs: 0,
    };
  }

  if (providerId === ENHANCED_ACOUSTIC_PROVIDER_DEFINITION.id) {
    if (!runtimeConfig.externalProvider.enabled) {
      return {
        id: providerId,
        available: false,
        error: 'External provider is disabled by runtime config.',
      };
    }

    if (!runtimeConfig.externalProvider.endpoint) {
      return {
        id: providerId,
        available: false,
        error: 'External provider endpoint is not configured.',
      };
    }

    if (!isAllowedExternalProviderEndpoint(runtimeConfig.externalProvider.endpoint)) {
      return {
        id: providerId,
        available: false,
        error: INVALID_EXTERNAL_PROVIDER_ENDPOINT_MESSAGE,
      };
    }

    return {
      id: providerId,
      available: true,
    };
  }

  return {
    id: providerId,
    available: false,
    error: 'Provider is not configured in this workspace.',
  };
}

export function resolveAcousticProviderState(
  preferredId?: string | null,
  options: ResolveAcousticProviderStateOptions = {},
): ResolvedAcousticProviderState {
  const runtimeConfig = options.runtimeConfig ?? resolveAcousticProviderRuntimeConfig();
  let requested = resolveAcousticProvider(preferredId ?? undefined);
  if (!preferredId && runtimeConfig.routingStrategy === 'prefer-external') {
    requested = ENHANCED_ACOUSTIC_PROVIDER_DEFINITION;
  }

  const reachability = resolveAcousticProviderReachability(requested.id, runtimeConfig);

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
