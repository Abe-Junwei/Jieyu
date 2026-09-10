/** Frozen three-page nav keys (三页联评 R6/R8). Do not rename in a feature PR. */

export const LEXICON_RETURN_QUERY_KEY = 'lexiconReturn';

export const WORKSPACE_URL_NAV_KEYS = [
  'unitId',
  'layerId',
  'layer',
  LEXICON_RETURN_QUERY_KEY,
] as const;
export const WORKSPACE_SESSION_ONLY_KEYS = ['lexiconListState', 'corpusViewState'] as const;
export const WORKSPACE_ROUTER_SESSION_ONLY_KEYS = ['corpusBasket'] as const;

export function readLexiconReturnParam(searchParams: URLSearchParams): string {
  return searchParams.get(LEXICON_RETURN_QUERY_KEY)?.trim() ?? '';
}

export function buildLexiconWorkspaceHref(): '/lexicon' {
  return '/lexicon';
}

export function findWorkspaceStateDualWriteViolations(input: {
  urlKeys: readonly string[];
  sessionStorageKeys: readonly string[];
}): string[] {
  const url = new Set(input.urlKeys);
  const session = new Set(input.sessionStorageKeys);
  const violations: string[] = [];
  for (const key of WORKSPACE_SESSION_ONLY_KEYS) {
    if (url.has(key)) violations.push(`session-only key in URL: ${key}`);
  }
  for (const key of WORKSPACE_ROUTER_SESSION_ONLY_KEYS) {
    if (url.has(key)) violations.push(`router-session key in URL: ${key}`);
    if (session.has(key)) violations.push(`router-session key in sessionStorage: ${key}`);
  }
  for (const key of WORKSPACE_URL_NAV_KEYS) {
    if (session.has(key)) violations.push(`URL-nav key in sessionStorage: ${key}`);
  }
  return violations;
}

/** sessionStorage list scroll; omit 0 / NaN so empty payloads stay compact. */
export function readOptionalListScrollTop(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const rounded = Math.round(numeric);
  return rounded > 0 ? rounded : undefined;
}
