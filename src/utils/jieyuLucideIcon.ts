/**
 * Lucide 图标：尺寸与 stroke 由 `styles/foundation/lucide-jieyu.css` 统一。
 * 分档说明见该文件顶部注释；此处为对应 `className` 常量。
 */

/** 左侧主导航、资源、设置、左栏层按钮、项目包（17px · stroke 2） */
export const JIEYU_LUCIDE_NAV = 'jieyu-lucide jieyu-lucide--nav';

/** 波形顶栏常规钮（16px） */
export const JIEYU_LUCIDE_WAVE = 'jieyu-lucide jieyu-lucide--wave';

/** 播放 / 暂停主钮（18px） */
export const JIEYU_LUCIDE_WAVE_PLAY = 'jieyu-lucide jieyu-lucide--wave-play';

/** 波形 15px 档 */
export const JIEYU_LUCIDE_WAVE_MD = 'jieyu-lucide jieyu-lucide--wave-md';

export const JIEYU_LUCIDE_WAVE_TRIGGER = 'jieyu-lucide jieyu-lucide--wave-trigger';
export const JIEYU_LUCIDE_WAVE_TRIGGER_CHEVRON = 'jieyu-lucide jieyu-lucide--wave-trigger-chevron';

/** 时间轴撤销芯片（13px） */
export const JIEYU_LUCIDE_UNDO_CHIP = 'jieyu-lucide jieyu-lucide--undo-chip';

/** AI 分析面板（14px / 12px） */
export const JIEYU_LUCIDE_AI_PANEL = 'jieyu-lucide jieyu-lucide--ai-panel';
export const JIEYU_LUCIDE_AI_PANEL_SM = 'jieyu-lucide jieyu-lucide--ai-panel-sm';

/** 与主导航同尺 */
export const JIEYU_LUCIDE_LEFT_RAIL_CTX = 'jieyu-lucide jieyu-lucide--nav';

/** 弹层 / 顶栏关闭、返回、视频条 16px 控制 */
export const JIEYU_LUCIDE_PANEL = 'jieyu-lucide jieyu-lucide--panel';

/** 偏大关闭（18px） */
export const JIEYU_LUCIDE_PANEL_CLOSE_LG = 'jieyu-lucide jieyu-lucide--panel-close-lg';

/** 表单 / 卡片内 14px（stroke 2） */
export const JIEYU_LUCIDE_INLINE = 'jieyu-lucide jieyu-lucide--inline';

/** 13px 行内 */
export const JIEYU_LUCIDE_INLINE_TIGHT = 'jieyu-lucide jieyu-lucide--inline-tight';

/** 12px 列表 / 勾 / 刷新 */
export const JIEYU_LUCIDE_MICRO = 'jieyu-lucide jieyu-lucide--micro';

/** 11px 极小 */
export const JIEYU_LUCIDE_MICRO_XS = 'jieyu-lucide jieyu-lucide--micro-xs';

/** 导入等大图标（28px） */
export const JIEYU_LUCIDE_HERO = 'jieyu-lucide jieyu-lucide--hero';

/** 语音挂件主麦（22px） */
export const JIEYU_LUCIDE_VOICE_MIC = 'jieyu-lucide jieyu-lucide--voice-mic';

export function jieyuLucideClass(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}
