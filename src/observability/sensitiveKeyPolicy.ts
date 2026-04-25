const OBSERVABILITY_SENSITIVE_KEY_SET = new Set([
  'apikey', 'api_key', 'apiKey',
  'token', 'accesstoken', 'accessToken', 'access_token',
  'password', 'secret', 'authorization',
]);

const OBSERVABILITY_SENSITIVE_KEY_RE = /api.?key|token|password|secret|authorization/i;
const OBSERVABILITY_URL_SECRET_RE = /([?&](?:api.?key|token|password|secret|authorization)=)[^&]*/gi;
const OBSERVABILITY_URL_KEY_RE = /url/i;

const DEFAULT_MAX_DEPTH = 10;

export function isSensitiveObservabilityKey(key: string): boolean {
  const lower = key.toLowerCase();
  return OBSERVABILITY_SENSITIVE_KEY_SET.has(lower) || OBSERVABILITY_SENSITIVE_KEY_RE.test(key);
}

export function scrubSensitiveQueryParams(rawUrl: string, replacement = '[REDACTED]'): string {
  return rawUrl.replace(OBSERVABILITY_URL_SECRET_RE, `$1${replacement}`);
}

export function maskSensitiveStringKeepTail(rawValue: string): string {
  if (rawValue.length === 0) {
    return rawValue;
  }
  return `***${rawValue.slice(-4)}`;
}

export function deepScrubSensitiveObject(
  data: Record<string, unknown>,
  options?: {
    maxDepth?: number;
    maskSensitiveString?: (value: string) => unknown;
  },
): Record<string, unknown> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maskSensitiveString = options?.maskSensitiveString ?? maskSensitiveStringKeepTail;

  const scrubValue = (value: unknown, depth: number, seen: WeakSet<object>, keyHint: string): unknown => {
    if (depth > maxDepth) return '[scrub depth exceeded]';
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && OBSERVABILITY_URL_KEY_RE.test(keyHint)) {
        return scrubSensitiveQueryParams(value);
      }
      return value;
    }
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
      return value.map((item) => scrubValue(item, depth + 1, seen, keyHint));
    }
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return scrubData(value as Record<string, unknown>, depth + 1, seen);
  };

  const scrubData = (input: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveObservabilityKey(key) && typeof value === 'string' && value.length > 0) {
        result[key] = maskSensitiveString(value);
      } else {
        result[key] = scrubValue(value, depth, seen, key);
      }
    }
    return result;
  };

  return scrubData(data, 0, new WeakSet());
}
