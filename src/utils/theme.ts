/**
 * Theme utility — light/dark/system mode only (One Voice).
 *
 * Architecture:
 *   data-theme="dark" — 明暗模式（不设 = 浅色）
 *   Selection accent is a single CSS token family (--theme-accent-*, neutral); no
 *   data-appearance / data-theme-accent. Legacy jieyu-appearance / jieyu-theme-accent keys are cleared
 *   on init (fresh default).
 */

export const THEME_MODE_STORAGE_KEY = 'jieyu-theme';

const APPEARANCE_KEY = 'jieyu-appearance';
const THEME_ACCENT_KEY = 'jieyu-theme-accent';

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
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** 仅更新 DOM，不读写 localStorage（与 App 内「跟随系统」一致） */
function applyDataThemeAttribute(mode: 'light' | 'dark'): void {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function clearLegacyAppearanceStorage(): void {
  try {
    localStorage.removeItem(APPEARANCE_KEY);
    localStorage.removeItem(THEME_ACCENT_KEY);
  } catch {
    // localStorage unavailable
  }
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme-accent');
}

/**
 * 根据 localStorage 中的 jieyu-theme（light/dark/system）同步 document 的 data-theme。
 * 在 App 写入 jieyu-theme 之后调用。
 */
export function syncDocumentDataTheme(): void {
  const preference = readStoredColorSchemePreference();
  const mode = resolveColorScheme(preference);
  applyDataThemeAttribute(mode);
}

/**
 * Initialize color scheme on app startup.
 * Clears legacy multi-theme / accent keys (等同新装默认品牌槽).
 * Does not rewrite `jieyu-theme` when the user chose「跟随系统」.
 */
export function initTheme(): { mode: 'light' | 'dark' } {
  clearLegacyAppearanceStorage();
  const preference = readStoredColorSchemePreference();
  const mode = resolveColorScheme(preference);
  applyDataThemeAttribute(mode);
  return { mode };
}
