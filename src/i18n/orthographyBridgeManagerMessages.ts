import type { Locale } from './index';

export type OrthographyBridgeManagerMessages = {
  toggleOpen: string;
  toggleClose: string;
  createRule: string;
  targetOrthographyLabel: string;
  selectedOrthographyLabel: string;
  loadingRules: string;
  emptyHint: string;
  sourceLanguageLabel: string;
  sourceLanguagePlaceholder: string;
  sourceLanguageCustom: string;
  sourceLanguageAssetIdLabel: string;
  sourceLanguageAssetIdPlaceholder: string;
  sourceLanguageCodeLabel: string;
  sourceLanguageCodePlaceholder: string;
  sourceOrthographyLabel: string;
  sourceOrthographyPlaceholder: string;
  ruleNameZhLabel: string;
  ruleNameZhPlaceholder: string;
  ruleNameEnLabel: string;
  ruleNameEnPlaceholder: string;
  statusLabel: string;
  statusDraft: string;
  statusActive: string;
  statusDeprecated: string;
  reversibleShort: string;
  samplePrefix: string;
  setDraft: string;
  setActive: string;
  edit: string;
  deleteRule: string;
  saveRule: string;
  savingRule: string;
  cancelEdit: string;
  errorLoad: string;
  errorMissingSource: string;
  errorSameOrthography: string;
  errorValidation: string;
  sampleCaseFailureCount: (count: number) => string;
  errorSave: string;
  errorToggle: string;
  errorDelete: string;
};

const zhCN: OrthographyBridgeManagerMessages = {
  toggleOpen: '\u7ba1\u7406\u5199\u5165\u6865\u63a5\u89c4\u5219',
  toggleClose: '\u6536\u8d77\u5199\u5165\u6865\u63a5\u89c4\u5219',
  createRule: '\u65b0\u5efa\u89c4\u5219',
  targetOrthographyLabel: '\u76ee\u6807\u6b63\u5b57\u6cd5',
  selectedOrthographyLabel: '\u5f53\u524d\u9009\u62e9',
  loadingRules: '\u6b63\u5728\u52a0\u8f7d\u6865\u63a5\u89c4\u5219\u2026',
  emptyHint: '\u5f53\u524d\u6b63\u5b57\u6cd5\u5c1a\u672a\u914d\u7f6e\u5165\u7ad9\u6865\u63a5\u89c4\u5219\uff0c\u5bfc\u5165\u6216\u81ea\u52a8\u5199\u5165\u65f6\u4f1a\u4fdd\u7559\u539f\u6587\u672c\u3002',
  sourceLanguageLabel: '\u6765\u6e90\u8bed\u8a00',
  sourceLanguagePlaceholder: '\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCustom: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165 ISO 639-3 \u4ee3\u7801\uff09',
  sourceLanguageAssetIdLabel: '\u6765\u6e90\u8bed\u8a00\u8d44\u4ea7 ID',
  sourceLanguageAssetIdPlaceholder: '\u4f8b\uff1auser:demo-language',
  sourceLanguageCodeLabel: '\u6765\u6e90\u8bed\u8a00\u4ee3\u7801',
  sourceLanguageCodePlaceholder: '\u4f8b\uff1aeng',
  sourceOrthographyLabel: '\u6765\u6e90\u6b63\u5b57\u6cd5',
  sourceOrthographyPlaceholder: '\u9009\u62e9\u6765\u6e90\u6b63\u5b57\u6cd5\u2026',
  ruleNameZhLabel: '\u89c4\u5219\u672c\u5730\u540d\u79f0',
  ruleNameZhPlaceholder: '\u4f8b\uff1a\u5bfc\u5165\u6620\u5c04',
  ruleNameEnLabel: '\u89c4\u5219\u82f1\u6587\u56de\u9000\u540d',
  ruleNameEnPlaceholder: 'e.g. Import mapping',
  statusLabel: '\u72b6\u6001',
  statusDraft: '\u8349\u7a3f',
  statusActive: '\u542f\u7528',
  statusDeprecated: '\u5f03\u7528',
  reversibleShort: '\u53ef\u9006',
  samplePrefix: '\u6837\u4f8b\uff1a',
  setDraft: '\u8bbe\u4e3a\u8349\u7a3f',
  setActive: '\u8bbe\u4e3a\u542f\u7528',
  edit: '\u7f16\u8f91',
  deleteRule: '\u5220\u9664\u89c4\u5219',
  saveRule: '\u4fdd\u5b58\u89c4\u5219',
  savingRule: '\u4fdd\u5b58\u4e2d...',
  cancelEdit: '\u53d6\u6d88\u7f16\u8f91',
  errorLoad: '\u6865\u63a5\u89c4\u5219\u52a0\u8f7d\u5931\u8d25',
  errorMissingSource: '\u8bf7\u5148\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u4e0e\u6765\u6e90\u6b63\u5b57\u6cd5',
  errorSameOrthography: '\u6765\u6e90\u4e0e\u76ee\u6807\u6b63\u5b57\u6cd5\u4e0d\u80fd\u76f8\u540c',
  errorValidation: '\u6865\u63a5\u89c4\u5219\u6821\u9a8c\u5931\u8d25',
  sampleCaseFailureCount: (count) => `\u6837\u4f8b\u7528\u4f8b\u6821\u9a8c\u5931\u8d25\uff0c\u5171 ${count} \u6761\u672a\u901a\u8fc7\u3002`,
  errorSave: '\u6865\u63a5\u89c4\u5219\u4fdd\u5b58\u5931\u8d25',
  errorToggle: '\u6865\u63a5\u89c4\u5219\u72b6\u6001\u66f4\u65b0\u5931\u8d25',
  errorDelete: '\u6865\u63a5\u89c4\u5219\u5220\u9664\u5931\u8d25',
};

const enUS: OrthographyBridgeManagerMessages = {
  toggleOpen: 'Manage inbound bridge rules',
  toggleClose: 'Collapse inbound bridge rules',
  createRule: 'New rule',
  targetOrthographyLabel: 'Target orthography',
  selectedOrthographyLabel: 'Current selection',
  loadingRules: 'Loading bridge rules…',
  emptyHint: 'No inbound bridge rule is configured for this orthography yet. Imports and automated writes will keep the original text.',
  sourceLanguageLabel: 'Source language',
  sourceLanguagePlaceholder: 'Select source language…',
  sourceLanguageCustom: 'Other (manual ISO 639-3 code)',
  sourceLanguageAssetIdLabel: 'Source language asset ID',
  sourceLanguageAssetIdPlaceholder: 'e.g. user:demo-language',
  sourceLanguageCodeLabel: 'Source language code',
  sourceLanguageCodePlaceholder: 'e.g. eng',
  sourceOrthographyLabel: 'Source orthography',
  sourceOrthographyPlaceholder: 'Select source orthography…',
  ruleNameZhLabel: 'Rule native name',
  ruleNameZhPlaceholder: 'e.g. Import mapping',
  ruleNameEnLabel: 'Rule English fallback name',
  ruleNameEnPlaceholder: 'e.g. Import mapping',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusActive: 'Active',
  statusDeprecated: 'Deprecated',
  reversibleShort: 'Reversible',
  samplePrefix: 'Sample: ',
  setDraft: 'Set as draft',
  setActive: 'Set as active',
  edit: 'Edit',
  deleteRule: 'Delete rule',
  saveRule: 'Save rule',
  savingRule: 'Saving...',
  cancelEdit: 'Cancel editing',
  errorLoad: 'Failed to load bridge rules',
  errorMissingSource: 'Select a source language and source orthography first',
  errorSameOrthography: 'Source and target orthographies must differ',
  errorValidation: 'Bridge rule validation failed',
  sampleCaseFailureCount: (count) => `${count} sample cases failed validation.`,
  errorSave: 'Failed to save bridge rule',
  errorToggle: 'Failed to update bridge rule status',
  errorDelete: 'Failed to delete bridge rule',
};

export function getOrthographyBridgeManagerMessages(locale: Locale): OrthographyBridgeManagerMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}