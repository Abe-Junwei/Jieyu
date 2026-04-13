/**
 * Theme switching utility
 * Manages appearance theme selection and persistence
 *
 * Architecture:
 *   data-appearance 含 googleLightModern（Google 浅色现代）/ solarizedDark（Solarized 暗色）等
 *   data-theme="dark" — 明暗模式（独立控制；Solarized 外观时始终为 dark）
 */

export type ThemeId =
  | 'default'
  | 'mogao'
  | 'qinglv'
  | 'digital'
  | 'mural'
  | 'mogaoNarrative'
  | 'palaceVermilion'
  | 'jiangnanMist'
  | 'googleLightModern'
  | 'solarizedDark'
  | 'antigravity';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  subtitle: string;
  description: string;
  /** Accent color swatch for preview */
  swatchLight: string;
  swatchDark: string;
  /** Background color swatch for preview */
  bgLight: string;
  bgDark: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'default',
    name: '铅印实验室',
    subtitle: 'Monochrome Lab',
    description: '完全依靠明度区分层级，减少色相干扰，适合高强度审计与校对。',
    swatchLight: '#333333',
    swatchDark: '#EDEDED',
    bgLight: '#F5F5F5',
    bgDark: '#111111',
  },
  {
    id: 'mogao',
    name: '鸣沙石窟',
    subtitle: '敦煌风',
    description: '石绿、土红与赭石组合强调文化厚重感，贴近语料“数字博物馆”气质。',
    swatchLight: '#4B644B',
    swatchDark: '#E8C7A6',
    bgLight: '#D9B48F',
    bgDark: '#2A1E1A',
  },
  {
    id: 'qinglv',
    name: '远山叠翠',
    subtitle: '山水画意象',
    description: '深潭绿与松柏绿形成低疲劳阅读体验，强调长时标注与波形观察。',
    swatchLight: '#224C44',
    swatchDark: '#D9E9E5',
    bgLight: '#E8EFEE',
    bgDark: '#0F2320',
  },
  {
    id: 'digital',
    name: '数字青金',
    subtitle: '藏蓝 × 石绿 × 敦煌金',
    description: '深蓝数据感底盘叠加青绿与金色高亮，适配地图、时序与多源看板。',
    swatchLight: '#1A237E',
    swatchDark: '#E2E7FF',
    bgLight: '#EEF3F6',
    bgDark: '#0E1628',
  },
  {
    id: 'mural',
    name: '壁画矿脉',
    subtitle: '藏蓝 × 赭石 × 冷金',
    description: '重彩叙事风格，强化结构层级与视觉张力，适合文化展示与高密信息页。',
    swatchLight: '#283593',
    swatchDark: '#E3E8FF',
    bgLight: '#F4F0EA',
    bgDark: '#1B1F3D',
  },
  {
    id: 'mogaoNarrative',
    name: '莫高窟叙事',
    subtitle: '敦煌矿物色 × 藏蓝骨架',
    description: '大漠黄沙与高原星空：藏蓝、土红、秋葵黄与冷灰分层，对应配色稿 card11。',
    swatchLight: '#1C2B4B',
    swatchDark: '#E6E9ED',
    bgLight: '#FBF8F2',
    bgDark: '#0B1D33',
  },
  {
    id: 'palaceVermilion',
    name: '古建筑与朱墨',
    subtitle: '故宫红墙黛瓦',
    description: '城赭、墨色与洒金对照，庄重规范，对应配色稿 card12。',
    swatchLight: '#923131',
    swatchDark: '#EDE6DA',
    bgLight: '#EDE6DA',
    bgDark: '#2C2C2C',
  },
  {
    id: 'jiangnanMist',
    name: '烟雨江南',
    subtitle: '苏州园林水墨',
    description: '黛蓝、藕荷与月白，低饱和中冷调，适合长时阅读，对应配色稿 card13。',
    swatchLight: '#425066',
    swatchDark: '#E8EEF3',
    bgLight: '#E8EEF3',
    bgDark: '#1E2833',
  },
  {
    id: 'googleLightModern',
    name: 'Light Modern',
    subtitle: 'Google 中性灰 × Google Blue',
    description:
      'Google 产品常见中性灰阶 + Google Blue（浅 #1A73E8 / 深 #8AB4F8）。官方无单独名为 Light Modern 的固定色板，按 Material 系公开色落地。',
    swatchLight: '#1A73E8',
    swatchDark: '#8AB4F8',
    bgLight: '#F8F9FA',
    bgDark: '#202124',
  },
  {
    id: 'solarizedDark',
    name: 'Solarized Dark',
    subtitle: 'Ethan Schoonover',
    description: 'Ethan Schoonover Solarized：base03 底、base0 字，强调色含 blue #268bd2 等（与官网表一致）。',
    swatchLight: '#268bd2',
    swatchDark: '#839496',
    bgLight: '#002b36',
    bgDark: '#002b36',
  },
  {
    id: 'antigravity',
    name: '纯粹禅意',
    subtitle: 'Obsidian Minimal',
    description: '极简留白与低对比边线，减少视觉噪音，让文本与波形成为第一主角。',
    swatchLight: '#1A1A1A',
    swatchDark: '#EDEDED',
    bgLight: '#FFFFFF',
    bgDark: '#111111',
  },
];

const APPEARANCE_KEY = 'jieyu-appearance';
export const THEME_MODE_STORAGE_KEY = 'jieyu-theme';

function readStoredColorSchemePreference(): 'light' | 'dark' | 'system' {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'system';
}

function resolveColorScheme(preference: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 仅更新 DOM，不读写 localStorage（与 App 内「跟随系统」一致） */
function applyDataThemeAttribute(mode: 'light' | 'dark'): void {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/** Solarized 为暗色专用方案：强制 data-theme=dark，避免与全局浅色/跟随系统冲突 */
export function appearanceForcesDataThemeDark(themeId: ThemeId): boolean {
  return themeId === 'solarizedDark';
}

/**
 * 根据当前外观 + localStorage 中的 jieyu-theme（light/dark/system）同步 document 的 data-theme。
 * 在 App 写入 jieyu-theme 之后调用；setAppearance 结束时也会调用。
 */
export function syncDocumentDataTheme(): void {
  const appearance = getTheme();
  if (appearanceForcesDataThemeDark(appearance)) {
    applyDataThemeAttribute('dark');
    return;
  }
  const preference = readStoredColorSchemePreference();
  const mode = resolveColorScheme(preference);
  applyDataThemeAttribute(mode);
}

/**
 * Get the currently active theme ID
 */
export function getTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored as ThemeId;
    }
  } catch {
    // localStorage unavailable
  }
  return 'default';
}

/**
 * 当前生效的明暗（解析后的值；未设置或与 App 一致时视为跟随系统）
 */
export function getThemeMode(): 'light' | 'dark' {
  return resolveColorScheme(readStoredColorSchemePreference());
}

/**
 * Set the appearance theme (配色方案)
 * Updates both localStorage and the DOM data-appearance attribute
 */
export function setAppearance(themeId: ThemeId): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, themeId);
  } catch {
    // localStorage unavailable
  }
  if (themeId === 'default') {
    document.documentElement.removeAttribute('data-appearance');
  } else {
    document.documentElement.setAttribute('data-appearance', themeId);
  }
  syncDocumentDataTheme();
}

/**
 * Initialize appearance + color scheme on app startup.
 * Does not rewrite `jieyu-theme` when the user chose「跟随系统」, so App state stays in sync.
 */
export function initTheme(): { theme: ThemeId; mode: 'light' | 'dark' } {
  const theme = getTheme();
  setAppearance(theme);
  const preference = readStoredColorSchemePreference();
  const mode = resolveColorScheme(preference);
  return { theme, mode };
}
