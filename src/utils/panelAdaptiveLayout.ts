export type TextDirection = 'ltr' | 'rtl';
export type PanelDensity = 'compact' | 'standard' | 'data-dense' | 'wide';
export type UiFontScaleMode = 'auto' | 'manual';

export interface UiFontScalePreference {
  mode: UiFontScaleMode;
  manualScale: number;
}

const UI_FONT_SCALE_MIN = 0.85;
const UI_FONT_SCALE_MAX = 1.4;
const UI_FONT_SCALE_FALLBACK = 1;
const UI_FONT_SCALE_STORAGE_KEY = 'jieyu:ui-font-scale';
const UI_FONT_SCALE_CHANGE_EVENT = 'jieyu:ui-font-scale-changed';

let runtimeUiFontScalePreference: UiFontScalePreference | null = null;

const RTL_LOCALE_PREFIXES = ['ar', 'fa', 'he', 'ur', 'ps', 'dv', 'ku', 'yi'];
const HEAVY_SCRIPT_PREFIXES = ['th', 'lo', 'km', 'my', 'bo', 'hi', 'bn', 'ta', 'te', 'ml', 'kn', 'si', 'mr', 'gu', 'pa', 'or', 'ne'];
const CJK_PREFIXES = ['zh', 'ja', 'ko'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getLocalePrefix(locale: string): string {
  return locale.trim().toLowerCase().split('-')[0] ?? 'en';
}

export function resolveTextDirectionFromLocale(locale: string): TextDirection {
  const prefix = getLocalePrefix(locale);
  return RTL_LOCALE_PREFIXES.includes(prefix) ? 'rtl' : 'ltr';
}

function resolveScriptWidthMultiplier(locale: string): number {
  const prefix = getLocalePrefix(locale);
  if (HEAVY_SCRIPT_PREFIXES.includes(prefix)) return 1.1;
  if (CJK_PREFIXES.includes(prefix)) return 1.04;
  return 1;
}

function resolveDensityMultiplier(density: PanelDensity): number {
  switch (density) {
    case 'compact':
      return 0.92;
    case 'data-dense':
      return 1.08;
    case 'wide':
      return 1.15;
    case 'standard':
    default:
      return 1;
  }
}

export function computeAutoUiFontScale(locale: string, direction?: TextDirection): number {
  const resolvedDirection = direction ?? resolveTextDirectionFromLocale(locale);
  const scriptMultiplier = resolveScriptWidthMultiplier(locale);
  const directionBoost = resolvedDirection === 'rtl' ? 0.04 : 0;
  const scriptBoost = scriptMultiplier >= 1.1 ? 0.05 : (scriptMultiplier >= 1.04 ? 0.02 : 0);
  return clamp(UI_FONT_SCALE_FALLBACK + directionBoost + scriptBoost, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX);
}

function normalizeUiFontScalePreference(input: Partial<UiFontScalePreference>): UiFontScalePreference {
  const mode: UiFontScaleMode = input.mode === 'manual' ? 'manual' : 'auto';
  return {
    mode,
    manualScale: clamp(input.manualScale ?? UI_FONT_SCALE_FALLBACK, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX),
  };
}

function parseUiFontScalePreferenceFromRaw(raw: string): UiFontScalePreference {
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return normalizeUiFontScalePreference({ mode: 'manual', manualScale: parsed });
  }

  const payload = JSON.parse(raw) as Partial<UiFontScalePreference> & { scale?: number };
  return normalizeUiFontScalePreference({
    ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
    ...(payload.manualScale !== undefined
      ? { manualScale: payload.manualScale }
      : (payload.scale !== undefined ? { manualScale: payload.scale } : {})),
  });
}

export function resolveEffectiveUiFontScale(preference: UiFontScalePreference, autoScale: number): number {
  return preference.mode === 'manual'
    ? clamp(preference.manualScale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX)
    : clamp(autoScale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX);
}

export function readPersistedUiFontScalePreference(): UiFontScalePreference {
  if (typeof window === 'undefined') {
    return runtimeUiFontScalePreference
      ?? normalizeUiFontScalePreference({ mode: 'auto', manualScale: UI_FONT_SCALE_FALLBACK });
  }
  try {
    const raw = window.localStorage.getItem(UI_FONT_SCALE_STORAGE_KEY);
    if (!raw) {
      return runtimeUiFontScalePreference
        ?? normalizeUiFontScalePreference({ mode: 'auto', manualScale: UI_FONT_SCALE_FALLBACK });
    }
    const parsed = parseUiFontScalePreferenceFromRaw(raw);
    runtimeUiFontScalePreference = parsed;
    return parsed;
  } catch {
    return runtimeUiFontScalePreference
      ?? normalizeUiFontScalePreference({ mode: 'auto', manualScale: UI_FONT_SCALE_FALLBACK });
  }
}

export function persistUiFontScalePreference(preference: UiFontScalePreference): UiFontScalePreference {
  const normalized = normalizeUiFontScalePreference(preference);
  runtimeUiFontScalePreference = normalized;
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(UI_FONT_SCALE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore persistence failures and keep runtime value available.
  }
  try {
    window.dispatchEvent(new CustomEvent<UiFontScalePreference>(UI_FONT_SCALE_CHANGE_EVENT, { detail: normalized }));
  } catch {
    // Ignore dispatch failures.
  }
  return normalized;
}

export function subscribeUiFontScalePreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleChange = (event: Event) => {
    const customEvent = event as CustomEvent<UiFontScalePreference>;
    if (customEvent.detail) {
      runtimeUiFontScalePreference = normalizeUiFontScalePreference(customEvent.detail);
    }
    listener();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === UI_FONT_SCALE_STORAGE_KEY) {
      if (event.newValue === null) {
        runtimeUiFontScalePreference = null;
      } else {
        try {
          runtimeUiFontScalePreference = parseUiFontScalePreferenceFromRaw(event.newValue);
        } catch {
          // Keep runtime value if parsing storage event payload failed.
        }
      }
      listener();
    }
  };

  window.addEventListener(UI_FONT_SCALE_CHANGE_EVENT, handleChange as EventListener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(UI_FONT_SCALE_CHANGE_EVENT, handleChange as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function readUiFontScalePreferenceSnapshot(): string {
  const preference = readPersistedUiFontScalePreference();
  return `${preference.mode}:${preference.manualScale.toFixed(4)}`;
}

export function readPersistedUiFontScale(locale?: string, direction?: TextDirection): number {
  const preference = readPersistedUiFontScalePreference();
  const autoScale = computeAutoUiFontScale(locale ?? 'en-US', direction);
  return resolveEffectiveUiFontScale(preference, autoScale);
}

export function persistUiFontScale(scale: number): number {
  const normalized = clamp(scale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX);
  const persisted = persistUiFontScalePreference({ mode: 'manual', manualScale: normalized });
  return persisted.manualScale;
}

export function computeAdaptivePanelWidth(input: {
  baseWidth: number;
  locale: string;
  uiFontScale: number;
  density?: PanelDensity;
  direction?: TextDirection;
  minWidth?: number;
  maxWidth?: number;
  viewportWidth?: number;
}): number {
  const density = input.density ?? 'standard';
  const direction = input.direction ?? resolveTextDirectionFromLocale(input.locale);
  const fontScale = clamp(input.uiFontScale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX);
  const scriptMultiplier = resolveScriptWidthMultiplier(input.locale);
  const densityMultiplier = resolveDensityMultiplier(density);
  const directionMultiplier = direction === 'rtl' ? 1.06 : 1;
  const directionPadding = direction === 'rtl' ? 20 : 8;

  const raw = input.baseWidth * fontScale * scriptMultiplier * densityMultiplier * directionMultiplier + directionPadding;

  const requestedMinWidth = input.minWidth ?? 280;
  const requestedMaxWidth = input.maxWidth ?? 900;
  const viewportCap = input.viewportWidth
    ? Math.max(1, Math.floor(input.viewportWidth * 0.92))
    : Number.POSITIVE_INFINITY;
  const maxWidth = Math.min(requestedMaxWidth, viewportCap);
  const minWidth = Math.min(requestedMinWidth, maxWidth);
  return Math.round(clamp(raw, minWidth, maxWidth));
}

export function normalizeUiFontScale(scale: number): number {
  return clamp(scale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX);
}

export const UI_FONT_SCALE_LIMITS = {
  min: UI_FONT_SCALE_MIN,
  max: UI_FONT_SCALE_MAX,
  fallback: UI_FONT_SCALE_FALLBACK,
  storageKey: UI_FONT_SCALE_STORAGE_KEY,
  changeEvent: UI_FONT_SCALE_CHANGE_EVENT,
} as const;
