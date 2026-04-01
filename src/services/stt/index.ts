/**
 * Commercial STT Provider Registry
 *
 * Central factory for creating CommercialSttProvider instances by kind.
 * Add new providers here to make them available in the UI selector.
 */

import type {
  CommercialSttProvider,
  CommercialProviderKind,
  SttProviderCapability,
  SttBillingKind,
} from '../VoiceInputService';
import { GeminiSttProvider } from './GeminiSttProvider';
import { OpenAISttProvider } from './OpenAISttProvider';
import { GroqSttProvider } from './GroqSttProvider';
import { MiniMaxSttProvider } from './MiniMaxSttProvider';
import { VolcEngineSttProvider } from './VolcEngineSttProvider';

export interface CommercialProviderDefinition {
  kind: CommercialProviderKind;
  label: string;
  description: string;
  capability: SttProviderCapability;
  billing: SttBillingKind;
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
    kind: 'gemini',
    label: 'Gemini 2.0 Flash',
    description: 'Google \u591a\u6a21\u6001\u6a21\u578b\uff0c\u652f\u6301\u97f3\u9891\u8f93\u5165\u3002\u9700 API Key\uff08$0.003/\u5206\u949f\u97f3\u9891\uff09\u3002',
    capability: 'cloud-api',
    billing: 'metered',
    create: (cfg): CommercialSttProvider =>
      new GeminiSttProvider(buildGeminiConfig(cfg)),
  },
  'openai-audio': {
    kind: 'openai-audio',
    label: 'OpenAI Audio (Whisper)',
    description: 'OpenAI Whisper API\u3002\u9700 API Key\uff0c\u6309\u7528\u91cf\u8ba1\u8d39\u3002',
    capability: 'cloud-api',
    billing: 'metered',
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider(buildOpenAIConfig(cfg)),
  },
  groq: {
    kind: 'groq',
    label: 'Groq Whisper (\u514d\u8d39 tier)',
    description: 'Groq Cloud \u514d\u8d39 Whisper\uff0c14,400\u79d2/\u6708\u3002\u9700 Groq API Key\uff08gsk_\u5f00\u5934\uff09\u3002',
    capability: 'cloud-api',
    billing: 'free',
    create: (cfg): CommercialSttProvider =>
      new GroqSttProvider(buildGroqConfig(cfg)),
  },
  'custom-http': {
    kind: 'custom-http',
    label: '\u81ea\u5b9a\u4e49 HTTP\uff08OpenAI\u517c\u5bb9\uff09',
    description: '\u63a5\u5165\u4efb\u610f OpenAI-compatible \u97f3\u9891\u8f6c\u5199\u63a5\u53e3\uff08OneAPI\u3001vLLM \u7b49\uff09\u3002',
    capability: 'cloud-api',
    billing: 'self-hosted',
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider({ apiKey: cfg.apiKey ?? '', baseUrl: cfg.baseUrl ?? 'http://localhost:3000' }),
  },
  minimax: {
    kind: 'minimax',
    label: 'MiniMax ASR (\u514d\u8d39 1000\u5206\u949f/\u6708)',
    description: 'MiniMax AI \u8bed\u97f3\u8f6c\u5199\uff0cOpenAI\u517c\u5bb9\u63a5\u53e3\uff0c\u514d\u8d39\u989d\u5ea6\u5145\u8db3\u3002\u9700 API Key\u3002',
    capability: 'cloud-api',
    billing: 'free',
    create: (cfg): CommercialSttProvider =>
      new MiniMaxSttProvider(buildMiniMaxConfig(cfg)),
  },
  volcengine: {
    kind: 'volcengine',
    label: '\u706b\u5c71\u5f15\u64ce ASR (\u5b57\u8282\u8df3\u52a8)',
    description: '\u5b57\u8282\u8df3\u52a8\u706b\u5c71\u5f15\u64ce\u8bed\u97f3\u8bc6\u522b\u3002\u9700 App ID + Access Token\uff08\u514d\u8d39\u6ce8\u518c\uff09\u3002',
    capability: 'cloud-api',
    billing: 'metered',
    create: (cfg): CommercialSttProvider =>
      new VolcEngineSttProvider(buildVolcEngineConfig(cfg)),
  },
};

export const commercialProviderDefinitions = Object.values(PROVIDERS);

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

/** Result of probing a single provider's reachability. */
export interface ProviderReachability {
  kind: CommercialProviderKind;
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
      if (!config?.apiKey && !config?.appId) {
        // No credentials configured — skip probe, treat as unavailable
        return { kind: def.kind, available: false as const };
      }
      try {
        const t0 = Date.now();
        const provider = createCommercialProvider(def.kind, config);
        // Use Promise.race to enforce real timeout cancellation.
        const available = await Promise.race([
          provider.isAvailable(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Probe timeout')), timeoutMs),
          ),
        ]);
        return {
          kind: def.kind,
          available,
          latencyMs: Date.now() - t0,
          ...(available ? {} : { error: 'Probe returned false' }),
        };
      } catch (err) {
        return {
          kind: def.kind,
          available: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}
