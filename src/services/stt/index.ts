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
    description: 'Google 多模态模型，支持音频输入。需 API Key（$0.003/分钟音频）。',
    capability: 'cloud-api',
    billing: 'metered',
    create: (cfg): CommercialSttProvider =>
      new GeminiSttProvider(buildGeminiConfig(cfg)),
  },
  'openai-audio': {
    kind: 'openai-audio',
    label: 'OpenAI Audio (Whisper)',
    description: 'OpenAI Whisper API。需 API Key，按用量计费。',
    capability: 'cloud-api',
    billing: 'metered',
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider(buildOpenAIConfig(cfg)),
  },
  groq: {
    kind: 'groq',
    label: 'Groq Whisper (免费 tier)',
    description: 'Groq Cloud 免费 Whisper，14,400秒/月。需 Groq API Key（gsk_开头）。',
    capability: 'cloud-api',
    billing: 'free',
    create: (cfg): CommercialSttProvider =>
      new GroqSttProvider(buildGroqConfig(cfg)),
  },
  'custom-http': {
    kind: 'custom-http',
    label: '自定义 HTTP（OpenAI兼容）',
    description: '接入任意 OpenAI-compatible 音频转写接口（OneAPI、vLLM 等）。',
    capability: 'cloud-api',
    billing: 'self-hosted',
    create: (cfg): CommercialSttProvider =>
      new OpenAISttProvider({ apiKey: cfg.apiKey ?? '', baseUrl: cfg.baseUrl ?? 'http://localhost:3000' }),
  },
  minimax: {
    kind: 'minimax',
    label: 'MiniMax ASR (免费 1000分钟/月)',
    description: 'MiniMax AI 语音转写，OpenAI兼容接口，免费额度充足。需 API Key。',
    capability: 'cloud-api',
    billing: 'free',
    create: (cfg): CommercialSttProvider =>
      new MiniMaxSttProvider(buildMiniMaxConfig(cfg)),
  },
  volcengine: {
    kind: 'volcengine',
    label: '火山引擎 ASR (字节跳动)',
    description: '字节跳动火山引擎语音识别。需 App ID + Access Token（免费注册）。',
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
        // 用 Promise.race 实现真正的超时中断 | Race against timeout for real cancellation
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
