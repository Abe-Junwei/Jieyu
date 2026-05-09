/**
 * settingsConstants — Settings modal constants and type definitions
 * Extracted from SettingsModal.tsx
 */

import type { EmbeddingProviderKind } from '../../ai/embeddings/EmbeddingProvider';
import type { CommercialProviderKind } from '../../hooks/useVoiceDock';
import type { Locale } from '../../i18n';
import type { UiFontScaleMode } from '../../utils/panelAdaptiveLayout';
import type { IconEffect } from '../../utils/iconEffect';

export type ThemeMode = 'light' | 'dark' | 'system';

export const SHORTCUT_CATEGORY_ORDER = [
  'playback',
  'editing',
  'navigation',
  'view',
  'voice',
] as const;

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_PLAYBACK_RATE_KEY = 'jieyu:default-playback-rate';
export const WORKSPACE_AUTO_SCROLL_KEY = 'jieyu:workspace-auto-scroll-enabled';
export const WORKSPACE_SNAP_KEY = 'jieyu:workspace-snap-enabled';
export const WORKSPACE_DEFAULT_ZOOM_MODE_KEY = 'jieyu:workspace-default-zoom-mode';
export const ACCESSIBILITY_REDUCED_MOTION_KEY = 'jieyu:accessibility-reduced-motion';
export const ACCESSIBILITY_HIGH_CONTRAST_KEY = 'jieyu:accessibility-high-contrast';
export const AI_CONTEXT_DEBUG_KEY = 'jieyu.aiChat.debugContext';
export const VOICE_DOCK_POSITION_STORAGE_KEY = 'jieyu.voiceDock.pos';
export const MAP_PROVIDER_STORAGE_KEY = 'jieyu:map-provider';

export type WorkspaceZoomMode = 'fit-all' | 'fit-selection' | 'custom';
export type WaveformDisplayPreference = 'waveform' | 'spectrogram' | 'split';
export type VideoLayoutPreference = 'top' | 'left' | 'right';
export type MapProviderKind = 'osm' | 'tianditu' | 'maptiler';

export type MapProviderPreference = {
  kind: MapProviderKind;
  styleId: string;
};

export const MAP_PROVIDER_OPTIONS: Array<{ value: MapProviderKind; label: string }> = [
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'tianditu', label: 'Tianditu' },
  { value: 'maptiler', label: 'MapTiler' },
];

export const EMBEDDING_PROVIDER_OPTIONS: Array<{ value: EmbeddingProviderKind; label: string }> = [
  { value: 'local', label: 'Local' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'minimax', label: 'MiniMax' },
];

export const VOICE_COMMERCIAL_PROVIDER_OPTIONS: Array<{
  value: CommercialProviderKind;
  label: string;
}> = [
  { value: 'groq', label: 'Groq' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai-audio', label: 'OpenAI Audio' },
  { value: 'custom-http', label: 'Custom HTTP' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'volcengine', label: 'Volcengine' },
];

export const VOICE_ENHANCEMENT_OPTIONS: Array<{
  value: 'none' | 'whisperx-align' | 'mfa-align' | 'pyannote-diarize';
  label: string;
}> = [
  { value: 'none', label: 'None' },
  { value: 'whisperx-align', label: 'WhisperX Align' },
  { value: 'mfa-align', label: 'MFA Align' },
  { value: 'pyannote-diarize', label: 'Pyannote Diarize' },
];

// 已知缓存键 | Known cache storage keys
export const CACHE_ENTRIES = [
  {
    id: 'font-coverage',
    key: 'jieyu:font-coverage-cache:v2',
    msgKey: 'dataCacheFontCoverage' as const,
  },
  { id: 'vad', key: 'jieyu:vad-cache', msgKey: 'dataCacheVad' as const },
  {
    id: 'language-catalog',
    key: 'jieyu.language-catalog.runtime-cache.v1',
    msgKey: 'dataCacheLanguageCatalog' as const,
  },
  {
    id: 'embedding-provider',
    key: 'jieyu.embeddingProvider',
    msgKey: 'dataCacheEmbeddingProvider' as const,
  },
] as const;

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  /** 当前主题模式 | Current theme mode */
  themeMode: ThemeMode;
  /** 主题切换回调 | Theme change handler */
  onThemeChange: (mode: ThemeMode) => void;
  /** 语言切换回调 | Locale change handler */
  onLocaleChange: (locale: Locale) => void | Promise<void>;
  /** 当前字体缩放值 | Current UI font scale */
  fontScale: number;
  /** 字体缩放模式 | UI font scale mode */
  fontScaleMode: UiFontScaleMode;
  /** 字体缩放回调 | Font scale change handler */
  onFontScaleChange: (scale: number) => void;
  /** 字体缩放模式切换回调 | Font scale mode change handler */
  onFontScaleModeChange: (mode: UiFontScaleMode) => void;
  /** 图标效果 material / motion | Icon effect preference */
  iconEffect: IconEffect;
  onIconEffectChange: (effect: IconEffect) => void;
  /** 应用版本 | App version string */
  version?: string;
}
