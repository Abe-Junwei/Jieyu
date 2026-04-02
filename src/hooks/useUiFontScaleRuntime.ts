import { useMemo, useSyncExternalStore } from 'react';
import {
  UI_FONT_SCALE_LIMITS,
  readUiFontScalePreferenceSnapshot,
  readPersistedUiFontScale,
  resolveTextDirectionFromLocale,
  subscribeUiFontScalePreference,
  type TextDirection,
} from '../utils/panelAdaptiveLayout';

export function useUiFontScaleRuntime(locale: string): {
  uiTextDirection: TextDirection;
  uiFontScale: number;
} {
  const storageSnapshot = useSyncExternalStore(
    subscribeUiFontScalePreference,
    readUiFontScalePreferenceSnapshot,
    () => `auto:${UI_FONT_SCALE_LIMITS.fallback.toFixed(4)}`,
  );

  const uiTextDirection = useMemo<TextDirection>(() => resolveTextDirectionFromLocale(locale), [locale]);
  const uiFontScale = useMemo(
    () => readPersistedUiFontScale(locale, uiTextDirection),
    [locale, storageSnapshot, uiTextDirection],
  );

  return {
    uiTextDirection,
    uiFontScale,
  };
}
