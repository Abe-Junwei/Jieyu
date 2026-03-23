import { AnthropicProvider } from './AnthropicProvider';
import {
  CustomHttpProvider,
  type CustomHttpAuthScheme,
  type CustomHttpResponseFormat,
} from './CustomHttpProvider';
import { DeepSeekProvider } from './DeepSeekProvider';
import type { LLMProvider } from './LLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { MiniMaxProvider } from './MiniMaxProvider';
import { MockLLMProvider } from './MockLLMProvider';
import { OllamaProvider } from './OllamaProvider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { QwenProvider } from './QwenProvider';

export type AiChatProviderKind =
  | 'mock'
  | 'openai-compatible'
  | 'deepseek'
  | 'qwen'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'custom-http'
  | 'minimax';

export type AiChatProviderApiKeyMap = Partial<Record<AiChatProviderKind, string>>;
export type AiChatProviderModelMap = Partial<Record<AiChatProviderKind, string>>;
export type AiChatProviderBaseUrlMap = Partial<Record<AiChatProviderKind, string>>;
export type AiToolFeedbackStyle = 'concise' | 'detailed';

export interface AiChatSettings {
  providerKind: AiChatProviderKind;
  baseUrl: string;
  model: string;
  /** 解释/非执行对话使用的轻量模型 | Lightweight model for explain / non-execute turns */
  explainModel?: string;
  apiKey: string;
  apiKeysByProvider: AiChatProviderApiKeyMap;
  modelsByProvider?: AiChatProviderModelMap;
  baseUrlsByProvider?: AiChatProviderBaseUrlMap;
  toolFeedbackStyle: AiToolFeedbackStyle;
  endpointUrl: string;
  authHeaderName: string;
  authScheme: CustomHttpAuthScheme;
  responseFormat: CustomHttpResponseFormat;
  /** 备用 provider（主模型限速/不可用时自动降级）| Fallback provider (auto-degrade on rate-limit / unavailable) */
  fallbackProviderKind?: AiChatProviderKind;
}

// ─── Unified create config (flat, all fields optional) ───────────────────────
// This works with exactOptionalPropertyTypes: missing fields are simply absent,
// never passed as explicit undefined.

export interface AiChatProviderCreateConfig {
  kind: AiChatProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointUrl?: string;
  authHeaderName?: string;
  authScheme?: CustomHttpAuthScheme;
  responseFormat?: CustomHttpResponseFormat;
}

export interface AiChatFieldDefinition {
  key: keyof AiChatSettings;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface AiChatProviderDefinition {
  kind: AiChatProviderKind;
  label: string;
  description: string;
  /** Short tag shown in the UI list, e.g. "本地" or "付费" */
  tag?: string;
  fields: AiChatFieldDefinition[];
  create(config: AiChatProviderCreateConfig): LLMProvider;
}

// ─── Config builders (avoid exactOptionalPropertyTypes undefined issues) ───

function buildOpenAIConfig(cfg: { baseUrl?: string; apiKey?: string; model?: string }):
  { baseUrl: string; apiKey: string; model: string } {
  return {
    baseUrl: cfg.baseUrl || 'https://api.openai.com/v1',
    apiKey: cfg.apiKey || '',
    model: cfg.model || 'gpt-4o-mini',
  };
}

function buildAnthropicConfig(cfg: { baseUrl?: string; apiKey?: string; model?: string }):
  { baseUrl: string; apiKey: string; model: string } {
  return {
    baseUrl: cfg.baseUrl || 'https://api.anthropic.com/v1',
    apiKey: cfg.apiKey || '',
    model: cfg.model || 'claude-3-5-sonnet-latest',
  };
}

function buildGeminiConfig(cfg: { baseUrl?: string; apiKey?: string; model?: string }):
  { baseUrl: string; apiKey: string; model: string } {
  return {
    baseUrl: cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: cfg.apiKey || '',
    model: cfg.model || 'gemini-2.0-flash',
  };
}

function buildOllamaConfig(cfg: { baseUrl?: string; model?: string }):
  { baseUrl: string; model: string } {
  return {
    baseUrl: cfg.baseUrl || 'http://localhost:11434',
    model: cfg.model || '',
  };
}

// ─── Provider Registry ──────────────────────────────────────────────────────

const PROVIDER_DEFINITIONS: Record<AiChatProviderKind, AiChatProviderDefinition> = {
  mock: {
    kind: 'mock',
    label: 'Mock',
    description: '本地模拟回复，不访问远程接口。',
    tag: '本地',
    fields: [],
    create: (): LLMProvider => new MockLLMProvider(),
  },
  minimax: {
    kind: 'minimax',
    label: 'MiniMax',
    description: 'MiniMax AI（OpenAI兼容接口）。免费额度充足，国内直连。',
    tag: '国内',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.minimax.chat/v1（留空默认）', required: false },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'MiniMax-Text-01（留空默认）', required: false },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'eyJ...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new MiniMaxProvider({ baseUrl: cfg.baseUrl || 'https://api.minimax.chat/v1', apiKey: cfg.apiKey || '', model: cfg.model || 'MiniMax-Text-01' }),
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: '适配 OpenAI Chat Completions 兼容接口，如 OpenAI、OpenRouter、vLLM、One API、硅基流动等。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'gpt-4o-mini', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new OpenAICompatibleProvider(buildOpenAIConfig(cfg)),
  },
  deepseek: {
    kind: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方 API（直连）。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.deepseek.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'deepseek-chat', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new DeepSeekProvider({ baseUrl: cfg.baseUrl || '', apiKey: cfg.apiKey || '', model: cfg.model || 'deepseek-chat' }),
  },
  qwen: {
    kind: 'qwen',
    label: 'Qwen (千问)',
    description: '阿里云 DashScope 千问 API（直连）。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'qwen-plus', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new QwenProvider({ baseUrl: cfg.baseUrl || '', apiKey: cfg.apiKey || '', model: cfg.model || 'qwen-plus' }),
  },
  anthropic: {
    kind: 'anthropic',
    label: 'Anthropic',
    description: 'Anthropic 官方 Messages API（直连）。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.anthropic.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'claude-3-5-sonnet-latest', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new AnthropicProvider(buildAnthropicConfig(cfg)),
  },
  gemini: {
    kind: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini 官方 Generate Content API（直连）。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://generativelanguage.googleapis.com/v1beta', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'gemini-2.0-flash', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AIza...', required: true },
    ],
    create: (cfg): LLMProvider =>
      new GeminiProvider(buildGeminiConfig(cfg)),
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama (本地)',
    description: 'Ollama 官方 /api/chat（直连）。完全本地运行，无需 API Key。',
    tag: '本地',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'http://localhost:11434', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'e.g. llama3.2, qwen2.5', required: true },
    ],
    create: (cfg): LLMProvider =>
      new OllamaProvider(buildOllamaConfig(cfg)),
  },
  'custom-http': {
    kind: 'custom-http',
    label: 'Custom HTTP',
    description: '适配私有网关或非内置厂商：向任意 endpoint URL 发送统一 chat 请求，并按所选响应格式解析。',
    tag: '高级',
    fields: [
      { key: 'endpointUrl', label: 'Endpoint URL', type: 'text', placeholder: 'https://your-gateway.example.com/chat', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'your-model-name', required: true },
      { key: 'authHeaderName', label: 'Auth Header', type: 'text', placeholder: 'Authorization', required: false },
      {
        key: 'authScheme',
        label: 'Auth Scheme',
        type: 'select',
        placeholder: '',
        required: true,
        options: [
          { value: 'none', label: 'None' },
          { value: 'bearer', label: 'Bearer <apiKey>' },
          { value: 'raw', label: 'Raw apiKey' },
        ],
      },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'optional / required by gateway', required: false },
      {
        key: 'responseFormat',
        label: 'Response Format',
        type: 'select',
        placeholder: '',
        required: true,
        options: [
          { value: 'openai-sse', label: 'OpenAI SSE' },
          { value: 'anthropic-sse', label: 'Anthropic SSE' },
          { value: 'ollama-jsonl', label: 'Ollama JSONL' },
          { value: 'plain-json', label: 'Plain JSON' },
        ],
      },
    ],
    create: (cfg): LLMProvider =>
      new CustomHttpProvider({
        endpointUrl: cfg.endpointUrl || '',
        model: cfg.model || 'custom-model',
        apiKey: cfg.apiKey ?? '',
        authHeaderName: cfg.authHeaderName ?? 'Authorization',
        authScheme: cfg.authScheme ?? 'bearer',
        responseFormat: cfg.responseFormat ?? 'openai-sse',
      }),
  },
};

export const aiChatProviderDefinitions = Object.values(PROVIDER_DEFINITIONS);

export function getAiChatProviderDefinition(kind: AiChatProviderKind): AiChatProviderDefinition {
  return PROVIDER_DEFINITIONS[kind] ?? PROVIDER_DEFINITIONS.mock;
}

// ─── Settings helpers ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<AiChatProviderKind, AiChatSettings> = {
  mock: {
    providerKind: 'mock', baseUrl: '', model: 'mock-1', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
  minimax: {
    providerKind: 'minimax', baseUrl: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
  'openai-compatible': {
    providerKind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
  deepseek: {
    providerKind: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
  qwen: {
    providerKind: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
  anthropic: {
    providerKind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'x-api-key', authScheme: 'raw', responseFormat: 'anthropic-sse',
  },
  gemini: {
    providerKind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'x-goog-api-key', authScheme: 'raw', responseFormat: 'plain-json',
  },
  ollama: {
    providerKind: 'ollama', baseUrl: 'http://localhost:11434', model: '', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'none', responseFormat: 'ollama-jsonl',
  },
  'custom-http': {
    providerKind: 'custom-http', baseUrl: '', model: 'custom-model', apiKey: '',
    apiKeysByProvider: {},
    modelsByProvider: {},
    baseUrlsByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '', authHeaderName: 'Authorization', authScheme: 'bearer', responseFormat: 'openai-sse',
  },
};

export function getDefaultAiChatSettings(kind: AiChatProviderKind): AiChatSettings {
  return { ...DEFAULT_SETTINGS[kind] };
}

function normalizeApiKeysByProvider(raw: unknown): AiChatProviderApiKeyMap {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const normalized: AiChatProviderApiKeyMap = {};

  for (const kind of Object.keys(DEFAULT_SETTINGS) as AiChatProviderKind[]) {
    const value = source[kind];
    if (typeof value === 'string') {
      normalized[kind] = value;
    }
  }

  return normalized;
}

function normalizeModelsByProvider(raw: unknown): AiChatProviderModelMap {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const normalized: AiChatProviderModelMap = {};

  for (const kind of Object.keys(DEFAULT_SETTINGS) as AiChatProviderKind[]) {
    const value = source[kind];
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[kind] = value;
    }
  }

  return normalized;
}

function normalizeBaseUrlsByProvider(raw: unknown): AiChatProviderBaseUrlMap {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const normalized: AiChatProviderBaseUrlMap = {};

  for (const kind of Object.keys(DEFAULT_SETTINGS) as AiChatProviderKind[]) {
    const value = source[kind];
    if (typeof value === 'string') {
      normalized[kind] = value;
    }
  }

  return normalized;
}

export function normalizeAiChatSettings(raw?: Partial<AiChatSettings>): AiChatSettings {
  const providerKind = raw?.providerKind && raw.providerKind in DEFAULT_SETTINGS
    ? raw.providerKind
    : 'mock';
  const defaults = getDefaultAiChatSettings(providerKind);
  const rawApiKeysByProvider = normalizeApiKeysByProvider(raw?.apiKeysByProvider);
  const rawModelsByProvider = normalizeModelsByProvider(raw?.modelsByProvider);
  const rawBaseUrlsByProvider = normalizeBaseUrlsByProvider(raw?.baseUrlsByProvider);
  const apiKeyFromRaw = typeof raw?.apiKey === 'string' ? raw.apiKey : undefined;
  const apiKeyFromMap = rawApiKeysByProvider[providerKind];
  const effectiveApiKey = apiKeyFromRaw ?? apiKeyFromMap ?? defaults.apiKey;
  const baseUrlFromRaw = typeof raw?.baseUrl === 'string' ? raw.baseUrl : undefined;
  const baseUrlFromMap = rawBaseUrlsByProvider[providerKind];
  const effectiveBaseUrl = baseUrlFromRaw ?? baseUrlFromMap ?? defaults.baseUrl;
  const modelFromRaw = typeof raw?.model === 'string' && raw.model.trim().length > 0 ? raw.model : undefined;
  const modelFromMap = rawModelsByProvider[providerKind];
  const effectiveModel = modelFromRaw ?? modelFromMap ?? defaults.model;
  const apiKeysByProvider: AiChatProviderApiKeyMap = {
    ...rawApiKeysByProvider,
    [providerKind]: effectiveApiKey,
  };
  const modelsByProvider: AiChatProviderModelMap = {
    ...rawModelsByProvider,
    [providerKind]: effectiveModel,
  };
  const baseUrlsByProvider: AiChatProviderBaseUrlMap = {
    ...rawBaseUrlsByProvider,
    [providerKind]: effectiveBaseUrl,
  };

  return {
    providerKind,
    baseUrl: effectiveBaseUrl,
    model: effectiveModel,
    apiKey: effectiveApiKey,
    apiKeysByProvider,
    modelsByProvider,
    baseUrlsByProvider,
    toolFeedbackStyle: raw?.toolFeedbackStyle === 'concise' || raw?.toolFeedbackStyle === 'detailed'
      ? raw.toolFeedbackStyle
      : defaults.toolFeedbackStyle,
    ...(typeof raw?.explainModel === 'string' && raw.explainModel.trim().length > 0 ? { explainModel: raw.explainModel } : {}),
    endpointUrl: typeof raw?.endpointUrl === 'string' ? raw.endpointUrl : defaults.endpointUrl,
    authHeaderName: typeof raw?.authHeaderName === 'string' ? raw.authHeaderName : defaults.authHeaderName,
    authScheme: raw?.authScheme === 'none' || raw?.authScheme === 'raw' || raw?.authScheme === 'bearer'
      ? raw.authScheme
      : defaults.authScheme,
    responseFormat: raw?.responseFormat === 'openai-sse'
      || raw?.responseFormat === 'anthropic-sse'
      || raw?.responseFormat === 'ollama-jsonl'
      || raw?.responseFormat === 'plain-json'
      ? raw.responseFormat
      : defaults.responseFormat,
    ...(raw?.fallbackProviderKind && raw.fallbackProviderKind in DEFAULT_SETTINGS
      ? { fallbackProviderKind: raw.fallbackProviderKind }
      : {}),
  };
}

export function applyAiChatSettingsPatch(
  current: AiChatSettings,
  patch: Partial<AiChatSettings>,
): AiChatSettings {
  const incomingMap = normalizeApiKeysByProvider(patch.apiKeysByProvider);
  const incomingModelMap = normalizeModelsByProvider(patch.modelsByProvider);
  const incomingBaseUrlMap = normalizeBaseUrlsByProvider(patch.baseUrlsByProvider);

  if (patch.providerKind && patch.providerKind !== current.providerKind) {
    const persistedApiKeysByProvider: AiChatProviderApiKeyMap = {
      ...current.apiKeysByProvider,
      [current.providerKind]: current.apiKey,
      ...incomingMap,
    };
    const persistedModelsByProvider: AiChatProviderModelMap = {
      ...(current.modelsByProvider ?? {}),
      [current.providerKind]: current.model,
      ...incomingModelMap,
    };
    const persistedBaseUrlsByProvider: AiChatProviderBaseUrlMap = {
      ...(current.baseUrlsByProvider ?? {}),
      [current.providerKind]: current.baseUrl,
      ...incomingBaseUrlMap,
    };
    const nextProviderApiKey = typeof patch.apiKey === 'string'
      ? patch.apiKey
      : (persistedApiKeysByProvider[patch.providerKind] ?? '');
    const nextProviderBaseUrl = typeof patch.baseUrl === 'string'
      ? patch.baseUrl
      : (persistedBaseUrlsByProvider[patch.providerKind] ?? getDefaultAiChatSettings(patch.providerKind).baseUrl);
    const nextProviderModel = typeof patch.model === 'string' && patch.model.trim().length > 0
      ? patch.model
      : (persistedModelsByProvider[patch.providerKind] ?? getDefaultAiChatSettings(patch.providerKind).model);

    return normalizeAiChatSettings({
      ...getDefaultAiChatSettings(patch.providerKind),
      apiKeysByProvider: {
        ...persistedApiKeysByProvider,
        [patch.providerKind]: nextProviderApiKey,
      },
      modelsByProvider: {
        ...persistedModelsByProvider,
        [patch.providerKind]: nextProviderModel,
      },
      baseUrlsByProvider: {
        ...persistedBaseUrlsByProvider,
        [patch.providerKind]: nextProviderBaseUrl,
      },
      apiKey: nextProviderApiKey,
      baseUrl: nextProviderBaseUrl,
      model: nextProviderModel,
      ...patch,
    });
  }

  const nextApiKeysByProvider: AiChatProviderApiKeyMap = {
    ...current.apiKeysByProvider,
    ...incomingMap,
  };
  const nextModelsByProvider: AiChatProviderModelMap = {
    ...(current.modelsByProvider ?? {}),
    ...incomingModelMap,
  };
  const nextBaseUrlsByProvider: AiChatProviderBaseUrlMap = {
    ...(current.baseUrlsByProvider ?? {}),
    ...incomingBaseUrlMap,
  };
  if (typeof patch.apiKey === 'string') {
    nextApiKeysByProvider[current.providerKind] = patch.apiKey;
  }
  if (typeof patch.baseUrl === 'string') {
    nextBaseUrlsByProvider[current.providerKind] = patch.baseUrl;
  }
  if (typeof patch.model === 'string' && patch.model.trim().length > 0) {
    nextModelsByProvider[current.providerKind] = patch.model;
  }

  return normalizeAiChatSettings({
    ...current,
    ...patch,
    apiKeysByProvider: nextApiKeysByProvider,
    modelsByProvider: nextModelsByProvider,
    baseUrlsByProvider: nextBaseUrlsByProvider,
  });
}

// ─── Provider factory (registry-based) ──────────────────────────────────────

/** Convert full AiChatSettings to the minimal create config for a given kind. */
function settingsToCreateConfig(settings: AiChatSettings): AiChatProviderCreateConfig {
  switch (settings.providerKind) {
    case 'mock': return { kind: 'mock' };
    case 'minimax': return { kind: 'minimax', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'openai-compatible': return { kind: 'openai-compatible', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'deepseek': return { kind: 'deepseek', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'qwen': return { kind: 'qwen', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'anthropic': return { kind: 'anthropic', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'gemini': return { kind: 'gemini', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
    case 'ollama': return { kind: 'ollama', baseUrl: settings.baseUrl, model: settings.model };
    case 'custom-http': return {
      kind: 'custom-http',
      endpointUrl: settings.endpointUrl,
      model: settings.model,
      apiKey: settings.apiKey,
      authHeaderName: settings.authHeaderName,
      authScheme: settings.authScheme,
      responseFormat: settings.responseFormat,
    };
  }
}

export function createAiChatProvider(settings: AiChatSettings): LLMProvider {
  const def = PROVIDER_DEFINITIONS[settings.providerKind];
  if (!def) return new MockLLMProvider();
  return def.create(settingsToCreateConfig(settings));
}
