import { normalizeLocale, type Locale } from './index';

export type SearchReplaceOverlayMessages = {
  searchPlaceholder: string;
  noResults: string;
  previousTitle: string;
  nextTitle: string;
  toggleReplaceTitle: string;
  closeTitle: string;
  scopeTitle: string;
  scopeCurrentLayer: string;
  scopeCurrentUnit: string;
  scopeGlobal: string;
  layerKindTitle: string;
  layerKindAll: string;
  layerKindTranscription: string;
  layerKindTranslation: string;
  layerKindGloss: string;
  caseSensitive: string;
  wholeWord: string;
  regexMode: string;
  replacePlaceholder: string;
  replaceCurrentTitle: string;
  replaceCurrent: string;
  previewAllReplaceTitle: string;
  preview: string;
  replacePlanTitle: (count: number) => string;
  originalText: string;
  replacedText: string;
  cancelPreviewTitle: string;
  cancel: string;
  confirmReplaceAllTitle: string;
  confirmReplace: string;
  clippedEllipsis: string;
};

const zhCN: SearchReplaceOverlayMessages = {
  searchPlaceholder: '\u641c\u7d22\u2026',
  noResults: '\u65e0\u7ed3\u679c',
  previousTitle: '\u4e0a\u4e00\u4e2a (Shift+Enter)',
  nextTitle: '\u4e0b\u4e00\u4e2a (Enter)',
  toggleReplaceTitle: '\u66ff\u6362',
  closeTitle: '\u5173\u95ed (Esc)',
  scopeTitle: '\u641c\u7d22\u8303\u56f4',
  scopeCurrentLayer: '\u5f53\u524d\u5c42',
  scopeCurrentUnit: '\u5f53\u524d\u53e5\u6bb5',
  scopeGlobal: '\u5168\u5c40',
  layerKindTitle: '\u641c\u7d22\u5185\u5bb9\u7c7b\u578b',
  layerKindAll: '\u5168\u90e8\u5185\u5bb9',
  layerKindTranscription: '\u4ec5\u8f6c\u5199',
  layerKindTranslation: '\u4ec5\u7ffb\u8bd1',
  layerKindGloss: '\u4ec5 gloss',
  caseSensitive: '\u533a\u5206\u5927\u5c0f\u5199',
  wholeWord: '\u5168\u8bcd\u5339\u914d',
  regexMode: '\u6b63\u5219',
  replacePlaceholder: '\u66ff\u6362\u4e3a\u2026',
  replaceCurrentTitle: '\u66ff\u6362\u5f53\u524d',
  replaceCurrent: '\u66ff\u6362',
  previewAllReplaceTitle: '\u9884\u89c8\u5168\u90e8\u66ff\u6362',
  preview: '\u9884\u89c8',
  replacePlanTitle: (count) => `\u5c06\u66ff\u6362 ${count} \u6761\u8bb0\u5f55`,
  originalText: '\u539f\u6587',
  replacedText: '\u65b0\u6587',
  cancelPreviewTitle: '\u53d6\u6d88\u9884\u89c8',
  cancel: '\u53d6\u6d88',
  confirmReplaceAllTitle: '\u786e\u8ba4\u5168\u90e8\u66ff\u6362',
  confirmReplace: '\u786e\u8ba4\u66ff\u6362',
  clippedEllipsis: '\u2026',
};

const enUS: SearchReplaceOverlayMessages = {
  searchPlaceholder: 'Search\u2026',
  noResults: 'No results',
  previousTitle: 'Previous (Shift+Enter)',
  nextTitle: 'Next (Enter)',
  toggleReplaceTitle: 'Replace',
  closeTitle: 'Close (Esc)',
  scopeTitle: 'Search scope',
  scopeCurrentLayer: 'Current layer',
  scopeCurrentUnit: 'Current segment',
  scopeGlobal: 'Global',
  layerKindTitle: 'Content type',
  layerKindAll: 'All content',
  layerKindTranscription: 'Transcription only',
  layerKindTranslation: 'Translation only',
  layerKindGloss: 'Gloss only',
  caseSensitive: 'Case sensitive',
  wholeWord: 'Whole word',
  regexMode: 'Regex',
  replacePlaceholder: 'Replace with\u2026',
  replaceCurrentTitle: 'Replace current',
  replaceCurrent: 'Replace',
  previewAllReplaceTitle: 'Preview all replacements',
  preview: 'Preview',
  replacePlanTitle: (count) => `Will replace ${count} record(s)`,
  originalText: 'Original',
  replacedText: 'Updated',
  cancelPreviewTitle: 'Cancel preview',
  cancel: 'Cancel',
  confirmReplaceAllTitle: 'Confirm replace all',
  confirmReplace: 'Confirm Replace',
  clippedEllipsis: '\u2026',
};

export function getSearchReplaceOverlayMessages(locale: Locale): SearchReplaceOverlayMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
