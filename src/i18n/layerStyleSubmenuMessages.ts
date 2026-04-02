import type { Locale } from './index';

export type LayerStyleSubmenuMessages = {
  defaultFontSizeOption: (value: number) => string;
  fontCoverage: string;
  fontCoverageSamples: (count: number) => string;
  fontCoverageMissing: string;
  findFonts: string;
  searchAllLocalFonts: string;
  searchCurrentLanguageFonts: string;
  showAllLocalFonts: string;
  showAllEnabledMeta: (count: number) => string;
  showAllFilteredMeta: (count: number) => string;
  results: string;
  noMatchingLocalFonts: string;
  noAvailableLocalFonts: string;
  noLanguageMatchedFonts: string;
  localFontsDenied: string;
  loadLocalFonts: string;
  loading: string;
  localFontsIcon: string;
  fontMenu: string;
  fontSizeMenu: string;
  bold: string;
  italic: string;
  resetStyle: string;
};

const zhCN: LayerStyleSubmenuMessages = {
  defaultFontSizeOption: (value) => `\u9ed8\u8ba4\uff08${value}\u53f7\uff09`,
  fontCoverage: '\u5b57\u4f53\u8986\u76d6',
  fontCoverageSamples: (count) => `\u6837\u4f8b ${count} \u9879`,
  fontCoverageMissing: '\u672a\u914d\u7f6e\u6837\u4f8b',
  findFonts: '\u67e5\u627e\u5b57\u4f53',
  searchAllLocalFonts: '\u8f93\u5165\u5b57\u4f53\u540d\uff0c\u67e5\u627e\u5168\u90e8\u672c\u5730\u5b57\u4f53',
  searchCurrentLanguageFonts: '\u8f93\u5165\u5b57\u4f53\u540d\uff0c\u67e5\u627e\u5f53\u524d\u8bed\u8a00\u5b57\u4f53',
  showAllLocalFonts: '\u663e\u793a\u6240\u6709\u672c\u5730\u5b57\u4f53',
  showAllEnabledMeta: (count) => `\u5df2\u5f00 \u00b7 \u5168\u90e8 ${count}`,
  showAllFilteredMeta: (count) => `\u9002\u914d ${count}`,
  results: '\u7ed3\u679c',
  noMatchingLocalFonts: '\u672a\u627e\u5230\u5339\u914d\u7684\u672c\u5730\u5b57\u4f53',
  noAvailableLocalFonts: '\u672a\u53d1\u73b0\u53ef\u7528\u672c\u5730\u5b57\u4f53',
  noLanguageMatchedFonts: '\u5f53\u524d\u5c42\u8bed\u8a00\u65e0\u5339\u914d\u672c\u5730\u5b57\u4f53',
  localFontsDenied: '\u672c\u5730\u5b57\u4f53\uff08\u6743\u9650\u88ab\u62d2\uff09',
  loadLocalFonts: '\u52a0\u8f7d\u672c\u5730\u5b57\u4f53\u2026',
  loading: '\u52a0\u8f7d\u4e2d\u2026',
  localFontsIcon: '\u672c',
  fontMenu: '\u5b57\u4f53',
  fontSizeMenu: '\u5b57\u53f7',
  bold: '\u7c97\u4f53',
  italic: '\u659c\u4f53',
  resetStyle: '\u91cd\u7f6e\u6837\u5f0f',
};

const enUS: LayerStyleSubmenuMessages = {
  defaultFontSizeOption: (value) => `Default (${value}px)`,
  fontCoverage: 'Font coverage',
  fontCoverageSamples: (count) => `Samples ${count}`,
  fontCoverageMissing: 'No samples configured',
  findFonts: 'Find fonts',
  searchAllLocalFonts: 'Type a font name to search all local fonts',
  searchCurrentLanguageFonts: 'Type a font name to search fonts for the current language',
  showAllLocalFonts: 'Show all local fonts',
  showAllEnabledMeta: (count) => `On · All ${count}`,
  showAllFilteredMeta: (count) => `Matched ${count}`,
  results: 'Results',
  noMatchingLocalFonts: 'No matching local fonts found',
  noAvailableLocalFonts: 'No local fonts available',
  noLanguageMatchedFonts: 'No local fonts match this layer language',
  localFontsDenied: 'Local fonts (permission denied)',
  loadLocalFonts: 'Load local fonts…',
  loading: 'Loading…',
  localFontsIcon: 'F',
  fontMenu: 'Fonts',
  fontSizeMenu: 'Font Size',
  bold: 'Bold',
  italic: 'Italic',
  resetStyle: 'Reset Style',
};

export function getLayerStyleSubmenuMessages(locale: Locale): LayerStyleSubmenuMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
