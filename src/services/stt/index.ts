/**
 * Commercial STT Provider Registry
 *
 * Central factory for creating CommercialSttProvider instances by kind.
 * Add new providers here to make them available in the UI selector.
 */

import type {
  CommercialSttProvider,
  CommercialProviderKind,
  SttEngine,
} from '../VoiceInputService';
import { LocalWhisperSttProvider } from './LocalWhisperSttProvider';
import { GeminiSttProvider } from './GeminiSttProvider';
import { OpenAISttProvider } from './OpenAISttProvider';
import { GroqSttProvider } from './GroqSttProvider';
import { MiniMaxSttProvider } from './MiniMaxSttProvider';
import { VolcEngineSttProvider } from './VolcEngineSttProvider';
import {
  commercialProviderDefinitions as commercialProviderMetadataDefinitions,
  getSttProviderMetadataByKind,
  type CommercialProviderMetadata,
  type SttProviderKind,
} from './providerMetadata';
import { testSttEnhancementProvider } from './enhancementRegistry';

export interface CommercialProviderDefinition extends CommercialProviderMetadata {
  /** Create a provider instance from user settings */
  create(config: CommercialProviderCreateConfig): CommercialSttProvider;
}

export interface CommercialProviderCreateConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Volcano Engine: app ID */
  appId?: string;
  /** Volcano Engine: access token */
  accessToken?: string;
}

function buildGeminiConfig(cfg: CommercialProviderCreateConfig): { apiKey: string; baseUrl?: string } {
  return cfg.baseUrl
    ? { apiKey: cfg.apiKey ?? '', baseUrl: cfg.baseUrl }
    : { apiKey: cfg.apiKey ?? '' };
}

function buildOpenAIConfig(cfg: CommercialProviderCreateConfig): { apiKey: string; baseUrl?: string; model?: string } {
  return {
    apiKey: cfg.apiKey ?? '',
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
  };
}

function buildGroqConfig(cfg: CommercialProviderCreateConfig): { apiKey: string; model?: string } {
  return cfg.model
    ? { apiKey: cfg.apiKey ?? '', model: cfg.model }
    : { apiKey: cfg.apiKey ?? '' };
}

function buildMiniMaxConfig(cfg: CommercialProviderCreateConfig): { apiKey: string; baseUrl?: string; model?: string } {
  return {
    apiKey: cfg.apiKey ?? '',
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
  };
}

function buildVolcEngineConfig(cfg: CommercialProviderCreateConfig): { appId: string; accessToken: string; baseUrl?: string } {
  return {
    appId: cfg.appId ?? '',
    accessToken: cfg.accessToken ?? '',
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
  };
}

const PROVIDERS: Record<CommercialProviderKind, CommercialProviderDefinition> = {
  gemini: {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'gemini')!,
    create: (cfg): CommercialSttProvider =>
      new GeminiSttProvider(buildGeminiConfig(cfg)),
  },
  'openai-audio': {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'openai-audio')!,
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider(buildOpenAIConfig(cfg)),
  },
  groq: {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'groq')!,
    create: (cfg): CommercialSttProvider =>
      new GroqSttProvider(buildGroqConfig(cfg)),
  },
  'custom-http': {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'custom-http')!,
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider({ apiKey: cfg.apiKey ?? '', baseUrl: cfg.baseUrl ?? 'http://localhost:3000' }),
  },
  minimax: {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'minimax')!,
    create: (cfg): CommercialSttProvider =>
      new MiniMaxSttProvider(buildMiniMaxConfig(cfg)),
  },
  volcengine: {
    ...commercialProviderMetadataDefinitions.find((definition) => definition.kind === 'volcengine')!,
    create: (cfg): CommercialSttProvider =>
      new VolcEngineSttProvider(buildVolcEngineConfig(cfg)),
  },
};

export const commercialProviderDefinitions = Object.values(PROVIDERS);

function hasCommercialCredentials(config: CommercialProviderCreateConfig | undefined): boolean {
  return Boolean(config?.apiKey || config?.appId);
}

function isWebSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.SpeechRecognition === 'function' || typeof window.webkitSpeechRecognition === 'function';
}

export function createCommercialProvider(
  kind: CommercialProviderKind,
  config: CommercialProviderCreateConfig,
): CommercialSttProvider {
  return PROVIDERS[kind]?.create(config) ?? PROVIDERS['groq'].create(config);
}

export function getCommercialProviderDefinition(kind: CommercialProviderKind): CommercialProviderDefinition {
  return PROVIDERS[kind] ?? PROVIDERS['groq'];
}

/** Test commercial provider availability by constructing and calling isAvailable(). */
export async function testCommercialProvider(
  kind: CommercialProviderKind,
  config: CommercialProviderCreateConfig,
): Promise<{ available: boolean; error?: string }> {
  try {
    const provider = createCommercialProvider(kind, config);
    const available = await provider.isAvailable();
    return { available };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testSttProvider(
  kind: SttProviderKind,
  config: CommercialProviderCreateConfig = {},
): Promise<{ available: boolean; error?: string }> {
  if (kind === 'web-speech') {
    return { available: isWebSpeechAvailable() };
  }

  if (kind === 'whisper-local') {
    try {
      const provider = new LocalWhisperSttProvider({
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(config.model ? { model: config.model } : {}),
      });
      const available = await provider.isAvailable();
      return { available };
    } catch (err) {
      return { available: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return testCommercialProvider(kind, config);
}

/** Result of probing a single provider's reachability. */
export interface ProviderReachability {
  kind: SttProviderKind;
  engine: SttEngine;
  available: boolean;
  /** Milliseconds the probe took. */
  latencyMs?: number;
  /** Error message if unavailable (absent means no credentials configured). */
  error?: string;
}

/**
 * Probe all registered commercial providers simultaneously.
 * Skips providers whose config is empty (no API key etc.).
 *
 * Used by the settings UI to show 🟢/🔴 status badges next to each provider.
 */
export async function probeAllCommercialProviders(
  configs: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>>,
  timeoutMs = 5000,
): Promise<ProviderReachability[]> {
  const results = await Promise.all(
    commercialProviderDefinitions.map(async (def) => {
      const config = configs[def.kind];
      if (!hasCommercialCredentials(config)) {
        // No credentials configured — skip probe, treat as unavailable
        return { kind: def.kind, engine: 'commercial' as const, available: false as const };
      }
      try {
        const t0 = Date.now();
        const provider = createCommercialProvider(def.kind, config ?? {});
        // Use Promise.race to enforce real timeout cancellation.
        const available = await Promise.race([
          provider.isAvailable(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Probe timeout')), timeoutMs),
          ),
        ]);
        return {
          kind: def.kind,
          engine: 'commercial' as const,
          available,
          latencyMs: Date.now() - t0,
          ...(available ? {} : { error: 'Probe returned false' }),
        };
      } catch (err) {
        return {
          kind: def.kind,
          engine: 'commercial' as const,
          available: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}

export async function probeAllSttProviders(
  input: {
    whisperLocalConfig?: Pick<CommercialProviderCreateConfig, 'baseUrl' | 'model'>;
    commercialConfigs?: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>>;
  } = {},
  timeoutMs = 5000,
): Promise<ProviderReachability[]> {
  const builtinResults: ProviderReachability[] = [
    {
      kind: 'web-speech',
      engine: 'web-speech',
      available: isWebSpeechAvailable(),
    },
  ];

  const whisperStartedAt = Date.now();
  const whisperProbe = await testSttProvider('whisper-local', {
    ...(input.whisperLocalConfig?.baseUrl ? { baseUrl: input.whisperLocalConfig.baseUrl } : {}),
    ...(input.whisperLocalConfig?.model ? { model: input.whisperLocalConfig.model } : {}),
  });
  builtinResults.push({
    kind: 'whisper-local',
    engine: 'whisper-local',
    available: whisperProbe.available,
    latencyMs: Date.now() - whisperStartedAt,
    ...(whisperProbe.error ? { error: whisperProbe.error } : {}),
  });

  const commercialResults = await probeAllCommercialProviders(input.commercialConfigs ?? {}, timeoutMs);
  return [...builtinResults, ...commercialResults];
}

export function getSttProviderDefinition(kind: SttProviderKind) {
  return getSttProviderMetadataByKind(kind);
}

export async function probeSelectedSttEnhancement(
  kind: import('./enhancementRegistry').SttEnhancementSelectionKind,
  config: import('./enhancementRegistry').SttEnhancementConfig = {},
): Promise<import('./enhancementRegistry').SttEnhancementReachability | null> {
  if (kind === 'none') {
    return null;
  }

  return testSttEnhancementProvider(kind, config);
}

export * from './enhancementRegistry';
export {
  builtinProviderDefinitions,
  commercialProviderDefinitions as commercialProviderMetadata,
  getActiveSttProviderMetadata,
  getSttProviderMetadataByKind,
  sttProviderDefinitions,
} from './providerMetadata';
