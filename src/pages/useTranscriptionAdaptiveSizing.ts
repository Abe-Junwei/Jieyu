import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../i18n';
import { UI_FONT_SCALE_LIMITS, computeAutoUiFontScale, computeAdaptivePanelWidth, normalizeUiFontScale, persistUiFontScalePreference, readPersistedUiFontScalePreference, resolveEffectiveUiFontScale, resolveTextDirectionFromLocale, subscribeUiFontScalePreference, type TextDirection, type UiFontScaleMode } from '../utils/panelAdaptiveLayout';
import { useViewportWidth } from '../hooks/useViewportWidth';

type AdaptiveDensity = 'standard' | 'compact' | 'wide';

interface WidthConfig {
  baseWidth: number;
  density: AdaptiveDensity;
  minWidth: number;
  maxWidth: number;
}

interface AdaptiveWidths {
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
}

function computeWidth(
  config: WidthConfig,
  locale: Locale,
  direction: TextDirection,
  uiFontScale: number,
  viewportWidth: number | undefined,
): number {
  return computeAdaptivePanelWidth({
    baseWidth: config.baseWidth,
    locale,
    direction,
    uiFontScale,
    density: config.density,
    minWidth: config.minWidth,
    maxWidth: config.maxWidth,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  });
}

function computeAdaptiveWidths(
  locale: Locale,
  direction: TextDirection,
  uiFontScale: number,
  viewportWidth: number | undefined,
): AdaptiveWidths {
  return {
    adaptiveDialogWidth: computeWidth({ baseWidth: 480, density: 'standard', minWidth: 360, maxWidth: 760 }, locale, direction, uiFontScale, viewportWidth),
    adaptiveDialogCompactWidth: computeWidth({ baseWidth: 320, density: 'compact', minWidth: 260, maxWidth: 460 }, locale, direction, uiFontScale, viewportWidth),
    adaptiveDialogWideWidth: computeWidth({ baseWidth: 760, density: 'standard', minWidth: 560, maxWidth: 900 }, locale, direction, uiFontScale, viewportWidth),
  };
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
}

export function useTranscriptionAdaptiveSizing(locale: Locale): UseTranscriptionAdaptiveSizingResult {
  const [uiFontScalePreference, setUiFontScalePreference] = useState(() => readPersistedUiFontScalePreference());

  const uiTextDirection = resolveTextDirectionFromLocale(locale);
  const autoUiFontScale = computeAutoUiFontScale(locale, uiTextDirection);
  const uiFontScale = resolveEffectiveUiFontScale(uiFontScalePreference, autoUiFontScale);
  const uiFontScaleMode = uiFontScalePreference.mode;

  const setUiFontScale = useCallback((nextScale: number) => {
    const persisted = persistUiFontScalePreference({
      mode: 'manual',
      manualScale: normalizeUiFontScale(nextScale),
    });
    setUiFontScalePreference(persisted);
  }, []);

  const resetUiFontScale = useCallback(() => {
    const persisted = persistUiFontScalePreference({
      mode: 'auto',
      manualScale: normalizeUiFontScale(uiFontScalePreference.manualScale ?? UI_FONT_SCALE_LIMITS.fallback),
    });
    setUiFontScalePreference(persisted);
  }, [uiFontScalePreference.manualScale]);

  useEffect(() => {
    return subscribeUiFontScalePreference(() => {
      setUiFontScalePreference(readPersistedUiFontScalePreference());
    });
  }, []);

  const viewportWidth = useViewportWidth();
  const {
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
  } = computeAdaptiveWidths(locale, uiTextDirection, uiFontScale, viewportWidth);

  return {
    uiFontScale,
    uiFontScaleMode,
    setUiFontScale,
    resetUiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
  };
}
