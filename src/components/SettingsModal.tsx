/**
 * 设置面板 | Settings Modal
 *
 * 统一设置入口：外观、快捷键、AI、播放、数据管理、关于。
 * Unified settings: Appearance, Shortcuts, AI, Playback, Data, About.
 */
import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { ModalPanel } from './ui';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyComboForDisplay,
  loadUserOverrides,
  saveUserOverride,
  removeUserOverride,
  resetUserOverrides,
  type KeyCombo,
} from '../services/KeybindingService';
import {
  aiChatProviderDefinitions,
  normalizeAiChatSettings,
  type AiChatSettings,
  type AiChatProviderKind,
} from '../ai/providers/providerCatalog';
import {
  loadAiChatSettingsFromStorage,
  persistAiChatSettings,
} from '../ai/config/aiChatSettingsStorage';
import { getSettingsModalMessages } from '../i18n/settingsModalMessages';
import { getShortcutsPanelMessages } from '../i18n/shortcutsPanelMessages';
import type { Locale } from '../i18n';
import {
  ACOUSTIC_OVERLAY_MODE_STORAGE_KEY,
  WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY,
  WAVEFORM_DISPLAY_MODE_STORAGE_KEY,
  WAVEFORM_HEIGHT_STORAGE_KEY,
  WAVEFORM_VISUAL_STYLE_STORAGE_KEY,
  emitWaveformRuntimePreferenceChanged,
  readStoredAcousticOverlayModePreference,
  readStoredWaveformAmplitudeScalePreference,
  readStoredWaveformDisplayModePreference,
  readStoredWaveformHeightPreference,
  readStoredWaveformVisualStylePreference,
} from '../utils/waveformRuntimePreferenceSync';
import {
  NEW_SEGMENT_SELECTION_BEHAVIOR_KEY,
  WAVEFORM_DOUBLE_CLICK_ACTION_KEY,
  readStoredNewSegmentSelectionBehavior,
  readStoredWaveformDoubleClickAction,
  type NewSegmentSelectionBehavior,
  type WaveformDoubleClickAction,
} from '../utils/transcriptionInteractionPreferences';
import { ACOUSTIC_OVERLAY_MODES, type AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import { WAVEFORM_VISUAL_STYLE_OPTIONS, type WaveformVisualStyle } from '../utils/waveformVisualStyle';
import type { UiFontScaleMode } from '../utils/panelAdaptiveLayout';
import {
  WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY,
  WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY,
  WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY,
  emitWorkspaceLayoutPreferenceChanged,
  readStoredVideoLayoutModePreference,
  readStoredVideoPreviewHeightPreference,
  readStoredVideoRightPanelWidthPreference,
} from '../utils/workspaceLayoutPreferenceSync';
import {
  persistAcousticProviderRuntimeConfig,
  resolveAcousticProviderRuntimeConfig,
  type AcousticProviderRoutingStrategy,
  type AcousticProviderRuntimeConfig,
} from '../services/acoustic/acousticProviderContract';
import {
  loadEmbeddingProviderConfig,
  saveEmbeddingProviderConfig,
  type EmbeddingProviderConfig,
} from '../pages/TranscriptionPage.helpers';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';

type ThemeMode = 'light' | 'dark' | 'system';

const SHORTCUT_CATEGORY_ORDER = ['playback', 'editing', 'navigation', 'view', 'voice'] as const;

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_PLAYBACK_RATE_KEY = 'jieyu:default-playback-rate';
const WORKSPACE_AUTO_SCROLL_KEY = 'jieyu:workspace-auto-scroll-enabled';
const WORKSPACE_SNAP_KEY = 'jieyu:workspace-snap-enabled';
const WORKSPACE_DEFAULT_ZOOM_MODE_KEY = 'jieyu:workspace-default-zoom-mode';
const ACCESSIBILITY_REDUCED_MOTION_KEY = 'jieyu:accessibility-reduced-motion';
const ACCESSIBILITY_HIGH_CONTRAST_KEY = 'jieyu:accessibility-high-contrast';
const AI_CONTEXT_DEBUG_KEY = 'jieyu.aiChat.debugContext';
const VOICE_DOCK_POSITION_STORAGE_KEY = 'jieyu.voiceDock.pos';
const MAP_PROVIDER_STORAGE_KEY = 'jieyu:map-provider';

type WorkspaceZoomMode = 'fit-all' | 'fit-selection' | 'custom';
type WaveformDisplayPreference = 'waveform' | 'spectrogram' | 'split';
type VideoLayoutPreference = 'top' | 'left' | 'right';
type MapProviderKind = 'osm' | 'tianditu' | 'maptiler';

type MapProviderPreference = {
  kind: MapProviderKind;
  styleId: string;
};

const MAP_PROVIDER_OPTIONS: Array<{ value: MapProviderKind; label: string }> = [
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'tianditu', label: 'Tianditu' },
  { value: 'maptiler', label: 'MapTiler' },
];

const EMBEDDING_PROVIDER_OPTIONS: Array<{ value: EmbeddingProviderKind; label: string }> = [
  { value: 'local', label: 'Local' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'minimax', label: 'MiniMax' },
];

// 已知缓存键 | Known cache storage keys
const CACHE_ENTRIES = [
  { id: 'font-coverage', key: 'jieyu:font-coverage-cache:v2', msgKey: 'dataCacheFontCoverage' as const },
  { id: 'vad', key: 'jieyu:vad-cache', msgKey: 'dataCacheVad' as const },
  { id: 'language-catalog', key: 'jieyu.language-catalog.runtime-cache.v1', msgKey: 'dataCacheLanguageCatalog' as const },
  { id: 'embedding-provider', key: 'jieyu.embeddingProvider', msgKey: 'dataCacheEmbeddingProvider' as const },
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
  onLocaleChange: (locale: Locale) => void;
  /** 当前字体缩放值 | Current UI font scale */
  fontScale: number;
  /** 字体缩放模式 | UI font scale mode */
  fontScaleMode: UiFontScaleMode;
  /** 字体缩放回调 | Font scale change handler */
  onFontScaleChange: (scale: number) => void;
  /** 字体缩放模式切换回调 | Font scale mode change handler */
  onFontScaleModeChange: (mode: UiFontScaleMode) => void;
  /** 应用版本 | App version string */
  version?: string;
}

type SettingsTab = 'appearance' | 'shortcuts' | 'ai' | 'playback' | 'data' | 'about';

// ── 辅助函数 | Helpers ──────────────────────────────────────

function normalizeEventKey(key: string): string {
  const k = key.toLowerCase();
  if (k === ' ' || k === 'spacebar') return 'space';
  if (k === 'esc') return 'escape';
  return k;
}

function keyEventToCombo(e: KeyboardEvent): string | null {
  const key = normalizeEventKey(e.key);
  // 忽略单独修饰键 | Ignore standalone modifier keys
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(key);
  return parts.join('+');
}

function readDefaultPlaybackRate(): number {
  try {
    const stored = localStorage.getItem(DEFAULT_PLAYBACK_RATE_KEY);
    if (!stored) return 1;
    const n = Number(stored);
    if (Number.isNaN(n)) return 1;
    return (PLAYBACK_RATES as readonly number[]).includes(n) ? n : 1;
  } catch { return 1; }
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    if (stored === '1' || stored === 'true') return true;
    if (stored === '0' || stored === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function readStoredWorkspaceZoomMode(): WorkspaceZoomMode {
  try {
    const stored = localStorage.getItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY);
    if (stored === 'fit-all' || stored === 'fit-selection' || stored === 'custom') {
      return stored;
    }
    return 'fit-all';
  } catch {
    return 'fit-all';
  }
}

function readStoredWaveformDisplayMode(): WaveformDisplayPreference {
  try {
    return readStoredWaveformDisplayModePreference();
  } catch {
    return 'waveform';
  }
}

function getMapStyleOptions(kind: MapProviderKind): Array<{ value: string; label: string }> {
  if (kind === 'tianditu') {
    return [
      { value: 'vec', label: 'Vector' },
      { value: 'img', label: 'Satellite' },
      { value: 'ter', label: 'Terrain' },
    ];
  }
  if (kind === 'maptiler') {
    return [
      { value: 'streets-v2', label: 'Streets' },
      { value: 'satellite', label: 'Satellite' },
      { value: 'outdoor-v2', label: 'Outdoor' },
      { value: 'topo-v2', label: 'Topo' },
      { value: 'basic-v2', label: 'Basic' },
    ];
  }
  return [{ value: 'standard', label: 'Standard' }];
}

function getDefaultMapStyleId(kind: MapProviderKind): string {
  return getMapStyleOptions(kind)[0]?.value ?? 'standard';
}

function readStoredMapProviderPreference(): MapProviderPreference {
  try {
    const raw = localStorage.getItem(MAP_PROVIDER_STORAGE_KEY);
    if (!raw) {
      return { kind: 'osm', styleId: 'standard' };
    }
    const parsed = JSON.parse(raw) as Partial<MapProviderPreference>;
    const kind = parsed.kind === 'tianditu' || parsed.kind === 'maptiler' ? parsed.kind : 'osm';
    const styleOptions = getMapStyleOptions(kind);
    const styleId = typeof parsed.styleId === 'string' && styleOptions.some((opt) => opt.value === parsed.styleId)
      ? parsed.styleId
      : getDefaultMapStyleId(kind);
    return { kind, styleId };
  } catch {
    return { kind: 'osm', styleId: 'standard' };
  }
}

function persistMapProviderPreference(preference: MapProviderPreference): void {
  try {
    localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // ignore
  }
}

function normalizeEmbeddingProviderConfig(
  config: EmbeddingProviderConfig,
): EmbeddingProviderConfig {
  const baseUrl = config.baseUrl?.trim();
  const apiKey = config.apiKey?.trim();
  const model = config.model?.trim();
  return {
    kind: config.kind,
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
  };
}

function estimateLocalStorageUsage(): string {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    // UTF-16 每字符 2 字节 | UTF-16: 2 bytes per char
    const kb = (total * 2) / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
  } catch { return '—'; }
}

// ── 子组件 | Sub-components ─────────────────────────────────

function SettingsTabBar({
  activeTab,
  onTabChange,
  tabs,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  tabs: { id: SettingsTab; label: string }[];
}) {
  return (
    <div className="settings-tab-bar" role="tablist" aria-orientation="vertical">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="settings-tab-btn"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function OptionGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-option-group" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="settings-option-btn"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-label={title}>
      <div className="settings-section-rail" aria-hidden="true">
        <span className="settings-section-title panel-title-eyebrow">
          <span className="settings-section-title-text">{title}</span>
        </span>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
  );
}

// ── 主组件 | Main component ─────────────────────────────────

export function SettingsModal({
  isOpen,
  onClose,
  locale,
  themeMode,
  onThemeChange,
  onLocaleChange,
  fontScale,
  fontScaleMode,
  onFontScaleChange,
  onFontScaleModeChange,
  version,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const msg = getSettingsModalMessages(locale);
  const shortcutsMsg = getShortcutsPanelMessages(locale);

  // ── 快捷键编辑 | Shortcut editing ──

  const [editingKeybindingId, setEditingKeybindingId] = useState<string | null>(null);
  const [userOverrides, setUserOverrides] = useState<Map<string, KeyCombo>>(() => loadUserOverrides());
  const editingIdRef = useRef(editingKeybindingId);
  editingIdRef.current = editingKeybindingId;

  // 快捷键监听：捕获下一个按键作为新快捷键 | Key capture: intercept next keydown as new combo
  useEffect(() => {
    if (!editingKeybindingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setEditingKeybindingId(null); return; }
      const combo = keyEventToCombo(e);
      if (!combo || !editingIdRef.current) return;
      saveUserOverride(editingIdRef.current, combo);
      setUserOverrides(loadUserOverrides());
      setEditingKeybindingId(null);
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [editingKeybindingId]);

  const handleResetKeybinding = (id: string) => {
    removeUserOverride(id);
    setUserOverrides(loadUserOverrides());
  };

  const handleResetAllKeybindings = () => {
    resetUserOverrides();
    setUserOverrides(new Map());
  };

  // ── AI 设置 | AI settings ──

  const [aiSettings, setAiSettings] = useState<AiChatSettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaveFlash, setAiSaveFlash] = useState(false);

  // 仅在 AI 标签激活且尚未加载时加载 | Load only when AI tab activates and not yet loaded
  useEffect(() => {
    if (activeTab !== 'ai' || aiSettings !== null) return;
    setAiLoading(true);
    void loadAiChatSettingsFromStorage().then((s) => {
      setAiSettings(s);
      setAiLoading(false);
    });
  }, [activeTab, aiSettings]);

  const handleAiSettingsChange = (patch: Partial<AiChatSettings>) => {
    setAiSettings((prev) => {
      if (!prev) return prev;
      const next = normalizeAiChatSettings({ ...prev, ...patch });
      void persistAiChatSettings(next);
      setAiSaveFlash(true);
      setTimeout(() => setAiSaveFlash(false), 1500);
      return next;
    });
  };

  const activeAiProviderDef = useMemo(() => {
    const kind = aiSettings?.providerKind ?? 'mock';
    return aiChatProviderDefinitions.find((p) => p.kind === kind) ?? aiChatProviderDefinitions[0]!;
  }, [aiSettings?.providerKind]);

  const aiProviderGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama', 'minimax'];
    const compatKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((p) => [p.kind, p]));
    const pick = (kinds: AiChatProviderKind[]) =>
      kinds.map((k) => byKind.get(k)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const labels = { official: 'Official', compat: 'Compatible', local: 'Local / Custom' };
    return [
      { label: labels.official, items: pick(directKinds) },
      { label: labels.compat, items: pick(compatKinds) },
      { label: labels.local, items: pick(localKinds) },
    ].filter((g) => g.items.length > 0);
  }, [locale]);

  const [embeddingProviderDefault, setEmbeddingProviderDefault] = useState<EmbeddingProviderConfig>(() => loadEmbeddingProviderConfig());
  const [acousticRuntimeDraft, setAcousticRuntimeDraft] = useState<AcousticProviderRuntimeConfig>(() => resolveAcousticProviderRuntimeConfig());
  const [acousticRuntimeSaved, setAcousticRuntimeSaved] = useState(false);
  const [acousticRuntimeError, setAcousticRuntimeError] = useState<string | null>(null);
  const [aiContextDebugEnabled, setAiContextDebugEnabled] = useState<boolean>(() => readStoredBoolean(AI_CONTEXT_DEBUG_KEY, false));

  const persistEmbeddingProviderDefault = (config: EmbeddingProviderConfig) => {
    const normalized = normalizeEmbeddingProviderConfig(config);
    setEmbeddingProviderDefault(normalized);
    saveEmbeddingProviderConfig(normalized);
  };

  const handleEmbeddingProviderKindChange = (kind: EmbeddingProviderKind) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, kind });
  };

  const handleEmbeddingProviderBaseUrlChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, baseUrl: value });
  };

  const handleEmbeddingProviderApiKeyChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, apiKey: value });
  };

  const handleEmbeddingProviderModelChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, model: value });
  };

  const handleAcousticRuntimeRoutingChange = (mode: AcousticProviderRoutingStrategy) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      routingStrategy: mode,
    }));
  };

  const handleAcousticRuntimeExternalEnabledChange = (enabled: boolean) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        enabled,
      },
    }));
  };

  const handleAcousticRuntimeEndpointChange = (value: string) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        endpoint: value,
      },
    }));
  };

  const handleAcousticRuntimeTimeoutChange = (value: number) => {
    const timeoutMs = Number.isFinite(value)
      ? Math.min(120000, Math.max(500, Math.round(value)))
      : 10000;
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        timeoutMs,
      },
    }));
  };

  const handleAcousticRuntimeSave = useCallback(() => {
    try {
      const persisted = persistAcousticProviderRuntimeConfig(acousticRuntimeDraft);
      setAcousticRuntimeDraft(persisted);
      setAcousticRuntimeSaved(true);
      setAcousticRuntimeError(null);
    } catch (error) {
      setAcousticRuntimeSaved(false);
      setAcousticRuntimeError(error instanceof Error ? error.message : String(error));
    }
  }, [acousticRuntimeDraft]);

  const handleAiContextDebugChange = (enabled: boolean) => {
    setAiContextDebugEnabled(enabled);
    try {
      localStorage.setItem(AI_CONTEXT_DEBUG_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  };

  // ── 播放偏好 | Playback preferences ──

  const [defaultPlaybackRate, setDefaultPlaybackRate] = useState(readDefaultPlaybackRate);
  const [workspaceAutoScrollDefault, setWorkspaceAutoScrollDefault] = useState<boolean>(() => readStoredBoolean(WORKSPACE_AUTO_SCROLL_KEY, true));
  const [workspaceSnapDefault, setWorkspaceSnapDefault] = useState<boolean>(() => readStoredBoolean(WORKSPACE_SNAP_KEY, false));
  const [workspaceZoomModeDefault, setWorkspaceZoomModeDefault] = useState<WorkspaceZoomMode>(readStoredWorkspaceZoomMode);
  const [waveformDoubleClickActionDefault, setWaveformDoubleClickActionDefault] = useState<WaveformDoubleClickAction>(readStoredWaveformDoubleClickAction);
  const [newSegmentSelectionBehaviorDefault, setNewSegmentSelectionBehaviorDefault] = useState<NewSegmentSelectionBehavior>(readStoredNewSegmentSelectionBehavior);
  const [waveformDisplayDefault, setWaveformDisplayDefault] = useState<WaveformDisplayPreference>(readStoredWaveformDisplayMode);
  const [waveformDefaultHeight, setWaveformDefaultHeight] = useState<number>(readStoredWaveformHeightPreference);
  const [waveformAmplitudeDefault, setWaveformAmplitudeDefault] = useState<number>(readStoredWaveformAmplitudeScalePreference);
  const [waveformVisualStyleDefault, setWaveformVisualStyleDefault] = useState<WaveformVisualStyle>(readStoredWaveformVisualStylePreference);
  const [waveformOverlayDefault, setWaveformOverlayDefault] = useState<AcousticOverlayMode>(readStoredAcousticOverlayModePreference);
  const [videoLayoutDefault, setVideoLayoutDefault] = useState<VideoLayoutPreference>(readStoredVideoLayoutModePreference);
  const [videoPreviewHeightDefault, setVideoPreviewHeightDefault] = useState<number>(readStoredVideoPreviewHeightPreference);
  const [videoRightPanelWidthDefault, setVideoRightPanelWidthDefault] = useState<number>(readStoredVideoRightPanelWidthPreference);
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState<boolean>(() => readStoredBoolean(ACCESSIBILITY_REDUCED_MOTION_KEY, false));
  const [highContrastEnabled, setHighContrastEnabled] = useState<boolean>(() => readStoredBoolean(ACCESSIBILITY_HIGH_CONTRAST_KEY, false));

  const [mapProviderDefault, setMapProviderDefault] = useState<MapProviderPreference>(readStoredMapProviderPreference);
  const [voiceDockPositionResetAt, setVoiceDockPositionResetAt] = useState<number | null>(null);

  const handlePlaybackRateChange = (rate: number) => {
    setDefaultPlaybackRate(rate);
    try { localStorage.setItem(DEFAULT_PLAYBACK_RATE_KEY, String(rate)); } catch { /* ignore */ }
  };

  const handleWorkspaceAutoScrollChange = useCallback((enabled: boolean) => {
    setWorkspaceAutoScrollDefault(enabled);
    try { localStorage.setItem(WORKSPACE_AUTO_SCROLL_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const handleWorkspaceSnapChange = useCallback((enabled: boolean) => {
    setWorkspaceSnapDefault(enabled);
    try { localStorage.setItem(WORKSPACE_SNAP_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const handleWorkspaceZoomModeChange = useCallback((mode: WorkspaceZoomMode) => {
    setWorkspaceZoomModeDefault(mode);
    try { localStorage.setItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);

  const handleVideoLayoutDefaultChange = useCallback((mode: VideoLayoutPreference) => {
    setVideoLayoutDefault(mode);
    try { localStorage.setItem(WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleVideoPreviewHeightDefaultChange = useCallback((nextHeight: number) => {
    const normalized = Math.min(600, Math.max(120, Math.round(nextHeight)));
    setVideoPreviewHeightDefault(normalized);
    try { localStorage.setItem(WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY, String(normalized)); } catch { /* ignore */ }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleVideoRightPanelWidthDefaultChange = useCallback((nextWidth: number) => {
    const normalized = Math.min(720, Math.max(260, Math.round(nextWidth)));
    setVideoRightPanelWidthDefault(normalized);
    try { localStorage.setItem(WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY, String(normalized)); } catch { /* ignore */ }
    emitWorkspaceLayoutPreferenceChanged();
  }, []);

  const handleWaveformDoubleClickActionChange = useCallback((mode: WaveformDoubleClickAction) => {
    setWaveformDoubleClickActionDefault(mode);
    try { localStorage.setItem(WAVEFORM_DOUBLE_CLICK_ACTION_KEY, mode); } catch { /* ignore */ }
  }, []);

  const handleNewSegmentSelectionBehaviorChange = useCallback((mode: NewSegmentSelectionBehavior) => {
    setNewSegmentSelectionBehaviorDefault(mode);
    try { localStorage.setItem(NEW_SEGMENT_SELECTION_BEHAVIOR_KEY, mode); } catch { /* ignore */ }
  }, []);

  const handleWaveformDisplayDefaultChange = useCallback((mode: WaveformDisplayPreference) => {
    setWaveformDisplayDefault(mode);
    try { localStorage.setItem(WAVEFORM_DISPLAY_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformHeightDefaultChange = useCallback((nextHeight: number) => {
    const normalized = Math.min(400, Math.max(80, Math.round(nextHeight)));
    setWaveformDefaultHeight(normalized);
    try { localStorage.setItem(WAVEFORM_HEIGHT_STORAGE_KEY, String(normalized)); } catch { /* ignore */ }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformAmplitudeDefaultChange = useCallback((nextAmplitude: number) => {
    const normalized = Math.min(4, Math.max(0.25, Number(nextAmplitude.toFixed(2))));
    setWaveformAmplitudeDefault(normalized);
    try { localStorage.setItem(WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY, String(normalized)); } catch { /* ignore */ }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformVisualStyleDefaultChange = useCallback((style: WaveformVisualStyle) => {
    setWaveformVisualStyleDefault(style);
    try { localStorage.setItem(WAVEFORM_VISUAL_STYLE_STORAGE_KEY, style); } catch { /* ignore */ }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleWaveformOverlayDefaultChange = useCallback((mode: AcousticOverlayMode) => {
    setWaveformOverlayDefault(mode);
    try { localStorage.setItem(ACOUSTIC_OVERLAY_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    emitWaveformRuntimePreferenceChanged();
  }, []);

  const handleReducedMotionChange = useCallback((enabled: boolean) => {
    setReducedMotionEnabled(enabled);
    try { localStorage.setItem(ACCESSIBILITY_REDUCED_MOTION_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const handleHighContrastChange = useCallback((enabled: boolean) => {
    setHighContrastEnabled(enabled);
    try { localStorage.setItem(ACCESSIBILITY_HIGH_CONTRAST_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('jieyu-reduced-motion', reducedMotionEnabled);
  }, [reducedMotionEnabled]);

  useEffect(() => {
    document.documentElement.classList.toggle('jieyu-high-contrast', highContrastEnabled);
  }, [highContrastEnabled]);

  // ── 数据管理 | Data management ──

  const [clearedCaches, setClearedCaches] = useState<Set<string>>(new Set());

  const handleClearCache = useCallback((entry: typeof CACHE_ENTRIES[number]) => {
    try { localStorage.removeItem(entry.key); } catch { /* ignore */ }
    setClearedCaches((prev) => new Set(prev).add(entry.id));
  }, []);

  const handleResetAllData = useCallback(() => {
    if (!window.confirm(msg.dataResetConfirm)) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('jieyu')) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }, [msg.dataResetConfirm]);

  const handleMapProviderKindChange = useCallback((kind: MapProviderKind) => {
    const next = {
      kind,
      styleId: getDefaultMapStyleId(kind),
    } as MapProviderPreference;
    setMapProviderDefault(next);
    persistMapProviderPreference(next);
  }, []);

  const handleMapProviderStyleChange = useCallback((styleId: string) => {
    const next = {
      ...mapProviderDefault,
      styleId,
    };
    setMapProviderDefault(next);
    persistMapProviderPreference(next);
  }, [mapProviderDefault]);

  const handleResetVoiceDockPosition = useCallback(() => {
    try {
      localStorage.removeItem(VOICE_DOCK_POSITION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setVoiceDockPositionResetAt(Date.now());
  }, []);

  // 关闭时重置瞬态 | Reset transient state on close
  useEffect(() => {
    if (!isOpen) {
      setEditingKeybindingId(null);
      setClearedCaches(new Set());
      setAiSaveFlash(false);
      setAiSettings(null);
      setAcousticRuntimeSaved(false);
      setAcousticRuntimeError(null);
      setAcousticRuntimeDraft(resolveAcousticProviderRuntimeConfig());
      setVoiceDockPositionResetAt(null);
      return;
    }
    setEmbeddingProviderDefault(loadEmbeddingProviderConfig());
    setAcousticRuntimeDraft(resolveAcousticProviderRuntimeConfig());
    setMapProviderDefault(readStoredMapProviderPreference());
    setAiContextDebugEnabled(readStoredBoolean(AI_CONTEXT_DEBUG_KEY, false));
  }, [isOpen]);

  // ── Memos ──

  const tabs = useMemo(() => [
    { id: 'appearance' as const, label: msg.tabAppearance },
    { id: 'shortcuts' as const, label: msg.tabShortcuts },
    { id: 'ai' as const, label: msg.tabAi },
    { id: 'playback' as const, label: msg.tabPlayback },
    { id: 'data' as const, label: msg.tabData },
    { id: 'about' as const, label: msg.tabAbout },
  ], [msg]);

  const themeOptions = useMemo(() => [
    { value: 'light' as const, label: msg.themeLight },
    { value: 'dark' as const, label: msg.themeDark },
    { value: 'system' as const, label: msg.themeSystem },
  ], [msg]);

  const localeOptions = useMemo(() => [
    { value: 'zh-CN' as const, label: msg.localeChinese },
    { value: 'en-US' as const, label: msg.localeEnglish },
  ], [msg]);

  const fontScaleModeOptions = useMemo(() => [
    { value: 'auto' as const, label: msg.fontScaleModeAuto },
    { value: 'manual' as const, label: msg.fontScaleModeManual },
  ], [msg]);

  const toggleOptions = useMemo(() => [
    { value: 'off' as const, label: msg.toggleOff },
    { value: 'on' as const, label: msg.toggleOn },
  ], [msg]);

  const workspaceZoomModeOptions = useMemo(() => [
    { value: 'fit-all' as const, label: msg.zoomModeFitAll },
    { value: 'fit-selection' as const, label: msg.zoomModeFitSelection },
    { value: 'custom' as const, label: msg.zoomModeCustom },
  ], [msg]);

  const waveformDoubleClickActionOptions = useMemo(() => [
    { value: 'zoom-selection' as const, label: msg.doubleClickActionZoom },
    { value: 'create-segment' as const, label: msg.doubleClickActionCreateSegment },
  ], [msg]);

  const newSegmentSelectionBehaviorOptions = useMemo(() => [
    { value: 'select-created' as const, label: msg.newSegmentSelectionSelectCreated },
    { value: 'keep-current' as const, label: msg.newSegmentSelectionKeepCurrent },
  ], [msg]);

  const waveformDisplayOptions = useMemo(() => [
    { value: 'waveform' as const, label: msg.waveformDisplayWaveform },
    { value: 'spectrogram' as const, label: msg.waveformDisplaySpectrogram },
    { value: 'split' as const, label: msg.waveformDisplaySplit },
  ], [msg]);

  const waveformVisualStyleOptions = useMemo(
    () => WAVEFORM_VISUAL_STYLE_OPTIONS.map((style) => {
      const labelMap: Record<WaveformVisualStyle, string> = {
        balanced: msg.waveformVisualStyleBalanced,
        dense: msg.waveformVisualStyleDense,
        contrast: msg.waveformVisualStyleContrast,
        praat: msg.waveformVisualStylePraat,
      };
      return {
        value: style,
        label: labelMap[style],
      };
    }),
    [msg],
  );

  const waveformOverlayOptions = useMemo(
    () => ACOUSTIC_OVERLAY_MODES.map((mode) => {
      const labelMap: Record<AcousticOverlayMode, string> = {
        none: msg.waveformOverlayNone,
        f0: msg.waveformOverlayF0,
        intensity: msg.waveformOverlayIntensity,
        both: msg.waveformOverlayBoth,
      };
      return {
        value: mode,
        label: labelMap[mode],
      };
    }),
    [msg],
  );

  const videoLayoutModeOptions = useMemo(() => [
    { value: 'top' as const, label: msg.videoLayoutTop },
    { value: 'left' as const, label: msg.videoLayoutLeft },
    { value: 'right' as const, label: msg.videoLayoutRight },
  ], [msg]);

  const acousticRoutingOptions = useMemo(() => [
    { value: 'local-first' as const, label: msg.aiAcousticRoutingLocalFirst },
    { value: 'prefer-external' as const, label: msg.aiAcousticRoutingPreferExternal },
  ], [msg]);

  const handleFontScaleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFontScaleModeChange('manual');
    onFontScaleChange(Number(e.target.value));
  }, [onFontScaleChange, onFontScaleModeChange]);

  const handleFontScaleReset = useCallback(() => {
    onFontScaleModeChange('auto');
  }, [onFontScaleModeChange]);

  // 快捷键分组 | Shortcut categories
  const shortcutCategoryLabels: Record<string, string> = {
    playback: shortcutsMsg.categoryPlayback,
    editing: shortcutsMsg.categoryEditing,
    navigation: shortcutsMsg.categoryNavigation,
    view: shortcutsMsg.categoryView,
    voice: shortcutsMsg.categoryVoice,
  };

  const shortcutGroups = SHORTCUT_CATEGORY_ORDER.map((cat) => ({
    cat,
    label: shortcutCategoryLabels[cat] ?? cat,
    entries: DEFAULT_KEYBINDINGS.filter((b) => b.category === cat),
  })).filter((g) => g.entries.length > 0);

  const hasAnyOverride = userOverrides.size > 0;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      topmost
      className="pnl-settings-modal panel-design-match panel-design-match-dialog"
      ariaLabel={msg.title}
      title={msg.title}
      headerClassName="settings-modal-header"
      bodyClassName="settings-modal-body"
      titleClassName="settings-modal-title"
      closeLabel={msg.close}
    >
      <div className="settings-layout">
        <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

        <div className="settings-tab-content" role="tabpanel">
          {/* ── 外观 | Appearance ── */}
          {activeTab === 'appearance' && (
            <div className="settings-sections-stack">
              <SettingsSection title={msg.themeLabel}>
                <OptionGroup value={themeMode} options={themeOptions} onChange={onThemeChange} />
              </SettingsSection>
              <SettingsSection title={msg.localeLabel}>
                <OptionGroup value={locale} options={localeOptions} onChange={onLocaleChange} />
              </SettingsSection>
              <SettingsSection title={msg.fontScaleLabel}>
                <SettingRow label={msg.fontScaleModeLabel}>
                  <OptionGroup
                    value={fontScaleMode}
                    options={fontScaleModeOptions}
                    onChange={onFontScaleModeChange}
                  />
                </SettingRow>
                <div className="settings-font-scale-row">
                  <input
                    type="range"
                    className="settings-font-scale-slider"
                    aria-label={msg.fontScaleLabel}
                    min={0.85}
                    max={1.4}
                    step={0.05}
                    value={fontScale}
                    onChange={handleFontScaleInput}
                    disabled={fontScaleMode === 'auto'}
                  />
                  <span className="settings-font-scale-value">{Math.round(fontScale * 100)}%</span>
                  {fontScaleMode !== 'auto' && (
                    <button
                      type="button"
                      className="settings-font-scale-reset-btn"
                      onClick={handleFontScaleReset}
                    >
                      {msg.fontScaleReset}
                    </button>
                  )}
                </div>
              </SettingsSection>
            </div>
          )}

          {/* ── 快捷键 | Shortcuts ── */}
          {activeTab === 'shortcuts' && (
            <div className="settings-sections-stack">
              {hasAnyOverride && (
                <div className="settings-shortcuts-toolbar">
                  <button type="button" className="settings-link-btn" onClick={handleResetAllKeybindings}>
                    {msg.shortcutResetAll}
                  </button>
                </div>
              )}
              {shortcutGroups.map(({ cat, label, entries }) => (
                <SettingsSection key={cat} title={label}>
                  <table className="shortcuts-panel-table">
                    <tbody>
                      {entries.map((entry) => {
                        const effective = userOverrides.get(entry.id) ?? entry.defaultKey;
                        const isOverridden = userOverrides.has(entry.id);
                        const isEditing = editingKeybindingId === entry.id;
                        return (
                          <tr key={entry.id} className={isEditing ? 'shortcuts-row-editing' : ''}>
                            <td className="shortcuts-panel-key">
                              {isEditing ? (
                                <span className="shortcuts-recording-indicator">
                                  {msg.shortcutRecording}
                                  <span className="shortcuts-esc-hint">{msg.shortcutEscCancel}</span>
                                </span>
                              ) : (
                                <kbd
                                  className={`shortcuts-kbd-editable${isOverridden ? ' shortcuts-kbd-customized' : ''}`}
                                  role="button"
                                  tabIndex={0}
                                  title={msg.shortcutClickToEdit}
                                  onClick={() => setEditingKeybindingId(entry.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingKeybindingId(entry.id); }}
                                >
                                  {formatKeyComboForDisplay(effective)}
                                </kbd>
                              )}
                            </td>
                            <td className="shortcuts-panel-desc">
                              {entry.label}
                              {isOverridden && !isEditing && (
                                <span className="shortcuts-customized-badge">{msg.shortcutCustomized}</span>
                              )}
                            </td>
                            <td className="shortcuts-panel-scope">
                              {isOverridden && !isEditing ? (
                                <button
                                  type="button"
                                  className="settings-link-btn settings-link-btn-sm"
                                  onClick={() => handleResetKeybinding(entry.id)}
                                >
                                  {msg.shortcutReset}
                                </button>
                              ) : (
                                entry.scope === 'waveform' ? shortcutsMsg.scopeWaveform : shortcutsMsg.scopeGlobal
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </SettingsSection>
              ))}
            </div>
          )}

          {/* ── AI ── */}
          {activeTab === 'ai' && (
            <>
              {aiLoading ? (
                <p className="settings-ai-loading">…</p>
              ) : aiSettings ? (
                <div className="settings-sections-stack">
                  <SettingsSection title={msg.aiProviderLabel}>
                    <div className="settings-inline-row">
                      <select
                        className="settings-select"
                        value={aiSettings.providerKind}
                        onChange={(e) => handleAiSettingsChange({ providerKind: e.currentTarget.value as AiChatProviderKind })}
                      >
                        {aiProviderGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((provider) => (
                              <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {aiSaveFlash && <span className="settings-save-flash">{msg.aiSaved}</span>}
                    </div>
                  </SettingsSection>
                  {activeAiProviderDef.fields.length > 0 && (
                    <SettingsSection title={activeAiProviderDef.label}>
                      {activeAiProviderDef.fields.map((field) => (
                        <SettingRow key={field.key} label={field.label}>
                          {field.type === 'select' ? (
                            <select
                              className="settings-select"
                              value={String(aiSettings[field.key] ?? '')}
                              onChange={(e) => handleAiSettingsChange({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                            >
                              {(field.options ?? []).map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="settings-input"
                              type={field.type}
                              value={String(aiSettings[field.key] ?? '')}
                              placeholder={field.placeholder}
                              onChange={(e) => handleAiSettingsChange({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                            />
                          )}
                        </SettingRow>
                      ))}
                    </SettingsSection>
                  )}
                  <SettingsSection title={msg.aiEmbeddingDefaultsTitle}>
                    <SettingRow label={msg.aiEmbeddingProviderLabel}>
                      <OptionGroup
                        value={embeddingProviderDefault.kind}
                        options={EMBEDDING_PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                        onChange={handleEmbeddingProviderKindChange}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiEmbeddingModelLabel}>
                      <input
                        className="settings-input"
                        value={embeddingProviderDefault.model ?? ''}
                        placeholder={msg.aiEmbeddingModelPlaceholder}
                        onChange={(e) => handleEmbeddingProviderModelChange(e.currentTarget.value)}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiEmbeddingBaseUrlLabel}>
                      <input
                        className="settings-input"
                        value={embeddingProviderDefault.baseUrl ?? ''}
                        placeholder={msg.aiEmbeddingBaseUrlPlaceholder}
                        onChange={(e) => handleEmbeddingProviderBaseUrlChange(e.currentTarget.value)}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiEmbeddingApiKeyLabel}>
                      <input
                        className="settings-input"
                        type="password"
                        value={embeddingProviderDefault.apiKey ?? ''}
                        placeholder={msg.aiEmbeddingApiKeyPlaceholder}
                        onChange={(e) => handleEmbeddingProviderApiKeyChange(e.currentTarget.value)}
                      />
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection title={msg.aiAcousticDefaultsTitle}>
                    <SettingRow label={msg.aiAcousticRoutingLabel}>
                      <OptionGroup
                        value={acousticRuntimeDraft.routingStrategy}
                        options={acousticRoutingOptions}
                        onChange={handleAcousticRuntimeRoutingChange}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiAcousticExternalEnabledLabel}>
                      <OptionGroup
                        value={acousticRuntimeDraft.externalProvider.enabled ? 'on' : 'off'}
                        options={toggleOptions}
                        onChange={(value) => handleAcousticRuntimeExternalEnabledChange(value === 'on')}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiAcousticEndpointLabel}>
                      <input
                        className="settings-input"
                        value={acousticRuntimeDraft.externalProvider.endpoint ?? ''}
                        placeholder={msg.aiAcousticEndpointPlaceholder}
                        onChange={(e) => handleAcousticRuntimeEndpointChange(e.currentTarget.value)}
                      />
                    </SettingRow>
                    <SettingRow label={msg.aiAcousticTimeoutLabel}>
                      <div className="settings-inline-row">
                        <input
                          type="number"
                          className="settings-input"
                          min={500}
                          max={120000}
                          step={100}
                          value={acousticRuntimeDraft.externalProvider.timeoutMs}
                          onChange={(e) => handleAcousticRuntimeTimeoutChange(Number(e.currentTarget.value))}
                        />
                        <span className="settings-range-value">ms</span>
                      </div>
                    </SettingRow>
                    <div className="settings-inline-row">
                      <button type="button" className="settings-link-btn" onClick={handleAcousticRuntimeSave}>
                        {msg.aiAcousticSaveButton}
                      </button>
                      {acousticRuntimeSaved ? <span className="settings-save-flash">{msg.aiSaved}</span> : null}
                    </div>
                    {acousticRuntimeError ? <p className="settings-ai-note">{acousticRuntimeError}</p> : null}
                  </SettingsSection>

                  {import.meta.env.DEV ? (
                    <SettingsSection title={msg.aiDebugTitle}>
                      <SettingRow label={msg.aiDebugContextLabel}>
                        <OptionGroup
                          value={aiContextDebugEnabled ? 'on' : 'off'}
                          options={toggleOptions}
                          onChange={(value) => handleAiContextDebugChange(value === 'on')}
                        />
                      </SettingRow>
                    </SettingsSection>
                  ) : null}

                  <p className="settings-ai-note">{msg.aiConfigNote}</p>
                </div>
              ) : null}
            </>
          )}

          {/* ── 播放 | Playback ── */}
          {activeTab === 'playback' && (
            <div className="settings-sections-stack">
              <SettingsSection title={msg.playbackDefaultsTitle}>
                <OptionGroup
                  value={String(defaultPlaybackRate)}
                  options={PLAYBACK_RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
                  onChange={(v) => handlePlaybackRateChange(Number(v))}
                />
              </SettingsSection>

              <SettingsSection title={msg.workflowDefaultsTitle}>
                <SettingRow label={msg.workflowAutoFollowLabel}>
                  <OptionGroup
                    value={workspaceAutoScrollDefault ? 'on' : 'off'}
                    options={toggleOptions}
                    onChange={(value) => handleWorkspaceAutoScrollChange(value === 'on')}
                  />
                </SettingRow>
                <SettingRow label={msg.workflowSnapLabel}>
                  <OptionGroup
                    value={workspaceSnapDefault ? 'on' : 'off'}
                    options={toggleOptions}
                    onChange={(value) => handleWorkspaceSnapChange(value === 'on')}
                  />
                </SettingRow>
                <SettingRow label={msg.workflowZoomModeLabel}>
                  <OptionGroup
                    value={workspaceZoomModeDefault}
                    options={workspaceZoomModeOptions}
                    onChange={handleWorkspaceZoomModeChange}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={msg.videoLayoutDefaultsTitle}>
                <SettingRow label={msg.videoLayoutModeLabel}>
                  <OptionGroup
                    value={videoLayoutDefault}
                    options={videoLayoutModeOptions}
                    onChange={handleVideoLayoutDefaultChange}
                  />
                </SettingRow>
                <SettingRow label={msg.videoPreviewHeightLabel}>
                  <div className="settings-range-control">
                    <input
                      type="range"
                      className="settings-font-scale-slider"
                      aria-label={msg.videoPreviewHeightLabel}
                      min={120}
                      max={600}
                      step={10}
                      value={videoPreviewHeightDefault}
                      onChange={(e) => handleVideoPreviewHeightDefaultChange(Number(e.target.value))}
                    />
                    <span className="settings-range-value">{videoPreviewHeightDefault}px</span>
                  </div>
                </SettingRow>
                <SettingRow label={msg.videoRightPanelWidthLabel}>
                  <div className="settings-range-control">
                    <input
                      type="range"
                      className="settings-font-scale-slider"
                      aria-label={msg.videoRightPanelWidthLabel}
                      min={260}
                      max={720}
                      step={10}
                      value={videoRightPanelWidthDefault}
                      onChange={(e) => handleVideoRightPanelWidthDefaultChange(Number(e.target.value))}
                    />
                    <span className="settings-range-value">{videoRightPanelWidthDefault}px</span>
                  </div>
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={msg.selectionEditDefaultsTitle}>
                <SettingRow label={msg.doubleClickActionLabel}>
                  <OptionGroup
                    value={waveformDoubleClickActionDefault}
                    options={waveformDoubleClickActionOptions}
                    onChange={handleWaveformDoubleClickActionChange}
                  />
                </SettingRow>
                <SettingRow label={msg.newSegmentSelectionLabel}>
                  <OptionGroup
                    value={newSegmentSelectionBehaviorDefault}
                    options={newSegmentSelectionBehaviorOptions}
                    onChange={handleNewSegmentSelectionBehaviorChange}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={msg.waveformDisplayDefaultsTitle}>
                <SettingRow label={msg.waveformDisplayModeLabel}>
                  <OptionGroup
                    value={waveformDisplayDefault}
                    options={waveformDisplayOptions}
                    onChange={handleWaveformDisplayDefaultChange}
                  />
                </SettingRow>
                <SettingRow label={msg.waveformHeightLabel}>
                  <div className="settings-range-control">
                    <input
                      type="range"
                      className="settings-font-scale-slider"
                      aria-label={msg.waveformHeightLabel}
                      min={80}
                      max={400}
                      step={10}
                      value={waveformDefaultHeight}
                      onChange={(e) => handleWaveformHeightDefaultChange(Number(e.target.value))}
                    />
                    <span className="settings-range-value">{waveformDefaultHeight}px</span>
                  </div>
                </SettingRow>
                <SettingRow label={msg.waveformAmplitudeLabel}>
                  <div className="settings-range-control">
                    <input
                      type="range"
                      className="settings-font-scale-slider"
                      aria-label={msg.waveformAmplitudeLabel}
                      min={0.25}
                      max={4}
                      step={0.05}
                      value={waveformAmplitudeDefault}
                      onChange={(e) => handleWaveformAmplitudeDefaultChange(Number(e.target.value))}
                    />
                    <span className="settings-range-value">{waveformAmplitudeDefault.toFixed(2)}x</span>
                  </div>
                </SettingRow>
                <SettingRow label={msg.waveformVisualStyleLabel}>
                  <OptionGroup
                    value={waveformVisualStyleDefault}
                    options={waveformVisualStyleOptions}
                    onChange={handleWaveformVisualStyleDefaultChange}
                  />
                </SettingRow>
                <SettingRow label={msg.waveformOverlayLabel}>
                  <OptionGroup
                    value={waveformOverlayDefault}
                    options={waveformOverlayOptions}
                    onChange={handleWaveformOverlayDefaultChange}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={msg.accessibilityDefaultsTitle}>
                <SettingRow label={msg.accessibilityReducedMotionLabel}>
                  <OptionGroup
                    value={reducedMotionEnabled ? 'on' : 'off'}
                    options={toggleOptions}
                    onChange={(value) => handleReducedMotionChange(value === 'on')}
                  />
                </SettingRow>
                <SettingRow label={msg.accessibilityHighContrastLabel}>
                  <OptionGroup
                    value={highContrastEnabled ? 'on' : 'off'}
                    options={toggleOptions}
                    onChange={(value) => handleHighContrastChange(value === 'on')}
                  />
                </SettingRow>
              </SettingsSection>
            </div>
          )}

          {/* ── 数据 | Data ── */}
          {activeTab === 'data' && (
            <div className="settings-sections-stack">
              <SettingsSection title={msg.dataWorkspaceIntegrationTitle}>
                <SettingRow label={msg.dataMapProviderLabel}>
                  <OptionGroup
                    value={mapProviderDefault.kind}
                    options={MAP_PROVIDER_OPTIONS}
                    onChange={handleMapProviderKindChange}
                  />
                </SettingRow>
                <SettingRow label={msg.dataMapStyleLabel}>
                  <select
                    className="settings-select"
                    value={mapProviderDefault.styleId}
                    onChange={(e) => handleMapProviderStyleChange(e.currentTarget.value)}
                  >
                    {getMapStyleOptions(mapProviderDefault.kind).map((style) => (
                      <option key={style.value} value={style.value}>{style.label}</option>
                    ))}
                  </select>
                </SettingRow>
                <div className="settings-data-row">
                  <span className="settings-data-label">{msg.dataVoiceDockPositionLabel}</span>
                  <button type="button" className="settings-link-btn" onClick={handleResetVoiceDockPosition}>
                    {msg.dataVoiceDockResetBtn}
                  </button>
                </div>
                {voiceDockPositionResetAt ? <div className="settings-data-cleared">{msg.dataCleared}</div> : null}
              </SettingsSection>

              <SettingsSection title={msg.tabData}>
                {CACHE_ENTRIES.map((entry) => (
                  <div key={entry.id} className="settings-data-row">
                    <span className="settings-data-label">{msg[entry.msgKey]}</span>
                    {clearedCaches.has(entry.id) ? (
                      <span className="settings-data-cleared">{msg.dataCleared}</span>
                    ) : (
                      <button
                        type="button"
                        className="settings-link-btn"
                        onClick={() => handleClearCache(entry)}
                      >
                        {msg.dataClearBtn}
                      </button>
                    )}
                  </div>
                ))}
                <div className="settings-data-row settings-data-row-storage">
                  <span className="settings-data-label">{msg.dataStorageEstimate}</span>
                  <span className="settings-data-value">{estimateLocalStorageUsage()}</span>
                </div>
                <div className="settings-data-reset-section">
                  <button
                    type="button"
                    className="settings-danger-btn"
                    onClick={handleResetAllData}
                  >
                    {msg.dataResetAll}
                  </button>
                </div>
              </SettingsSection>
            </div>
          )}

          {/* ── 关于 | About ── */}
          {activeTab === 'about' && (
            <div className="settings-sections-stack">
              <SettingsSection title={msg.tabAbout}>
                <div className="settings-about-section">
                  <span className="settings-about-name">Jieyu</span>
                  <p className="settings-about-desc">{msg.aboutDescription}</p>
                  {version && (
                    <div className="settings-about-row">
                      <strong>{msg.aboutVersion}:</strong>
                      <span>{version}</span>
                    </div>
                  )}
                </div>
              </SettingsSection>
            </div>
          )}
        </div>
      </div>
    </ModalPanel>
  );
}
