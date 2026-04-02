import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../i18n';
import {
  UI_FONT_SCALE_LIMITS,
  computeAutoUiFontScale,
  computeAdaptivePanelWidth,
  normalizeUiFontScale,
  persistUiFontScalePreference,
  readPersistedUiFontScalePreference,
  resolveEffectiveUiFontScale,
  resolveTextDirectionFromLocale,
  type TextDirection,
  type UiFontScaleMode,
} from '../utils/panelAdaptiveLayout';

type AdaptiveDensity = 'standard' | 'compact' | 'wide';

interface WidthConfig {
  baseWidth: number;
  density: AdaptiveDensity;
  minWidth: number;
  maxWidth: number;
}

function computeWidth(
  config: WidthConfig,
  locale: Locale,
  direction: TextDirection,
  uiFontScale: number,
): number {
  return computeAdaptivePanelWidth({
    baseWidth: config.baseWidth,
    locale,
    direction,
    uiFontScale,
    density: config.density,
    minWidth: config.minWidth,
    maxWidth: config.maxWidth,
    ...(typeof window !== 'undefined' ? { viewportWidth: window.innerWidth } : {}),
  });
}

export interface UseTranscriptionAdaptiveSizingResult {
  uiFontScale: number;
  uiFontScaleMode: UiFontScaleMode;
  setUiFontScale: (nextScale: number) => void;
  resetUiFontScale: () => void;
  uiTextDirection: TextDirection;
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
  adaptiveFloatingWidth: number;
}

export function useTranscriptionAdaptiveSizing(locale: Locale): UseTranscriptionAdaptiveSizingResult {
  const [uiFontScalePreference, setUiFontScalePreference] = useState(() => readPersistedUiFontScalePreference());

  const uiTextDirection = useMemo<TextDirection>(() => resolveTextDirectionFromLocale(locale), [locale]);
  const autoUiFontScale = useMemo(
    () => computeAutoUiFontScale(locale, uiTextDirection),
    [locale, uiTextDirection],
  );
  const uiFontScale = useMemo(
    () => resolveEffectiveUiFontScale(uiFontScalePreference, autoUiFontScale),
    [autoUiFontScale, uiFontScalePreference],
  );
  const uiFontScaleMode = uiFontScalePreference.mode;

  const setUiFontScale = useCallback((nextScale: number) => {
    setUiFontScalePreference((prev) => ({
      ...prev,
      mode: 'manual',
      manualScale: normalizeUiFontScale(nextScale),
    }));
  }, []);

  const resetUiFontScale = useCallback(() => {
    setUiFontScalePreference((prev) => ({
      ...prev,
      mode: 'auto',
      manualScale: normalizeUiFontScale(prev.manualScale ?? UI_FONT_SCALE_LIMITS.fallback),
    }));
  }, []);

  useEffect(() => {
    persistUiFontScalePreference(uiFontScalePreference);
  }, [uiFontScalePreference]);

  const adaptiveDialogWidth = useMemo(
    () => computeWidth({ baseWidth: 480, density: 'standard', minWidth: 360, maxWidth: 760 }, locale, uiTextDirection, uiFontScale),
    [locale, uiTextDirection, uiFontScale],
  );
  const adaptiveDialogCompactWidth = useMemo(
    () => computeWidth({ baseWidth: 320, density: 'compact', minWidth: 260, maxWidth: 460 }, locale, uiTextDirection, uiFontScale),
    [locale, uiTextDirection, uiFontScale],
  );
  const adaptiveDialogWideWidth = useMemo(
    () => computeWidth({ baseWidth: 760, density: 'wide', minWidth: 560, maxWidth: 980 }, locale, uiTextDirection, uiFontScale),
    [locale, uiTextDirection, uiFontScale],
  );
  const adaptiveFloatingWidth = useMemo(
    () => computeWidth({ baseWidth: 360, density: 'standard', minWidth: 300, maxWidth: 620 }, locale, uiTextDirection, uiFontScale),
    [locale, uiTextDirection, uiFontScale],
  );

  return {
    uiFontScale,
    uiFontScaleMode,
    setUiFontScale,
    resetUiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
    adaptiveFloatingWidth,
  };
}
