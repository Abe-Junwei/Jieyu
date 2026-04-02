import type { Locale } from './index';

export type DevErrorAggregationPanelMessages = {
  summary: (count: number) => string;
  recoverable: string;
  fatal: string;
  entryLabel: (category: string, action: string, i18nKey: string | null, severity: string) => string;
};

const zhCN: DevErrorAggregationPanelMessages = {
  summary: (count) => `\u9519\u8bef\u805a\u5408\uff08${count}\uff09`,
  recoverable: '\u53ef\u6062\u590d',
  fatal: '\u81f4\u547d',
  entryLabel: (category, action, i18nKey, severity) => {
    const i18nPart = i18nKey ? ` \u00b7 i18n\u952e: ${i18nKey}` : '';
    return `${category} · ${action}${i18nPart} · ${severity}`;
  },
};

const enUS: DevErrorAggregationPanelMessages = {
  summary: (count) => `Error Aggregation (${count})`,
  recoverable: 'recoverable',
  fatal: 'fatal',
  entryLabel: (category, action, i18nKey, severity) => {
    const i18nPart = i18nKey ? ` · i18nKey: ${i18nKey}` : '';
    return `${category} · ${action}${i18nPart} · ${severity}`;
  },
};

export function getDevErrorAggregationPanelMessages(locale: Locale): DevErrorAggregationPanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
