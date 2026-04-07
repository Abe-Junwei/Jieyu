import type {
  CommercialProviderKind,
  SttBillingKind,
  SttProviderCapability,
} from '../VoiceInputService';

export interface CommercialProviderMetadata {
  kind: CommercialProviderKind;
  label: string;
  description: string;
  capability: SttProviderCapability;
  billing: SttBillingKind;
}

export const commercialProviderDefinitions: CommercialProviderMetadata[] = [
  {
    kind: 'gemini',
    label: 'Gemini 2.0 Flash',
    description: 'Google 多模态模型，支持音频输入。需 API Key（$0.003/分钟音频）。',
    capability: 'cloud-api',
    billing: 'metered',
  },
  {
    kind: 'openai-audio',
    label: 'OpenAI Audio (Whisper)',
    description: 'OpenAI Whisper API。需 API Key，按用量计费。',
    capability: 'cloud-api',
    billing: 'metered',
  },
  {
    kind: 'groq',
    label: 'Groq Whisper (免费 tier)',
    description: 'Groq Cloud 免费 Whisper，14,400秒/月。需 Groq API Key（gsk_开头）。',
    capability: 'cloud-api',
    billing: 'free',
  },
  {
    kind: 'custom-http',
    label: '自定义 HTTP（OpenAI兼容）',
    description: '接入任意 OpenAI-compatible 音频转写接口（OneAPI、vLLM 等）。',
    capability: 'cloud-api',
    billing: 'self-hosted',
  },
  {
    kind: 'minimax',
    label: 'MiniMax ASR (免费 1000分钟/月)',
    description: 'MiniMax AI 语音转写，OpenAI兼容接口，免费额度充足。需 API Key。',
    capability: 'cloud-api',
    billing: 'free',
  },
  {
    kind: 'volcengine',
    label: '火山引擎 ASR (字节跳动)',
    description: '字节跳动火山引擎语音识别。需 App ID + Access Token（免费注册）。',
    capability: 'cloud-api',
    billing: 'metered',
  },
];