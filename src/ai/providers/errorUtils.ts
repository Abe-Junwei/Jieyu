export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'config'
      | 'network'
      | 'auth'
      | 'permission'
      | 'not-found'
      | 'model'
      | 'rate-limit'
      | 'server'
      | 'format'
      | 'unknown',
    public readonly providerLabel: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function shortenText(value: string, maxLength = 220): string {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferStatusCode(
  providerLabel: string,
  status: number,
  bodyText: string,
  fallbackMessage: string,
  retryAfterHeader?: string | null,
): AiProviderError {
  const normalizedBody = bodyText.toLowerCase();
  const suffix = bodyText.trim().length > 0 ? `\uff1a${shortenText(bodyText)}` : '';

  if (status === 400) {
    if (normalizedBody.includes('model') && (normalizedBody.includes('not found') || normalizedBody.includes('unknown'))) {
      return new AiProviderError(`${providerLabel} \u6a21\u578b\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528\uff0c\u8bf7\u68c0\u67e5\u6a21\u578b\u540d${suffix}`, 'model', providerLabel);
    }
    return new AiProviderError(`${providerLabel} \u8bf7\u6c42\u53c2\u6570\u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u6a21\u578b\u540d\u3001\u63a5\u53e3\u5730\u5740\u6216\u8bf7\u6c42\u683c\u5f0f${suffix}`, 'config', providerLabel);
  }
  if (status === 401) {
    return new AiProviderError(`${providerLabel} \u9274\u6743\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 API Key \u6216\u9274\u6743\u5934${suffix}`, 'auth', providerLabel);
  }
  if (status === 403) {
    return new AiProviderError(`${providerLabel} \u65e0\u6743\u9650\u8bbf\u95ee\u8be5\u63a5\u53e3\u6216\u6a21\u578b${suffix}`, 'permission', providerLabel);
  }
  if (status === 404) {
    if (normalizedBody.includes('model')) {
      return new AiProviderError(`${providerLabel} \u6a21\u578b\u4e0d\u5b58\u5728\u6216\u5f53\u524d\u8d26\u53f7\u4e0d\u53ef\u8bbf\u95ee${suffix}`, 'model', providerLabel);
    }
    return new AiProviderError(`${providerLabel} \u63a5\u53e3\u5730\u5740\u4e0d\u5b58\u5728\uff0c\u8bf7\u68c0\u67e5 Base URL \u6216 Endpoint URL${suffix}`, 'not-found', providerLabel);
  }
  if (status === 408 || status === 504) {
    return new AiProviderError(`${providerLabel} \u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u68c0\u67e5\u7f51\u7edc`, 'network', providerLabel);
  }
  if (status === 429) {
    let retryHint = '';
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (Number.isFinite(seconds) && seconds > 0) {
        retryHint = seconds >= 60
          ? `\uff0c\u8bf7 ${Math.ceil(seconds / 60)} \u5206\u949f\u540e\u91cd\u8bd5`
          : `\uff0c\u8bf7 ${seconds} \u79d2\u540e\u91cd\u8bd5`;
      }
    }
    return new AiProviderError(`${providerLabel} \u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\u6216\u989d\u5ea6\u5df2\u8017\u5c3d${retryHint}${suffix}`, 'rate-limit', providerLabel);
  }
  if (status >= 500) {
    return new AiProviderError(`${providerLabel} \u670d\u52a1\u7aef\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5${suffix}`, 'server', providerLabel);
  }

  return new AiProviderError(`${providerLabel} \u8bf7\u6c42\u5931\u8d25 (${status})${suffix || `\uff1a${fallbackMessage}`}`, 'unknown', providerLabel);
}

export async function throwProviderHttpError(
  providerLabel: string,
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const bodyText = await response.text();
  const retryAfter = response.headers.get('Retry-After');
  throw inferStatusCode(providerLabel, response.status, bodyText, fallbackMessage, retryAfter);
}

export function parseProviderJson<T>(
  payload: string,
  providerLabel: string,
  formatLabel: string,
): T {
  try {
    return JSON.parse(payload) as T;
  } catch (err) {
    console.error('[Jieyu] parseProviderResponse: JSON parse failed', { providerLabel, formatLabel, payload, err });
    throw new AiProviderError(
      `${providerLabel} \u8fd4\u56de\u683c\u5f0f\u65e0\u6cd5\u89e3\u6790\uff0c\u8bf7\u68c0\u67e5\u54cd\u5e94\u683c\u5f0f\u662f\u5426\u9009\u62e9\u6b63\u786e\uff08\u5f53\u524d\uff1a${formatLabel}\uff09`,
      'format',
      providerLabel,
    );
  }
}

export function normalizeAiProviderError(error: unknown, providerLabel: string): string {
  if (error instanceof AiProviderError) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `${providerLabel} \u8bf7\u6c42\u5df2\u53d6\u6d88`;
  }
  if (error instanceof TypeError) {
    const message = compactText(error.message);
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('network request failed')) {
      return `${providerLabel} \u7f51\u7edc\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u8de8\u57df\u8bbe\u7f6e\u6216\u63a5\u53e3\u5730\u5740`;
    }
  }
  if (error instanceof Error) {
    const message = compactText(error.message);
    return message.startsWith(providerLabel) ? message : `${providerLabel}\uff1a${message}`;
  }

  return `${providerLabel} \u8bf7\u6c42\u5931\u8d25`;
}

export function requireProviderValue(providerLabel: string, label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AiProviderError(`${providerLabel} \u7f3a\u5c11${label}`, 'config', providerLabel);
  }
  return trimmed;
}

export function ensureHttpHeaderValue(
  providerLabel: string,
  headerName: string,
  value: string,
): string {
  const trimmed = requireProviderValue(providerLabel, ` ${headerName}`, value);

  if (/[\r\n]/.test(trimmed)) {
    throw new AiProviderError(
      `${providerLabel} \u7684 ${headerName} \u542b\u6709\u6362\u884c\u7b26\uff0c\u65e0\u6cd5\u4f5c\u4e3a HTTP \u5934\u53d1\u9001\uff0c\u8bf7\u91cd\u65b0\u7c98\u8d34\u3002`,
      'config',
      providerLabel,
    );
  }

  if (/[^\x00-\xFF]/.test(trimmed)) {
    throw new AiProviderError(
      `${providerLabel} \u7684 ${headerName} \u542b\u6709\u975e ISO-8859-1 \u5b57\u7b26\uff0c\u8bf7\u4f7f\u7528\u7eaf\u82f1\u6587/\u6570\u5b57\u7b26\u53f7\uff08\u907f\u514d\u4e2d\u6587\u3001\u5168\u89d2\u7b26\u53f7\u6216\u667a\u80fd\u5f15\u53f7\uff09\u3002`,
      'config',
      providerLabel,
    );
  }

  return trimmed;
}

export function buildBearerAuthHeader(providerLabel: string, token: string): string {
  const normalized = ensureHttpHeaderValue(providerLabel, 'API Key', token).replace(/^Bearer\s+/i, '').trim();
  if (!normalized) {
    throw new AiProviderError(`${providerLabel} \u7f3a\u5c11 API Key`, 'config', providerLabel);
  }
  return `Bearer ${normalized}`;
}
