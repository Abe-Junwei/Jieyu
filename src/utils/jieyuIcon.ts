/**
 * 图标尺寸档：`styles/foundation/jieyu-icon.css`（Lucide SVG，类名 jieyu-icon--*）。
 * 只有两档（ADR-0111）：左轨、导入大图标、语音主麦 20px，其余 16px；类名只表示位置。
 */

import type { LucideIcon } from 'lucide-react';
import { icons } from 'lucide-react';

/** 左侧栏图标（Lucide 名） */
export type LeftRailNavIconName =
  | 'AudioLines'
  | 'Pencil'
  | 'Brain'
  | 'NotebookPen'
  | 'BookOpen'
  | 'Languages'
  | 'BookBookmark'
  | 'GitBranch'
  | 'Library'
  | 'Settings'
  | 'Package'
  | 'Layers';

export type JieyuIconName = keyof typeof icons;

/** lucide-react 1.x：部分旧名仅作 named export 别名，不在 `icons` 字典中 */
const LUCIDE_NAME_ALIASES: Record<string, keyof typeof icons> = {
  AlertCircle: 'CircleAlert',
  AlertTriangle: 'TriangleAlert',
  BookMarked: 'BookBookmark',
  FileAudio: 'FileHeadphone',
  FileVideo: 'FilePlay',
  History: 'RotateCcwClock',
  MoreVertical: 'EllipsisVertical',
  Trash2: 'Trash',
  Wand2: 'WandSparkles',
  CircleHelp: 'CircleQuestionMark',
  HelpCircle: 'CircleQuestionMark',
};

export function resolveJieyuIcon(name: string): LucideIcon {
  const canonical = (LUCIDE_NAME_ALIASES[name] ?? name) as string;
  const Icon =
    (icons as Record<string, LucideIcon | undefined>)[canonical] ??
    (icons as Record<string, LucideIcon | undefined>)[name];
  if (!Icon) {
    if (import.meta.env.DEV) {
      console.warn(`[icons] unknown Lucide name "${name}", using CircleHelp`);
    }
    return icons.CircleQuestionMark;
  }
  return Icon;
}

/** 左侧主导航、资源、设置、左栏层按钮、项目包（20px） */
export const JIEYU_ICON_NAV = 'jieyu-icon--nav';

/** 波形顶栏常规钮 */
export const JIEYU_ICON_WAVE = 'jieyu-icon--wave';

/** 播放 / 暂停主钮 */
export const JIEYU_ICON_WAVE_PLAY = 'jieyu-icon--wave-play';

/** 波形次要钮 */
export const JIEYU_ICON_WAVE_MD = 'jieyu-icon--wave-md';

export const JIEYU_ICON_WAVE_TRIGGER = 'jieyu-icon--wave-trigger';

/** 时间轴撤销芯片 */
export const JIEYU_ICON_UNDO_CHIP = 'jieyu-icon--undo-chip';

/** AI 分析面板 */
export const JIEYU_ICON_AI_PANEL = 'jieyu-icon--ai-panel';
export const JIEYU_ICON_AI_PANEL_SM = 'jieyu-icon--ai-panel-sm';

/** 与主导航同尺 */
export const JIEYU_ICON_LEFT_RAIL_CTX = 'jieyu-icon--nav';

/** 弹层 / 顶栏关闭、返回、视频条控制 */
export const JIEYU_ICON_PANEL = 'jieyu-icon--panel';

/** 弹层主关闭 */
export const JIEYU_ICON_PANEL_CLOSE_LG = 'jieyu-icon--panel-close-lg';

/** 表单 / 卡片内 */
export const JIEYU_ICON_INLINE = 'jieyu-icon--inline';

/** 行内 */
export const JIEYU_ICON_INLINE_TIGHT = 'jieyu-icon--inline-tight';

/** 列表 / 勾 / 刷新 */
export const JIEYU_ICON_MICRO = 'jieyu-icon--micro';

/** 极小记号 */
export const JIEYU_ICON_MICRO_XS = 'jieyu-icon--micro-xs';

/** 导入等大图标（20px） */
export const JIEYU_ICON_HERO = 'jieyu-icon--hero';

/** 语音挂件主麦（20px） */
export const JIEYU_ICON_VOICE_MIC = 'jieyu-icon--voice-mic';

export function jieyuIconClass(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}
