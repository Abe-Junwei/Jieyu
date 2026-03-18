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
): AiProviderError {
  const normalizedBody = bodyText.toLowerCase();
  const suffix = bodyText.trim().length > 0 ? `：${shortenText(bodyText)}` : '';

  if (status === 400) {
    if (normalizedBody.includes('model') && (normalizedBody.includes('not found') || normalizedBody.includes('unknown'))) {
      return new AiProviderError(`${providerLabel} 模型不存在或不可用，请检查模型名${suffix}`, 'model', providerLabel);
    }
    return new AiProviderError(`${providerLabel} 请求参数无效，请检查模型名、接口地址或请求格式${suffix}`, 'config', providerLabel);
  }
  if (status === 401) {
    return new AiProviderError(`${providerLabel} 鉴权失败，请检查 API Key 或鉴权头${suffix}`, 'auth', providerLabel);
  }
  if (status === 403) {
    return new AiProviderError(`${providerLabel} 无权限访问该接口或模型${suffix}`, 'permission', providerLabel);
  }
  if (status === 404) {
    if (normalizedBody.includes('model')) {
      return new AiProviderError(`${providerLabel} 模型不存在或当前账号不可访问${suffix}`, 'model', providerLabel);
    }
    return new AiProviderError(`${providerLabel} 接口地址不存在，请检查 Base URL 或 Endpoint URL${suffix}`, 'not-found', providerLabel);
  }
  if (status === 408 || status === 504) {
    return new AiProviderError(`${providerLabel} 请求超时，请稍后重试或检查网络`, 'network', providerLabel);
  }
  if (status === 429) {
    return new AiProviderError(`${providerLabel} 请求过于频繁或额度已耗尽${suffix}`, 'rate-limit', providerLabel);
  }
  if (status >= 500) {
    return new AiProviderError(`${providerLabel} 服务端异常，请稍后重试${suffix}`, 'server', providerLabel);
  }

  return new AiProviderError(`${providerLabel} 请求失败 (${status})${suffix || `：${fallbackMessage}`}`, 'unknown', providerLabel);
}

export async function throwProviderHttpError(
  providerLabel: string,
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const bodyText = await response.text();
  throw inferStatusCode(providerLabel, response.status, bodyText, fallbackMessage);
}

export function parseProviderJson<T>(
  payload: string,
  providerLabel: string,
  formatLabel: string,
): T {
  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new AiProviderError(
      `${providerLabel} 返回格式无法解析，请检查响应格式是否选择正确（当前：${formatLabel}）`,
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
    return `${providerLabel} 请求已取消`;
  }
  if (error instanceof TypeError) {
    const message = compactText(error.message);
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('network request failed')) {
      return `${providerLabel} 网络连接失败，请检查网络、跨域设置或接口地址`;
    }
  }
  if (error instanceof Error) {
    return compactText(error.message);
  }

  return `${providerLabel} 请求失败`;
}

export function requireProviderValue(providerLabel: string, label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AiProviderError(`${providerLabel} 缺少${label}`, 'config', providerLabel);
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
      `${providerLabel} 的 ${headerName} 含有换行符，无法作为 HTTP 头发送，请重新粘贴。`,
      'config',
      providerLabel,
    );
  }

  if (/[^\x00-\xFF]/.test(trimmed)) {
    throw new AiProviderError(
      `${providerLabel} 的 ${headerName} 含有非 ISO-8859-1 字符，请使用纯英文/数字符号（避免中文、全角符号或智能引号）。`,
      'config',
      providerLabel,
    );
  }

  return trimmed;
}

export function buildBearerAuthHeader(providerLabel: string, token: string): string {
  const normalized = ensureHttpHeaderValue(providerLabel, 'API Key', token).replace(/^Bearer\s+/i, '').trim();
  if (!normalized) {
    throw new AiProviderError(`${providerLabel} 缺少 API Key`, 'config', providerLabel);
  }
  return `Bearer ${normalized}`;
}