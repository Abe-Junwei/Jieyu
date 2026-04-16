import { useMemo, useSyncExternalStore } from 'react';
import { UI_FONT_SCALE_LIMITS, readPersistedUiFontScalePreference, readUiFontScalePreferenceSnapshot, readPersistedUiFontScale, resolveTextDirectionFromLocale, subscribeUiFontScalePreference, type TextDirection, type UiFontScaleMode } from '../utils/panelAdaptiveLayout';

export function useUiFontScaleRuntime(locale: string): {
  uiTextDirection: TextDirection;
  uiFontScale: number;
  uiFontScaleMode: UiFontScaleMode;
} {
  const storageSnapshot = useSyncExternalStore(
    subscribeUiFontScalePreference,
    readUiFontScalePreferenceSnapshot,
    () => `auto:${UI_FONT_SCALE_LIMITS.fallback.toFixed(4)}`,
  );

  const uiTextDirection = useMemo<TextDirection>(() => resolveTextDirectionFromLocale(locale), [locale]);
  const uiFontScaleMode = useMemo<UiFontScaleMode>(
    () => readPersistedUiFontScalePreference().mode,
    [storageSnapshot],
  );
  const uiFontScale = useMemo(
    () => readPersistedUiFontScale(locale, uiTextDirection),
    [locale, storageSnapshot, uiTextDirection],
  );

  return {
    uiTextDirection,
    uiFontScale,
    uiFontScaleMode,
  };
}
