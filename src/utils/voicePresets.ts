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
    label: '\ud83c\udd93 \u4e2d\u56fd\u514d\u8d39',
    engine: 'commercial',
    commercialKind: 'minimax',
    config: { apiKey: '' },
    hint: 'MiniMax ASR \u00b7 1000\u5206\u949f/\u6708\u514d\u8d39 \u00b7 \u56fd\u5185\u63a8\u8350',
  },
  {
    label: '\ud83d\udd27 \u4e2d\u56fd\u4e13\u4e1a',
    engine: 'commercial',
    commercialKind: 'volcengine',
    config: { appId: '', accessToken: '' },
    hint: '\u706b\u5c71\u5f15\u64ce ASR \u00b7 \u5b57\u8282\u8df3\u52a8 \u00b7 \u4e2d\u6587\u4f18\u5148',
  },
  {
    label: '\ud83c\udd93 \u6d77\u5916\u514d\u8d39',
    engine: 'commercial',
    commercialKind: 'groq',
    config: { apiKey: '', model: 'whisper-large-v3' },
    hint: 'Groq Whisper \u00b7 14400\u79d2/\u6708\u514d\u8d39 \u00b7 \u56fd\u9645\u63a8\u8350',
  },
  {
    label: '\u2728 \u6d77\u5916\u4e13\u4e1a',
    engine: 'commercial',
    commercialKind: 'gemini',
    config: { apiKey: '' },
    hint: 'Gemini 2.0 Flash \u00b7 $0.003/min \u00b7 \u591a\u6a21\u6001\u5206\u6790',
  },
  {
    label: '\ud83d\udcbb \u5b8c\u5168\u79bb\u7ebf',
    engine: 'whisper-local',
    config: { baseUrl: 'http://localhost:3040', model: 'ggml-base.bin' },
    hint: 'Whisper.cpp \u672c\u5730\u670d\u52a1 \u00b7 \u65e0\u9700\u7f51\u7edc \u00b7 \u9700\u542f\u52a8 whisper-server',
  },
];

export const DEFAULT_CN_PRESET = 0; // MiniMax
export const DEFAULT_GLOBAL_PRESET = 2; // Groq
