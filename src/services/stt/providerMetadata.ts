import type { CommercialProviderKind, SttBillingKind, SttEngine, SttProviderCapability } from '../VoiceInputService';

export type BuiltinSttProviderKind = Extract<SttEngine, 'web-speech' | 'whisper-local'>;
export type SttProviderKind = BuiltinSttProviderKind | CommercialProviderKind;

export interface SttProviderMetadata {
  kind: SttProviderKind;
  engine: SttEngine;
  providerType: 'builtin' | 'commercial';
  label: string;
  description: string;
  capability: SttProviderCapability;
  billing: SttBillingKind;
  requiresConfig: boolean;
}

export interface BuiltinProviderMetadata extends SttProviderMetadata {
  kind: BuiltinSttProviderKind;
  engine: BuiltinSttProviderKind;
  providerType: 'builtin';
}

export interface CommercialProviderMetadata {
  kind: CommercialProviderKind;
  engine: 'commercial';
  providerType: 'commercial';
  label: string;
  description: string;
  capability: SttProviderCapability;
  billing: SttBillingKind;
  requiresConfig: true;
}

export const builtinProviderDefinitions: BuiltinProviderMetadata[] = [
  {
    kind: 'web-speech',
    engine: 'web-speech',
    providerType: 'builtin',
    label: 'Web Speech',
    description: '浏览器原生语音识别，零配置启动，依赖当前浏览器实现。',
    capability: 'browser-native',
    billing: 'free',
    requiresConfig: false,
  },
  {
    kind: 'whisper-local',
    engine: 'whisper-local',
    providerType: 'builtin',
    label: 'Distil-Whisper (本地)',
    description: '本地 whisper.cpp HTTP 服务，适合离线或私有数据场景。',
    capability: 'local-http',
    billing: 'self-hosted',
    requiresConfig: true,
  },
];

export const commercialProviderDefinitions: CommercialProviderMetadata[] = [
  {
    kind: 'gemini',
    engine: 'commercial',
    providerType: 'commercial',
    label: 'Gemini 2.0 Flash',
    description: 'Google 多模态模型，支持音频输入。需 API Key（$0.003/分钟音频）。',
    capability: 'cloud-api',
    billing: 'metered',
    requiresConfig: true,
  },
  {
    kind: 'openai-audio',
    engine: 'commercial',
    providerType: 'commercial',
    label: 'OpenAI Audio (Whisper)',
    description: 'OpenAI Whisper API。需 API Key，按用量计费。',
    capability: 'cloud-api',
    billing: 'metered',
    requiresConfig: true,
  },
  {
    kind: 'groq',
    engine: 'commercial',
    providerType: 'commercial',
    label: 'Groq Whisper (免费 tier)',
    description: 'Groq Cloud 免费 Whisper，14,400秒/月。需 Groq API Key（gsk_开头）。',
    capability: 'cloud-api',
    billing: 'free',
    requiresConfig: true,
  },
  {
    kind: 'custom-http',
    engine: 'commercial',
    providerType: 'commercial',
    label: '自定义 HTTP（OpenAI兼容）',
    description: '接入任意 OpenAI-compatible 音频转写接口（OneAPI、vLLM 等）。',
    capability: 'cloud-api',
    billing: 'self-hosted',
    requiresConfig: true,
  },
  {
    kind: 'minimax',
    engine: 'commercial',
    providerType: 'commercial',
    label: 'MiniMax ASR (免费 1000分钟/月)',
    description: 'MiniMax AI 语音转写，OpenAI兼容接口，免费额度充足。需 API Key。',
    capability: 'cloud-api',
    billing: 'free',
    requiresConfig: true,
  },
  {
    kind: 'volcengine',
    engine: 'commercial',
    providerType: 'commercial',
    label: '火山引擎 ASR (字节跳动)',
    description: '字节跳动火山引擎语音识别。需 App ID + Access Token（免费注册）。',
    capability: 'cloud-api',
    billing: 'metered',
    requiresConfig: true,
  },
];

export const sttProviderDefinitions: SttProviderMetadata[] = [
  ...builtinProviderDefinitions,
  ...commercialProviderDefinitions,
];

export function getSttProviderMetadataByKind(kind: SttProviderKind): SttProviderMetadata {
  return sttProviderDefinitions.find((definition) => definition.kind === kind)
    ?? commercialProviderDefinitions.find((definition) => definition.kind === 'groq')
    ?? builtinProviderDefinitions[0]!;
}

export function getActiveSttProviderMetadata(
  engine: SttEngine,
  commercialKind: CommercialProviderKind = 'groq',
): SttProviderMetadata {
  if (engine === 'commercial') {
    return getSttProviderMetadataByKind(commercialKind);
  }
  return getSttProviderMetadataByKind(engine as BuiltinSttProviderKind);
}