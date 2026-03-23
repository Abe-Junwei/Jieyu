export function formatConnectionProbeNoContentError(): string {
  return '连接测试未收到有效响应内容';
}

export function formatConnectionProbeSuccessMessage(providerLabel: string, showTesting: boolean): string {
  return showTesting ? `${providerLabel} 连接成功` : `${providerLabel} 连接正常`;
}

export function formatConnectionHealthyMessage(providerLabel: string): string {
  return `${providerLabel} 连接正常`;
}

export function formatEmptyModelResponseError(): string {
  return '模型返回空响应';
}