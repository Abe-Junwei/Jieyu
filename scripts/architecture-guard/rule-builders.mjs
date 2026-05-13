/**
 * Shared rule factory helpers consumed by `rules.*.mjs` pattern/page/hook modules.
 * Root `architecture-guard.config.mjs` only spreads exported rule arrays (Phase 0.4).
 *
 * Trend-tracking fields (all optional; consumed by `check-architecture-guard.mjs`):
 *
 *   floorTrendDays   number   When `(today - floorSetAt) >= floorTrendDays`,
 *                              check-architecture-guard emits a WARN suggesting
 *                              the ratchet should be slimmed. Pair with a date in
 *                              `floorSetAt` to anchor the trend window.
 *   floorSetAt       string   ISO date (YYYY-MM-DD) when the current max* values
 *                              were last set / last lowered. Updated by whoever
 *                              tightens the ratchet; bumped forward when the
 *                              ratchet is intentionally raised (in which case the
 *                              PR description must justify the rise).
 *
 * Convention: rules over 95% utilization should declare `floorTrendDays`; the
 * default policy is 90 days (one quarter). Quarterly hotspot review:
 *   `npm run report:architecture-hotspots`.
 */

export function pageControllerRule(name, limits = {}) {
  return {
    matchRegex: new RegExp(`^src/pages/(?:[^/]+/)?${name.replace(/\./g, '\\\\.')}\.ts$`),
    requiredRegexes: [new RegExp(`export function ${name}\\(`)],
    ...limits,
  };
}

export function hookRule(name, limits = {}) {
  return {
    matchRegex: new RegExp(`^src/hooks/(?:[^/]+/)?${name.replace(/\./g, '\\\\.')}\.(ts|tsx)$`),
    requiredRegexes: [new RegExp(`export function ${name}\\(`)],
    ...limits,
  };
}

export function patternRule(matchRegex, limits = {}) {
  return {
    matchRegex,
    ...limits,
  };
}
