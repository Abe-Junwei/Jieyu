/**
 * Voice STT/LLM preset configurations.
 *
 * Provides one-click configuration for different usage scenarios:
 * - CN Free: MiniMax ASR (free tier, China-optimized)
 * - CN Pro: Volcano Engine (paid, high quality)
 * - Global Free: Groq Whisper (free tier, international)
 * - Global Pro: Gemini Flash (paid, multimodal)
 * - Local: Whisper.cpp local server
 *
 * Each preset sets the STT engine, commercial provider kind,
 * and credential fields in a single action.
 */

import type { SttEngine, CommercialProviderKind } from '../services/VoiceInputService';
import type { CommercialProviderCreateConfig } from '../services/stt';

export interface VoicePreset {
  /** Shown in the UI dropdown */
  label: string;
  /** STT engine to activate */
  engine: SttEngine;
  /** Commercial provider kind (only used when engine === 'commercial') */
  commercialKind?: CommercialProviderKind;
  /** Credential fields to pre-fill */
  config: CommercialProviderCreateConfig;
  /** Hint shown below the preset name */
  hint: string;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    label: '🆓 中国免费',
    engine: 'commercial',
    commercialKind: 'minimax',
    config: { apiKey: '' },
    hint: 'MiniMax ASR · 1000分钟/月免费 · 国内推荐',
  },
  {
    label: '🔧 中国专业',
    engine: 'commercial',
    commercialKind: 'volcengine',
    config: { appId: '', accessToken: '' },
    hint: '火山引擎 ASR · 字节跳动 · 中文优先',
  },
  {
    label: '🆓 海外免费',
    engine: 'commercial',
    commercialKind: 'groq',
    config: { apiKey: '', model: 'whisper-large-v3' },
    hint: 'Groq Whisper · 14400秒/月免费 · 国际推荐',
  },
  {
    label: '✨ 海外专业',
    engine: 'commercial',
    commercialKind: 'gemini',
    config: { apiKey: '' },
    hint: 'Gemini 2.0 Flash · $0.003/min · 多模态分析',
  },
  {
    label: '💻 完全离线',
    engine: 'whisper-local',
    config: { baseUrl: 'http://localhost:3040', model: 'ggml-base.bin' },
    hint: 'Whisper.cpp 本地服务 · 无需网络 · 需启动 whisper-server',
  },
];

export const DEFAULT_CN_PRESET = 0; // MiniMax
export const DEFAULT_GLOBAL_PRESET = 2; // Groq
