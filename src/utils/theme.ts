/**
 * Light / dark scheme for the single appearance 纸本田野笔记.
 * data-theme="dark" is the night desk; omitting it is the light sheet.
 */

export const THEME_MODE_STORAGE_KEY = 'jieyu-theme';

const LEGACY_APPEARANCE_KEY = 'jieyu-appearance';
const LEGACY_ACCENT_KEY = 'jieyu-theme-accent';

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

/** 根据 localStorage 中的 jieyu-theme（light/dark/system）同步 document 的 data-theme。 */
export function syncDocumentDataTheme(): void {
  const preference = readStoredColorSchemePreference();
  applyDataThemeAttribute(resolveColorScheme(preference));
}

/**
 * Apply the light/dark scheme on startup.
 * Drops leftover multi-appearance attributes from older builds.
 */
export function initTheme(): { mode: 'light' | 'dark' } {
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme-accent');
  try {
    localStorage.removeItem(LEGACY_APPEARANCE_KEY);
    localStorage.removeItem(LEGACY_ACCENT_KEY);
  } catch {
    // localStorage unavailable
  }
  const preference = readStoredColorSchemePreference();
  const mode = resolveColorScheme(preference);
  applyDataThemeAttribute(mode);
  return { mode };
}
