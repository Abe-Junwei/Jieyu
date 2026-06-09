import { t, type DictKey, type Locale } from '../../i18n';
import type { ToolWriteGateReasonCode } from '../runtime/toolWriteGate';

const WRITE_GATE_DICT_KEY: Record<
  Exclude<ToolWriteGateReasonCode, 'gate_disabled' | 'readonly_allowed' | 'write_preview_allowed'>,
  DictKey
> = {
  context_unavailable: 'ai.toolWriteGate.contextUnavailable',
  scope_target_unresolved: 'ai.toolWriteGate.scopeTargetUnresolved',
  destructive_denied: 'ai.toolWriteGate.destructiveDenied',
};

export const WRITE_GATE_ERROR_PREFIX = 'write_gate:';

export function toToolWriteGateErrorToken(reasonCode: ToolWriteGateReasonCode): string {
  return `${WRITE_GATE_ERROR_PREFIX}${reasonCode}`;
}

export function formatToolWriteGateUserMessage(
  locale: Locale,
  reasonCode: ToolWriteGateReasonCode,
): string {
  const key = WRITE_GATE_DICT_KEY[reasonCode as keyof typeof WRITE_GATE_DICT_KEY];
  if (key) {
    return t(locale, key);
  }
  return t(locale, 'ai.toolWriteGate.genericBlocked');
}

export function formatToolWriteGateUserError(
  locale: string | undefined,
  errorToken: string,
): string {
  if (!errorToken.startsWith(WRITE_GATE_ERROR_PREFIX)) {
    return errorToken;
  }
  const reasonCode = errorToken.slice(WRITE_GATE_ERROR_PREFIX.length) as ToolWriteGateReasonCode;
  const normalizedLocale: Locale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  return formatToolWriteGateUserMessage(normalizedLocale, reasonCode);
}
