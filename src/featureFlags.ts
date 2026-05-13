/**
 * src/featureFlags.ts — minimal feature flag registry for Jieyu.
 *
 * Goals (per copilot-instructions.md §5.5 and 拍板 1B):
 *   - High-risk or UI-visibly-large changes are merged behind a flag default `false`.
 *   - Self-dogfood for ~1 week, then flip default to `true`.
 *   - Once stable for 1 release cycle, **remove the flag and all branches** —
 *     do not let long-lived dead branches accumulate.
 *
 * Sources (highest to lowest priority):
 *   1. localStorage["jieyu.featureFlags"] (JSON object) — for runtime toggling
 *      during dogfooding without rebuilds. Lives in the user's browser only.
 *   2. import.meta.env.VITE_FLAG_<FLAG_NAME> — for build-time defaults that
 *      differ by environment (dev / preview / prod).
 *   3. Hardcoded `DEFAULTS` in this file — authoritative baseline.
 *
 * Type-safe: every flag is declared once in `FeatureFlags`. Adding a flag:
 *   1. Add the key + type to `FeatureFlags`.
 *   2. Add the default value to `DEFAULTS`.
 *   3. Document migration plan (when to flip default true, when to remove flag).
 *
 * No SaaS dependency, no remote rollout. Strictly local — consistent with the
 * 拍板 7A 自用工具优先策略.
 */

export interface FeatureFlags {
  // Placeholder example flag. Remove once a real flag lands. Used by tests to
  // verify the registry mechanism end-to-end.
  __exampleBoolean: boolean;
}

const DEFAULTS: FeatureFlags = {
  __exampleBoolean: false,
};

const LOCAL_STORAGE_KEY = 'jieyu.featureFlags';
const ENV_PREFIX = 'VITE_FLAG_';

function readEnvOverride<K extends keyof FeatureFlags>(name: K): FeatureFlags[K] | undefined {
  if (typeof import.meta === 'undefined' || !import.meta.env) return undefined;
  const envKey = `${ENV_PREFIX}${String(name).toUpperCase()}`;
  const raw = (import.meta.env as Record<string, string | undefined>)[envKey];
  if (raw === undefined) return undefined;
  return coerce(raw, DEFAULTS[name]) as FeatureFlags[K];
}

function readLocalStorageOverride<K extends keyof FeatureFlags>(
  name: K,
): FeatureFlags[K] | undefined {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Record<keyof FeatureFlags, unknown>>;
    if (!(name in parsed)) return undefined;
    return coerce(parsed[name], DEFAULTS[name]) as FeatureFlags[K];
  } catch {
    return undefined;
  }
}

function coerce(input: unknown, fallback: unknown): unknown {
  if (typeof fallback === 'boolean') {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') return input === 'true' || input === '1';
    return fallback;
  }
  // enum-string flags: accept any string, fall back to default if not a string.
  if (typeof fallback === 'string') {
    return typeof input === 'string' ? input : fallback;
  }
  return input ?? fallback;
}

/**
 * Read a feature flag value. Resolves localStorage > env > default.
 *
 * Example:
 *   if (getFeatureFlag('__exampleBoolean')) { ... }
 */
export function getFeatureFlag<K extends keyof FeatureFlags>(name: K): FeatureFlags[K] {
  const fromLocal = readLocalStorageOverride(name);
  if (fromLocal !== undefined) return fromLocal;
  const fromEnv = readEnvOverride(name);
  if (fromEnv !== undefined) return fromEnv;
  return DEFAULTS[name];
}

/**
 * For dev/test only: set a flag in localStorage for the current browser.
 * Returns the resolved value after the write so callers can verify.
 */
export function setLocalFeatureFlag<K extends keyof FeatureFlags>(
  name: K,
  value: FeatureFlags[K],
): FeatureFlags[K] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return getFeatureFlag(name);
  }
  let current: Partial<Record<keyof FeatureFlags, unknown>> = {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as Partial<Record<keyof FeatureFlags, unknown>>;
  } catch {
    current = {};
  }
  current[name] = value;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  return getFeatureFlag(name);
}

/**
 * Read all flag values (defaults + active overrides), for diagnostics / dev UI.
 */
export function getAllFeatureFlags(): FeatureFlags {
  const result: Partial<FeatureFlags> = {};
  for (const key of Object.keys(DEFAULTS) as Array<keyof FeatureFlags>) {
    (result as Record<keyof FeatureFlags, unknown>)[key] = getFeatureFlag(key);
  }
  return result as FeatureFlags;
}
