import { normalizeLocale, t, tf, type Locale } from './index';

export type DevErrorAggregationPanelMessages = {
  summary: (count: number) => string;
  recoverable: string;
  fatal: string;
  entryLabel: (category: string, action: string, i18nKey: string | null, severity: string) => string;
};

export function getDevErrorAggregationPanelMessages(locale: Locale): DevErrorAggregationPanelMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    summary: (count) => tf(normalizedLocale, 'dev.errorAggregation.summary', { count }),
    recoverable: t(normalizedLocale, 'dev.errorAggregation.recoverable'),
    fatal: t(normalizedLocale, 'dev.errorAggregation.fatal'),
    entryLabel: (category, action, i18nKey, severity) => {
      const i18nPart = i18nKey
        ? tf(normalizedLocale, 'dev.errorAggregation.entryI18nPart', { i18nKey })
        : '';
      return tf(normalizedLocale, 'dev.errorAggregation.entryLabel', {
        category,
        action,
        i18nPart,
        severity,
      });
    },
  };
}
