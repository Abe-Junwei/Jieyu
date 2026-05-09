/**
 * Shared rule factory helpers consumed by `rules.*.mjs` pattern/page/hook modules.
 * Root `architecture-guard.config.mjs` only spreads exported rule arrays (Phase 0.4).
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
