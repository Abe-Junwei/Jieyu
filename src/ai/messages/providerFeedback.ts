import type { Locale } from '../../i18n';

function isZhLocale(locale: Locale | undefined): boolean {
  return locale !== 'en-US';
}

export function formatConnectionProbeNoContentError(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u8fde\u63a5\u6d4b\u8bd5\u672a\u6536\u5230\u6709\u6548\u54cd\u5e94\u5185\u5bb9'
    : 'Connection test did not receive valid response content';
}

export function formatConnectionProbeSuccessMessage(
  providerLabel: string,
  showTesting: boolean,
  locale?: Locale,
): string {
  if (isZhLocale(locale)) {
    return showTesting
      ? `${providerLabel} \u8fde\u63a5\u6210\u529f`
      : `${providerLabel} \u8fde\u63a5\u6b63\u5e38`;
  }
  return showTesting
    ? `${providerLabel} connection succeeded`
    : `${providerLabel} connection is healthy`;
}

export function formatConnectionHealthyMessage(providerLabel: string, locale?: Locale): string {
  return isZhLocale(locale)
    ? `${providerLabel} \u8fde\u63a5\u6b63\u5e38`
    : `${providerLabel} connection is healthy`;
}

export function formatEmptyModelResponseError(locale?: Locale): string {
  return isZhLocale(locale)
    ? '\u6a21\u578b\u8fd4\u56de\u7a7a\u54cd\u5e94'
    : 'Model returned an empty response';
}
