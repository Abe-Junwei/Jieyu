import { useCallback, useEffect, useState } from 'react';
import {
  LOCALE_PREFERENCE_STORAGE_KEY,
  detectLocale,
  preloadLocaleDictionary,
  setStoredLocalePreference,
  type Locale,
} from '../i18n';
import {
  persistUiFontScalePreference,
  readPersistedUiFontScalePreference,
  type UiFontScaleMode,
} from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/ui/useUiFontScaleRuntime';
import { syncDocumentDataTheme, THEME_MODE_STORAGE_KEY } from '../utils/theme';
import type { ThemeMode } from '../components/settings/settingsConstants';

function readLocalStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readInitialThemeMode(): ThemeMode {
  const stored = readLocalStorageValue(THEME_MODE_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function useDesktopShellPreferences() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { uiFontScale, uiFontScaleMode } = useUiFontScaleRuntime(locale);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    } catch {
      // Ignore theme persistence failures and keep the current session theme.
    }
    syncDocumentDataTheme();
    if (themeMode !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      syncDocumentDataTheme();
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [themeMode]);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.setAttribute('data-motion-ready', '');
      });
    });
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === LOCALE_PREFERENCE_STORAGE_KEY) {
        setLocale(detectLocale());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleLocaleChange = useCallback(async (nextLocale: Locale) => {
    await preloadLocaleDictionary(nextLocale);
    setStoredLocalePreference(nextLocale);
    setLocale(nextLocale);
  }, []);

  const handleFontScaleChange = useCallback((scale: number) => {
    persistUiFontScalePreference({ mode: 'manual', manualScale: scale });
  }, []);

  const handleFontScaleModeChange = useCallback(
    (mode: UiFontScaleMode) => {
      const current = readPersistedUiFontScalePreference();
      persistUiFontScalePreference({
        mode,
        manualScale: mode === 'manual' ? uiFontScale : current.manualScale,
      });
    },
    [uiFontScale],
  );

  return {
    locale,
    themeMode,
    setThemeMode,
    isSettingsOpen,
    openSettings: useCallback(() => setIsSettingsOpen(true), []),
    closeSettings: useCallback(() => setIsSettingsOpen(false), []),
    uiFontScale,
    uiFontScaleMode,
    handleLocaleChange,
    handleFontScaleChange,
    handleFontScaleModeChange,
  };
}
