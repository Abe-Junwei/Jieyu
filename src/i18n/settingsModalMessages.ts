import type { Locale } from './index';

export type SettingsModalMessages = {
  title: string;
  close: string;
  tabAppearance: string;
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
  fontScaleReset: string;
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
  // 关于 | About
  aboutVersion: string;
  aboutDescription: string;
  aboutRepo: string;
};

const zhCN: SettingsModalMessages = {
  title: '设置',
  close: '关闭设置',
  tabAppearance: '外观',
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
  fontScaleReset: '重置',
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
  aboutVersion: '版本',
  aboutDescription: '解语 Jieyu — 濒危语言科研协作平台',
  aboutRepo: '项目仓库',
};

const enUS: SettingsModalMessages = {
  title: 'Settings',
  close: 'Close settings',
  tabAppearance: 'Appearance',
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
  fontScaleReset: 'Reset',
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
  aboutVersion: 'Version',
  aboutDescription: 'Jieyu — Endangered Language Research Platform',
  aboutRepo: 'Repository',
};

export function getSettingsModalMessages(locale: Locale): SettingsModalMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
