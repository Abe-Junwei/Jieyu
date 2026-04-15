import type { Locale } from './index';

export type SettingsModalMessages = {
  title: string;
  close: string;
  tabAppearance: string;
  tabLanguage: string;
  tabShortcuts: string;
  tabAi: string;
  tabPlayback: string;
  tabData: string;
  tabAbout: string;
  // 外观 | Appearance
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  localeLabel: string;
  localeChinese: string;
  localeEnglish: string;
  fontScaleLabel: string;
  fontScaleModeLabel: string;
  fontScaleModeAuto: string;
  fontScaleModeManual: string;
  fontScaleReset: string;
  /** 图标效果：Material 默认 / 动效增强 | Icon effect: Material vs motion-enhanced */
  iconEffectTitle: string;
  iconEffectMaterial: string;
  iconEffectMotion: string;
  iconEffectHint: string;
  // 快捷键 | Shortcuts
  shortcutRecording: string;
  shortcutReset: string;
  shortcutResetAll: string;
  shortcutCustomized: string;
  shortcutClickToEdit: string;
  shortcutEscCancel: string;
  // AI
  aiProviderLabel: string;
  aiSaved: string;
  aiConfigNote: string;
  // 播放 | Playback
  playbackDefaultsTitle: string;
  playbackDefaultRate: string;
  workflowDefaultsTitle: string;
  workflowAutoFollowLabel: string;
  workflowSnapLabel: string;
  workflowZoomModeLabel: string;
  zoomModeFitAll: string;
  zoomModeFitSelection: string;
  zoomModeCustom: string;
  videoLayoutDefaultsTitle: string;
  videoLayoutModeLabel: string;
  videoLayoutTop: string;
  videoLayoutLeft: string;
  videoLayoutRight: string;
  videoPreviewHeightLabel: string;
  videoRightPanelWidthLabel: string;
  selectionEditDefaultsTitle: string;
  doubleClickActionLabel: string;
  doubleClickActionZoom: string;
  doubleClickActionCreateSegment: string;
  newSegmentSelectionLabel: string;
  newSegmentSelectionSelectCreated: string;
  newSegmentSelectionKeepCurrent: string;
  waveformDisplayDefaultsTitle: string;
  waveformDisplayModeLabel: string;
  waveformDisplayWaveform: string;
  waveformDisplaySpectrogram: string;
  waveformDisplaySplit: string;
  waveformHeightLabel: string;
  waveformAmplitudeLabel: string;
  waveformVisualStyleLabel: string;
  waveformVisualStyleBalanced: string;
  waveformVisualStyleDense: string;
  waveformVisualStyleContrast: string;
  waveformVisualStylePraat: string;
  waveformOverlayLabel: string;
  waveformOverlayNone: string;
  waveformOverlayF0: string;
  waveformOverlayIntensity: string;
  waveformOverlayBoth: string;
  accessibilityDefaultsTitle: string;
  accessibilityReducedMotionLabel: string;
  accessibilityHighContrastLabel: string;
  toggleOn: string;
  toggleOff: string;
  // 数据 | Data
  dataClearBtn: string;
  dataCleared: string;
  dataResetAll: string;
  dataResetConfirm: string;
  dataStorageEstimate: string;
  dataCacheFontCoverage: string;
  dataCacheVad: string;
  dataCacheLanguageCatalog: string;
  dataCacheEmbeddingProvider: string;
  dataWorkspaceIntegrationTitle: string;
  dataMapProviderLabel: string;
  dataMapStyleLabel: string;
  dataVoiceDockPositionLabel: string;
  dataVoiceDockResetBtn: string;
  // AI advanced
  aiEmbeddingDefaultsTitle: string;
  aiEmbeddingProviderLabel: string;
  aiEmbeddingModelLabel: string;
  aiEmbeddingModelPlaceholder: string;
  aiEmbeddingBaseUrlLabel: string;
  aiEmbeddingBaseUrlPlaceholder: string;
  aiEmbeddingApiKeyLabel: string;
  aiEmbeddingApiKeyPlaceholder: string;
  aiAcousticDefaultsTitle: string;
  aiAcousticRoutingLabel: string;
  aiAcousticRoutingLocalFirst: string;
  aiAcousticRoutingPreferExternal: string;
  aiAcousticExternalEnabledLabel: string;
  aiAcousticEndpointLabel: string;
  aiAcousticEndpointPlaceholder: string;
  aiAcousticTimeoutLabel: string;
  aiAcousticSaveButton: string;
  aiDebugTitle: string;
  aiDebugContextLabel: string;
  // 关于 | About
  aboutVersion: string;
  aboutDescription: string;
  aboutRepo: string;
};

const zhCN: SettingsModalMessages = {
  title: '设置',
  close: '关闭设置',
  tabAppearance: '外观',
  tabLanguage: '语言',
  tabShortcuts: '快捷键',
  tabAi: 'AI',
  tabPlayback: '播放',
  tabData: '数据',
  tabAbout: '关于',
  themeLabel: '主题',
  themeLight: '浅色',
  themeDark: '深色',
  themeSystem: '跟随系统',
  localeLabel: '界面语言',
  localeChinese: '中文',
  localeEnglish: 'English',
  fontScaleLabel: '字体缩放',
  fontScaleModeLabel: '字号策略',
  fontScaleModeAuto: '自动',
  fontScaleModeManual: '手动',
  fontScaleReset: '重置',
  iconEffectTitle: '图标效果',
  iconEffectMaterial: 'Material（默认）',
  iconEffectMotion: '动效增强',
  iconEffectHint:
    '仍为 Google Material Symbols 字形。动效模式仅在悬停/点击时增加轻微缩放与实心填充（FILL）；与系统或下方「减少动态效果」一致时会自动关闭动效。若需逐图标 Lottie 动画，可后续接入 lottie-web 等库单独挂载 JSON。',
  shortcutRecording: '请按下快捷键…',
  shortcutReset: '恢复默认',
  shortcutResetAll: '全部恢复默认',
  shortcutCustomized: '已自定义',
  shortcutClickToEdit: '点击编辑',
  shortcutEscCancel: 'Esc 取消',
  aiProviderLabel: 'AI 服务商',
  aiSaved: '已保存',
  aiConfigNote: '完整连接测试请在 AI 对话面板中进行',
  playbackDefaultsTitle: '播放默认值',
  playbackDefaultRate: '默认播放速度',
  workflowDefaultsTitle: '工作流默认值',
  workflowAutoFollowLabel: '自动跟随选中语段',
  workflowSnapLabel: '吸附到零交叉',
  workflowZoomModeLabel: '默认缩放模式',
  zoomModeFitAll: '适应全部',
  zoomModeFitSelection: '适应选区',
  zoomModeCustom: '自定义',
  videoLayoutDefaultsTitle: '视频布局默认值',
  videoLayoutModeLabel: '视频布局模式',
  videoLayoutTop: '上方',
  videoLayoutLeft: '左侧',
  videoLayoutRight: '右侧',
  videoPreviewHeightLabel: '视频预览高度',
  videoRightPanelWidthLabel: '右侧面板宽度',
  selectionEditDefaultsTitle: '选择与编辑默认值',
  doubleClickActionLabel: '波形双击行为',
  doubleClickActionZoom: '缩放到选区',
  doubleClickActionCreateSegment: '按双击区间创建语段',
  newSegmentSelectionLabel: '新建后选中行为',
  newSegmentSelectionSelectCreated: '自动选中新建语段',
  newSegmentSelectionKeepCurrent: '保持当前选中',
  waveformDisplayDefaultsTitle: '波形显示默认值',
  waveformDisplayModeLabel: '波形显示模式',
  waveformDisplayWaveform: '波形',
  waveformDisplaySpectrogram: '频谱',
  waveformDisplaySplit: '分屏',
  waveformHeightLabel: '默认波形高度',
  waveformAmplitudeLabel: '默认振幅倍率',
  waveformVisualStyleLabel: '默认视觉样式',
  waveformVisualStyleBalanced: '平衡',
  waveformVisualStyleDense: '紧凑',
  waveformVisualStyleContrast: '高对比',
  waveformVisualStylePraat: 'Praat',
  waveformOverlayLabel: '默认声学叠加',
  waveformOverlayNone: '关闭',
  waveformOverlayF0: '基频',
  waveformOverlayIntensity: '强度',
  waveformOverlayBoth: '基频 + 强度',
  accessibilityDefaultsTitle: '可访问性偏好',
  accessibilityReducedMotionLabel: '减少动态效果',
  accessibilityHighContrastLabel: '增强对比度',
  toggleOn: '开启',
  toggleOff: '关闭',
  dataClearBtn: '清除',
  dataCleared: '已清除',
  dataResetAll: '重置所有设置',
  dataResetConfirm: '确定要清除所有本地设置和缓存吗？此操作不可撤销。',
  dataStorageEstimate: '本地存储用量',
  dataCacheFontCoverage: '字体覆盖缓存',
  dataCacheVad: 'VAD 缓存',
  dataCacheLanguageCatalog: '语言目录缓存',
  dataCacheEmbeddingProvider: '嵌入模型配置',
  dataWorkspaceIntegrationTitle: '工作台与集成',
  dataMapProviderLabel: '地图服务商默认值',
  dataMapStyleLabel: '地图样式默认值',
  dataVoiceDockPositionLabel: '语音浮窗位置',
  dataVoiceDockResetBtn: '重置位置',
  aiEmbeddingDefaultsTitle: 'Embedding 默认值',
  aiEmbeddingProviderLabel: 'Embedding 服务商',
  aiEmbeddingModelLabel: 'Embedding 模型',
  aiEmbeddingModelPlaceholder: '留空使用默认模型',
  aiEmbeddingBaseUrlLabel: 'Embedding Base URL',
  aiEmbeddingBaseUrlPlaceholder: 'https://api.example.com/v1',
  aiEmbeddingApiKeyLabel: 'Embedding API Key',
  aiEmbeddingApiKeyPlaceholder: 'sk-...',
  aiAcousticDefaultsTitle: '声学 Provider 默认值',
  aiAcousticRoutingLabel: '路由策略',
  aiAcousticRoutingLocalFirst: '本地优先',
  aiAcousticRoutingPreferExternal: '外部优先',
  aiAcousticExternalEnabledLabel: '启用外部 Provider',
  aiAcousticEndpointLabel: '外部 Endpoint',
  aiAcousticEndpointPlaceholder: 'https://example.com/health',
  aiAcousticTimeoutLabel: '探测超时',
  aiAcousticSaveButton: '保存声学默认值',
  aiDebugTitle: '调试开关（开发环境）',
  aiDebugContextLabel: '输出 AI 上下文调试信息',
  aboutVersion: '版本',
  aboutDescription: '解语 Jieyu — 濒危语言科研协作平台',
  aboutRepo: '项目仓库',
};

const enUS: SettingsModalMessages = {
  title: 'Settings',
  close: 'Close settings',
  tabAppearance: 'Appearance',
  tabLanguage: 'Language',
  tabShortcuts: 'Shortcuts',
  tabAi: 'AI',
  tabPlayback: 'Playback',
  tabData: 'Data',
  tabAbout: 'About',
  themeLabel: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System',
  localeLabel: 'Language',
  localeChinese: '中文',
  localeEnglish: 'English',
  fontScaleLabel: 'Font scale',
  fontScaleModeLabel: 'Font mode',
  fontScaleModeAuto: 'Auto',
  fontScaleModeManual: 'Manual',
  fontScaleReset: 'Reset',
  iconEffectTitle: 'Icon effect',
  iconEffectMaterial: 'Material (default)',
  iconEffectMotion: 'Motion enhanced',
  iconEffectHint:
    'Still uses Google Material Symbols. Motion mode adds light scale and filled (FILL) states on hover/active; it is disabled when system or “Reduce motion” prefers reduced motion. Per-icon Lottie can be added later via lottie-web and JSON assets.',
  shortcutRecording: 'Press a key…',
  shortcutReset: 'Reset',
  shortcutResetAll: 'Reset all',
  shortcutCustomized: 'Customized',
  shortcutClickToEdit: 'Click to edit',
  shortcutEscCancel: 'Esc to cancel',
  aiProviderLabel: 'AI Provider',
  aiSaved: 'Saved',
  aiConfigNote: 'Full connection test is available in the AI chat panel',
  playbackDefaultsTitle: 'Playback Defaults',
  playbackDefaultRate: 'Default playback rate',
  workflowDefaultsTitle: 'Workflow Defaults',
  workflowAutoFollowLabel: 'Auto-follow selected segment',
  workflowSnapLabel: 'Snap to zero crossing',
  workflowZoomModeLabel: 'Default zoom mode',
  zoomModeFitAll: 'Fit all',
  zoomModeFitSelection: 'Fit selection',
  zoomModeCustom: 'Custom',
  videoLayoutDefaultsTitle: 'Video Layout Defaults',
  videoLayoutModeLabel: 'Video layout mode',
  videoLayoutTop: 'Top',
  videoLayoutLeft: 'Left',
  videoLayoutRight: 'Right',
  videoPreviewHeightLabel: 'Video preview height',
  videoRightPanelWidthLabel: 'Right panel width',
  selectionEditDefaultsTitle: 'Selection & Edit Defaults',
  doubleClickActionLabel: 'Waveform double-click action',
  doubleClickActionZoom: 'Zoom to selection',
  doubleClickActionCreateSegment: 'Create segment from double-click range',
  newSegmentSelectionLabel: 'Selection after creation',
  newSegmentSelectionSelectCreated: 'Auto-select newly created segment',
  newSegmentSelectionKeepCurrent: 'Keep current selection',
  waveformDisplayDefaultsTitle: 'Waveform Display Defaults',
  waveformDisplayModeLabel: 'Waveform display mode',
  waveformDisplayWaveform: 'Waveform',
  waveformDisplaySpectrogram: 'Spectrogram',
  waveformDisplaySplit: 'Split',
  waveformHeightLabel: 'Default waveform height',
  waveformAmplitudeLabel: 'Default amplitude scale',
  waveformVisualStyleLabel: 'Default visual style',
  waveformVisualStyleBalanced: 'Balanced',
  waveformVisualStyleDense: 'Dense',
  waveformVisualStyleContrast: 'Contrast',
  waveformVisualStylePraat: 'Praat',
  waveformOverlayLabel: 'Default acoustic overlay',
  waveformOverlayNone: 'None',
  waveformOverlayF0: 'F0',
  waveformOverlayIntensity: 'Intensity',
  waveformOverlayBoth: 'F0 + Intensity',
  accessibilityDefaultsTitle: 'Accessibility Preferences',
  accessibilityReducedMotionLabel: 'Reduce motion',
  accessibilityHighContrastLabel: 'Increase contrast',
  toggleOn: 'On',
  toggleOff: 'Off',
  dataClearBtn: 'Clear',
  dataCleared: 'Cleared',
  dataResetAll: 'Reset all settings',
  dataResetConfirm: 'Are you sure you want to clear all local settings and caches? This cannot be undone.',
  dataStorageEstimate: 'Local storage usage',
  dataCacheFontCoverage: 'Font coverage cache',
  dataCacheVad: 'VAD cache',
  dataCacheLanguageCatalog: 'Language catalog cache',
  dataCacheEmbeddingProvider: 'Embedding provider config',
  dataWorkspaceIntegrationTitle: 'Workspace Integrations',
  dataMapProviderLabel: 'Default map provider',
  dataMapStyleLabel: 'Default map style',
  dataVoiceDockPositionLabel: 'Voice dock position',
  dataVoiceDockResetBtn: 'Reset position',
  aiEmbeddingDefaultsTitle: 'Embedding Defaults',
  aiEmbeddingProviderLabel: 'Embedding provider',
  aiEmbeddingModelLabel: 'Embedding model',
  aiEmbeddingModelPlaceholder: 'Leave blank to use provider default',
  aiEmbeddingBaseUrlLabel: 'Embedding base URL',
  aiEmbeddingBaseUrlPlaceholder: 'https://api.example.com/v1',
  aiEmbeddingApiKeyLabel: 'Embedding API key',
  aiEmbeddingApiKeyPlaceholder: 'sk-...',
  aiAcousticDefaultsTitle: 'Acoustic Provider Defaults',
  aiAcousticRoutingLabel: 'Routing strategy',
  aiAcousticRoutingLocalFirst: 'Local first',
  aiAcousticRoutingPreferExternal: 'Prefer external',
  aiAcousticExternalEnabledLabel: 'Enable external provider',
  aiAcousticEndpointLabel: 'External endpoint',
  aiAcousticEndpointPlaceholder: 'https://example.com/health',
  aiAcousticTimeoutLabel: 'Probe timeout',
  aiAcousticSaveButton: 'Save acoustic defaults',
  aiDebugTitle: 'Debug (Dev only)',
  aiDebugContextLabel: 'Enable AI context debug output',
  aboutVersion: 'Version',
  aboutDescription: 'Jieyu — Endangered Language Research Platform',
  aboutRepo: 'Repository',
};

export function getSettingsModalMessages(locale: Locale): SettingsModalMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
