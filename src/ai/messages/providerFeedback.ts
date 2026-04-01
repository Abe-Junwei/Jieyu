export function formatConnectionProbeNoContentError(): string {
  return '\u8fde\u63a5\u6d4b\u8bd5\u672a\u6536\u5230\u6709\u6548\u54cd\u5e94\u5185\u5bb9';
}

export function formatConnectionProbeSuccessMessage(providerLabel: string, showTesting: boolean): string {
  return showTesting ? `${providerLabel} \u8fde\u63a5\u6210\u529f` : `${providerLabel} \u8fde\u63a5\u6b63\u5e38`;
}

export function formatConnectionHealthyMessage(providerLabel: string): string {
  return `${providerLabel} \u8fde\u63a5\u6b63\u5e38`;
}

export function formatEmptyModelResponseError(): string {
  return '\u6a21\u578b\u8fd4\u56de\u7a7a\u54cd\u5e94';
}
