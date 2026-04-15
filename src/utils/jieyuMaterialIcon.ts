/**
 * Material Symbols：尺寸由 `styles/foundation/material-jieyu.css` 统一。
 * 图标来自 https://fonts.google.com/icons （Outlined，ligature 名称）
 */

/** 左侧栏图标 ligature 名（与 `assets/lottie/left-rail/icons/*.json` 文件名对齐，便于脚本/资源对照） */
export type LeftRailNavIconName =
  | 'speech_to_text'
  | 'draw'
  | 'psychology'
  | 'edit_note'
  | 'menu_book'
  | 'translate'
  | 'auto_stories'
  | 'account_tree'
  | 'local_library'
  | 'settings'
  | 'inventory_2'
  | 'layers';

/** 左侧主导航、资源、设置、左栏层按钮、项目包（--jieyu-material-nav-size） */
export const JIEYU_MATERIAL_NAV = 'jieyu-material--nav';

/** 波形顶栏常规钮（16px） */
export const JIEYU_MATERIAL_WAVE = 'jieyu-material--wave';

/** 播放 / 暂停主钮（18px） */
export const JIEYU_MATERIAL_WAVE_PLAY = 'jieyu-material--wave-play';

/** 波形 15px 档 */
export const JIEYU_MATERIAL_WAVE_MD = 'jieyu-material--wave-md';

export const JIEYU_MATERIAL_WAVE_TRIGGER = 'jieyu-material--wave-trigger';
export const JIEYU_MATERIAL_WAVE_TRIGGER_CHEVRON = 'jieyu-material--wave-trigger-chevron';

/** 时间轴撤销芯片（13px） */
export const JIEYU_MATERIAL_UNDO_CHIP = 'jieyu-material--undo-chip';

/** AI 分析面板（14px / 12px） */
export const JIEYU_MATERIAL_AI_PANEL = 'jieyu-material--ai-panel';
export const JIEYU_MATERIAL_AI_PANEL_SM = 'jieyu-material--ai-panel-sm';

/** 与主导航同尺 */
export const JIEYU_MATERIAL_LEFT_RAIL_CTX = 'jieyu-material--nav';

/** 弹层 / 顶栏关闭、返回、视频条 16px 控制 */
export const JIEYU_MATERIAL_PANEL = 'jieyu-material--panel';

/** 偏大关闭（18px） */
export const JIEYU_MATERIAL_PANEL_CLOSE_LG = 'jieyu-material--panel-close-lg';

/** 表单 / 卡片内 14px */
export const JIEYU_MATERIAL_INLINE = 'jieyu-material--inline';

/** 13px 行内 */
export const JIEYU_MATERIAL_INLINE_TIGHT = 'jieyu-material--inline-tight';

/** 12px 列表 / 勾 / 刷新 */
export const JIEYU_MATERIAL_MICRO = 'jieyu-material--micro';

/** 11px 极小 */
export const JIEYU_MATERIAL_MICRO_XS = 'jieyu-material--micro-xs';

/** 导入等大图标（28px） */
export const JIEYU_MATERIAL_HERO = 'jieyu-material--hero';

/** 语音挂件主麦（22px） */
export const JIEYU_MATERIAL_VOICE_MIC = 'jieyu-material--voice-mic';

export function jieyuMaterialClass(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}
