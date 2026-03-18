import { AnthropicProvider } from './AnthropicProvider';
import {
  CustomHttpProvider,
  type CustomHttpAuthScheme,
  type CustomHttpResponseFormat,
} from './CustomHttpProvider';
import { DeepSeekProvider } from './DeepSeekProvider';
import type { LLMProvider } from './LLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { MockLLMProvider } from './MockLLMProvider';
import { OllamaProvider } from './OllamaProvider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { QwenProvider } from './QwenProvider';

export type AiChatProviderKind = 'mock' | 'openai-compatible' | 'deepseek' | 'qwen' | 'anthropic' | 'gemini' | 'ollama' | 'custom-http';

export interface AiChatSettings {
  providerKind: AiChatProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  endpointUrl: string;
  authHeaderName: string;
  authScheme: CustomHttpAuthScheme;
  responseFormat: CustomHttpResponseFormat;
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
  fields: AiChatFieldDefinition[];
}

const PROVIDER_DEFINITIONS: Record<AiChatProviderKind, AiChatProviderDefinition> = {
  mock: {
    kind: 'mock',
    label: 'Mock',
    description: '本地模拟回复，不访问远程接口。',
    fields: [],
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: '适配 OpenAI Chat Completions 兼容接口，如 OpenAI、OpenRouter、vLLM、One API。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'gpt-4o-mini', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
  },
  deepseek: {
    kind: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方 API（直连）。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.deepseek.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'deepseek-chat', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
  },
  qwen: {
    kind: 'qwen',
    label: 'Qwen (千问)',
    description: '阿里云 DashScope 千问 API（直连）。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'qwen-plus', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
  },
  anthropic: {
    kind: 'anthropic',
    label: 'Anthropic',
    description: 'Anthropic 官方 Messages API（直连）。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.anthropic.com/v1', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'claude-3-5-sonnet-latest', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', required: true },
    ],
  },
  gemini: {
    kind: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini 官方 Generate Content API（直连）。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://generativelanguage.googleapis.com/v1beta', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'gemini-2.0-flash', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AIza...', required: true },
    ],
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama',
    description: 'Ollama 官方 /api/chat（直连）。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'http://localhost:11434', required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'llama3.2', required: true },
    ],
  },
  'custom-http': {
    kind: 'custom-http',
    label: 'Custom HTTP',
    description: '适配私有网关或非内置厂商：向任意 endpoint URL 发送统一 chat 请求，并按所选响应格式解析。',
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
  },
};

const DEFAULT_SETTINGS: Record<AiChatProviderKind, AiChatSettings> = {
  mock: {
    providerKind: 'mock',
    baseUrl: '',
    model: 'mock-1',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'openai-sse',
  },
  'openai-compatible': {
    providerKind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'openai-sse',
  },
  deepseek: {
    providerKind: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'openai-sse',
  },
  qwen: {
    providerKind: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'openai-sse',
  },
  anthropic: {
    providerKind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'x-api-key',
    authScheme: 'raw',
    responseFormat: 'anthropic-sse',
  },
  gemini: {
    providerKind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'x-goog-api-key',
    authScheme: 'raw',
    responseFormat: 'plain-json',
  },
  ollama: {
    providerKind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'none',
    responseFormat: 'ollama-jsonl',
  },
  'custom-http': {
    providerKind: 'custom-http',
    baseUrl: '',
    model: 'custom-model',
    apiKey: '',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'openai-sse',
  },
};

export const aiChatProviderDefinitions = Object.values(PROVIDER_DEFINITIONS);

export function getAiChatProviderDefinition(kind: AiChatProviderKind): AiChatProviderDefinition {
  return PROVIDER_DEFINITIONS[kind];
}

export function getDefaultAiChatSettings(kind: AiChatProviderKind): AiChatSettings {
  return { ...DEFAULT_SETTINGS[kind] };
}

export function normalizeAiChatSettings(raw?: Partial<AiChatSettings>): AiChatSettings {
  const providerKind = raw?.providerKind && raw.providerKind in PROVIDER_DEFINITIONS
    ? raw.providerKind
    : 'mock';
  const defaults = getDefaultAiChatSettings(providerKind);

  return {
    providerKind,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl : defaults.baseUrl,
    model: typeof raw?.model === 'string' && raw.model.trim().length > 0 ? raw.model : defaults.model,
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : defaults.apiKey,
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
  };
}

export function applyAiChatSettingsPatch(
  current: AiChatSettings,
  patch: Partial<AiChatSettings>,
): AiChatSettings {
  if (patch.providerKind && patch.providerKind !== current.providerKind) {
    return normalizeAiChatSettings({
      ...getDefaultAiChatSettings(patch.providerKind),
      apiKey: patch.apiKey ?? '',
      ...patch,
    });
  }

  return normalizeAiChatSettings({
    ...current,
    ...patch,
  });
}

export function createAiChatProvider(settings: AiChatSettings): LLMProvider {
  switch (settings.providerKind) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    case 'qwen':
      return new QwenProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    case 'deepseek':
      return new DeepSeekProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    case 'anthropic':
      return new AnthropicProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    case 'gemini':
      return new GeminiProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    case 'ollama':
      return new OllamaProvider({
        baseUrl: settings.baseUrl,
        model: settings.model,
      });
    case 'custom-http':
      return new CustomHttpProvider({
        endpointUrl: settings.endpointUrl,
        model: settings.model,
        apiKey: settings.apiKey,
        authHeaderName: settings.authHeaderName,
        authScheme: settings.authScheme,
        responseFormat: settings.responseFormat,
      });
    case 'mock':
    default:
      return new MockLLMProvider();
  }
}