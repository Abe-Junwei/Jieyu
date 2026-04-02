import type { Locale } from './index';

export type OrthographyBuilderMessages = {
  sourceLanguagePlaceholder: string;
  sourceLanguageCodePlaceholder: string;
  nameZhPlaceholder: string;
  nameEnPlaceholder: string;
  systemDefaultFontKey: string;
  createModeLabel: string;
  createModeIpa: string;
  createModeCopyCurrent: string;
  createModeDeriveOther: string;
  sourceLanguageLabel: string;
  sourceLanguageCompactPlaceholder: string;
  sourceLanguageCustom: string;
  sourceLanguageCodeLabel: string;
  sourceOrthographyLabel: string;
  sourceOrthographyHint: string;
  nameZhLabel: string;
  nameZhCompactPlaceholder: string;
  nameEnLabel: string;
  nameEnCompactPlaceholder: string;
  abbreviationLabel: string;
  abbreviationPlaceholder: string;
  scriptTagLabel: string;
  scriptTagPlaceholder: string;
  typeLabel: string;
  typePhonemic: string;
  typePhonetic: string;
  typePractical: string;
  typeHistorical: string;
  typeOther: string;
  renderPreviewTitle: string;
  scriptLabel: string;
  directionLabel: string;
  fontCoverageLabel: string;
  fontCoverageSample: (count: number) => string;
  fontCoverageMissingSample: string;
  finalFontStackLabel: string;
  defaultFontVerificationLabel: string;
  createRiskTitle: string;
  createRiskFirstConfirm: string;
  createRiskAlreadyConfirmed: string;
  confirmRiskButton: string;
  collapseAdvanced: string;
  expandAdvanced: string;
  advancedLocaleLabel: string;
  advancedRegionLabel: string;
  advancedVariantLabel: string;
  advancedDirectionLabel: string;
  advancedDirectionLtr: string;
  advancedDirectionRtl: string;
  localePlaceholder: string;
  regionPlaceholder: string;
  variantPlaceholder: string;
  exemplarLabel: string;
  exemplarPlaceholder: string;
  primaryFontLabel: string;
  primaryFontPlaceholder: string;
  fallbackFontLabel: string;
  fallbackFontPlaceholder: string;
  bidiIsolationLabel: string;
  preferDirLabel: string;
  transformEnabledLabel: string;
  transformEngineLabel: string;
  transformEngineTableMap: string;
  transformEngineIcuRule: string;
  transformEngineManual: string;
  transformInputPreviewLabel: string;
  transformInputPreviewPlaceholder: string;
  transformReversibleLabel: string;
  transformRuleTextLabel: string;
  transformRuleTextPlaceholder: string;
  transformSampleCaseLabel: string;
  transformSampleCasePlaceholder: string;
  transformValidationTitle: string;
  transformPreviewOutputTitle: string;
  transformSampleResultTitle: string;
  sampleStatusFail: string;
  sampleStatusPass: string;
  sampleStatusPreview: string;
  sampleExpected: string;
  cancelCreate: string;
  creating: string;
  confirmRiskAndCreate: string;
  createAndSelect: string;
};

const zhCN: OrthographyBuilderMessages = {
  sourceLanguagePlaceholder: '\u8bf7\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCodePlaceholder: '\u4f8b\uff1aeng',
  nameZhPlaceholder: '\u4f8b\uff1a\u82d7\u6587 IPA',
  nameEnPlaceholder: 'e.g. IPA for Miao',
  systemDefaultFontKey: '\u7cfb\u7edf\u9ed8\u8ba4',
  createModeLabel: '\u521b\u5efa\u65b9\u5f0f',
  createModeIpa: '\u57fa\u4e8e IPA \u521b\u5efa',
  createModeCopyCurrent: '\u590d\u5236\u5f53\u524d\u8bed\u8a00\u5df2\u6709\u6b63\u5b57\u6cd5',
  createModeDeriveOther: '\u4ece\u5176\u4ed6\u8bed\u8a00\u6b63\u5b57\u6cd5\u6d3e\u751f',
  sourceLanguageLabel: '\u6765\u6e90\u8bed\u8a00',
  sourceLanguageCompactPlaceholder: '\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCustom: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165 ISO 639-3 \u4ee3\u7801\uff09',
  sourceLanguageCodeLabel: '\u6765\u6e90\u8bed\u8a00\u4ee3\u7801',
  sourceOrthographyLabel: '\u6765\u6e90\u6b63\u5b57\u6cd5',
  sourceOrthographyHint: '\u5f53\u524d\u6a21\u5f0f\u4e0b\u6682\u65e0\u53ef\u590d\u5236\u7684\u6765\u6e90\u6b63\u5b57\u6cd5\uff0c\u8bf7\u5148\u5207\u6362\u6765\u6e90\u8bed\u8a00\u6216\u6539\u7528 IPA \u521b\u5efa\u3002',
  nameZhLabel: '\u540d\u79f0\uff08\u4e2d\u6587\uff09',
  nameZhCompactPlaceholder: '\u6b63\u5b57\u6cd5\u540d\u79f0\uff08\u4e2d\u6587\uff0c\u53ef\u9009\uff09',
  nameEnLabel: '\u540d\u79f0\uff08\u82f1\u6587\uff09',
  nameEnCompactPlaceholder: 'Orthography name (optional)',
  abbreviationLabel: '\u7f29\u5199',
  abbreviationPlaceholder: '\u4f8b\uff1aIPA',
  scriptTagLabel: 'Script \u6807\u7b7e',
  scriptTagPlaceholder: '\u4f8b\uff1aLatn',
  typeLabel: '\u7c7b\u578b',
  typePhonemic: '\u97f3\u4f4d\u5f0f',
  typePhonetic: '\u97f3\u6807\u5f0f',
  typePractical: '\u5b9e\u7528\u62fc\u5199',
  typeHistorical: '\u5386\u53f2\u62fc\u5199',
  typeOther: '\u5176\u4ed6',
  renderPreviewTitle: '\u6e32\u67d3\u9884\u89c8',
  scriptLabel: '\u811a\u672c\uff1a',
  directionLabel: '\u65b9\u5411\uff1a',
  fontCoverageLabel: '\u5b57\u4f53\u8986\u76d6\uff1a',
  fontCoverageSample: (count) => `\u6837\u4f8b ${count} \u9879`,
  fontCoverageMissingSample: '\u672a\u914d\u7f6e\u6837\u4f8b',
  finalFontStackLabel: '\u6700\u7ec8\u5b57\u4f53\u6808\uff1a',
  defaultFontVerificationLabel: '\u9ed8\u8ba4\u5b57\u4f53\u9a8c\u8bc1\uff1a',
  createRiskTitle: '\u521b\u5efa\u98ce\u9669\u63d0\u793a',
  createRiskFirstConfirm: '\u9996\u6b21\u70b9\u51fb\u521b\u5efa\u5c06\u8fdb\u5165\u786e\u8ba4\u72b6\u6001\uff0c\u518d\u6b21\u70b9\u51fb\u624d\u4f1a\u6309\u5f53\u524d\u914d\u7f6e\u521b\u5efa\u3002',
  createRiskAlreadyConfirmed: '\u5df2\u786e\u8ba4\u5f53\u524d\u98ce\u9669\uff0c\u518d\u6b21\u4fee\u6539\u811a\u672c\u3001\u5b57\u4f53\u6216\u53cc\u5411\u8bbe\u7f6e\u540e\u4f1a\u91cd\u65b0\u63d0\u793a\u3002',
  confirmRiskButton: '\u5148\u786e\u8ba4\u8fd9\u4e9b\u98ce\u9669',
  collapseAdvanced: '\u6536\u8d77\u9ad8\u7ea7\u5b57\u6bb5',
  expandAdvanced: '\u5c55\u5f00\u9ad8\u7ea7\u5b57\u6bb5',
  advancedLocaleLabel: '\u8bed\u8a00\u533a\u57df\uff08Locale\uff09',
  advancedRegionLabel: '\u5730\u533a\u6807\u7b7e\uff08Region\uff09',
  advancedVariantLabel: '\u53d8\u4f53\u6807\u8bb0\uff08Variant\uff09',
  advancedDirectionLabel: '\u6587\u672c\u65b9\u5411\uff08Direction\uff09',
  advancedDirectionLtr: '\u4ece\u5de6\u5230\u53f3\uff08LTR\uff09',
  advancedDirectionRtl: '\u4ece\u53f3\u5230\u5de6\uff08RTL\uff09',
  localePlaceholder: '\u4f8b\uff1azh-CN',
  regionPlaceholder: '\u4f8b\uff1aCN',
  variantPlaceholder: '\u4f8b\uff1afonipa',
  exemplarLabel: '\u793a\u4f8b\u5b57\u7b26',
  exemplarPlaceholder: '\u4ee5\u9017\u53f7\u5206\u9694\uff0c\u5982 a, b, c',
  primaryFontLabel: '\u9996\u9009\u5b57\u4f53',
  primaryFontPlaceholder: '\u4ee5\u9017\u53f7\u5206\u9694\uff0c\u5982 Noto Sans, Charis SIL',
  fallbackFontLabel: '\u56de\u9000\u5b57\u4f53',
  fallbackFontPlaceholder: '\u4ee5\u9017\u53f7\u5206\u9694\uff0c\u5982 Arial Unicode MS',
  bidiIsolationLabel: '\u884c\u5185\u53cc\u5411\u6587\u672c\u542f\u7528\u9694\u79bb',
  preferDirLabel: '\u6e32\u67d3\u65f6\u4f18\u5148\u5199\u5165 dir \u5c5e\u6027',
  transformEnabledLabel: '\u4e3a\u6d3e\u751f\u6b63\u5b57\u6cd5\u521b\u5efa\u53d8\u6362\u89c4\u5219',
  transformEngineLabel: '\u53d8\u6362\u5f15\u64ce',
  transformEngineTableMap: '\u8868\u6620\u5c04\uff08Table Map\uff09',
  transformEngineIcuRule: 'ICU \u89c4\u5219',
  transformEngineManual: '\u624b\u5de5\u89c4\u5219\uff08Manual\uff09',
  transformInputPreviewLabel: '\u9884\u89c8\u8f93\u5165',
  transformInputPreviewPlaceholder: '\u8f93\u5165\u4e00\u6bb5\u6837\u4f8b\u6587\u672c\u9884\u89c8\u8f6c\u6362\u7ed3\u679c',
  transformReversibleLabel: '\u6807\u8bb0\u4e3a\u53ef\u9006\u53d8\u6362',
  transformRuleTextLabel: '\u89c4\u5219\u6587\u672c',
  transformRuleTextPlaceholder: '\u6bcf\u884c\u4e00\u6761\u6620\u5c04\uff0c\u5982 aa -> a',
  transformSampleCaseLabel: '\u6837\u4f8b\u7528\u4f8b',
  transformSampleCasePlaceholder: '\u6bcf\u884c\u4e00\u6761\u6837\u4f8b\uff0c\u683c\u5f0f\u5982 shaa => saa',
  transformValidationTitle: '\u89c4\u5219\u6821\u9a8c',
  transformPreviewOutputTitle: '\u9884\u89c8\u8f93\u51fa',
  transformSampleResultTitle: '\u6837\u4f8b\u7ed3\u679c',
  sampleStatusFail: '\u672a\u901a\u8fc7',
  sampleStatusPass: '\u901a\u8fc7',
  sampleStatusPreview: '\u9884\u89c8',
  sampleExpected: '\u671f\u671b\uff1a',
  cancelCreate: '\u53d6\u6d88\u65b0\u5efa',
  creating: '\u521b\u5efa\u4e2d...',
  confirmRiskAndCreate: '\u786e\u8ba4\u98ce\u9669\u5e76\u521b\u5efa',
  createAndSelect: '\u521b\u5efa\u5e76\u9009\u4e2d',
};

const enUS: OrthographyBuilderMessages = {
  sourceLanguagePlaceholder: 'Select source language\u2026',
  sourceLanguageCodePlaceholder: 'e.g. eng',
  nameZhPlaceholder: 'e.g. Miao IPA',
  nameEnPlaceholder: 'e.g. IPA for Miao',
  systemDefaultFontKey: '\u7cfb\u7edf\u9ed8\u8ba4',
  createModeLabel: 'Create mode',
  createModeIpa: 'Create from IPA',
  createModeCopyCurrent: 'Copy existing orthography in current language',
  createModeDeriveOther: 'Derive from another language orthography',
  sourceLanguageLabel: 'Source language',
  sourceLanguageCompactPlaceholder: 'Select source language\u2026',
  sourceLanguageCustom: 'Other (manual ISO 639-3 code input)',
  sourceLanguageCodeLabel: 'Source language code',
  sourceOrthographyLabel: 'Source orthography',
  sourceOrthographyHint: 'No source orthography can be copied in this mode. Switch source language or use IPA mode.',
  nameZhLabel: 'Name (ZH)',
  nameZhCompactPlaceholder: 'Orthography name (ZH, optional)',
  nameEnLabel: 'Name (EN)',
  nameEnCompactPlaceholder: 'Orthography name (optional)',
  abbreviationLabel: 'Abbreviation',
  abbreviationPlaceholder: 'e.g. IPA',
  scriptTagLabel: 'Script tag',
  scriptTagPlaceholder: 'e.g. Latn',
  typeLabel: 'Type',
  typePhonemic: 'Phonemic',
  typePhonetic: 'Phonetic',
  typePractical: 'Practical',
  typeHistorical: 'Historical',
  typeOther: 'Other',
  renderPreviewTitle: 'Render preview',
  scriptLabel: 'Script: ',
  directionLabel: 'Direction: ',
  fontCoverageLabel: 'Font coverage: ',
  fontCoverageSample: (count) => `Samples ${count}`,
  fontCoverageMissingSample: 'No samples configured',
  finalFontStackLabel: 'Final font stack: ',
  defaultFontVerificationLabel: 'Default font verification: ',
  createRiskTitle: 'Creation risk warnings',
  createRiskFirstConfirm: 'First click enters confirmation state. Click again to create with current configuration.',
  createRiskAlreadyConfirmed: 'Risk has been acknowledged. Changing script/font/bidi settings will require confirmation again.',
  confirmRiskButton: 'Acknowledge risks first',
  collapseAdvanced: 'Collapse advanced fields',
  expandAdvanced: 'Expand advanced fields',
  advancedLocaleLabel: 'Locale',
  advancedRegionLabel: 'Region',
  advancedVariantLabel: 'Variant',
  advancedDirectionLabel: 'Direction',
  advancedDirectionLtr: 'Left-to-right (LTR)',
  advancedDirectionRtl: 'Right-to-left (RTL)',
  localePlaceholder: 'e.g. zh-CN',
  regionPlaceholder: 'e.g. CN',
  variantPlaceholder: 'e.g. fonipa',
  exemplarLabel: 'Exemplar characters',
  exemplarPlaceholder: 'Comma-separated, e.g. a, b, c',
  primaryFontLabel: 'Primary fonts',
  primaryFontPlaceholder: 'Comma-separated, e.g. Noto Sans, Charis SIL',
  fallbackFontLabel: 'Fallback fonts',
  fallbackFontPlaceholder: 'Comma-separated, e.g. Arial Unicode MS',
  bidiIsolationLabel: 'Enable isolation for inline bidirectional text',
  preferDirLabel: 'Prefer writing dir attribute during render',
  transformEnabledLabel: 'Create transform rules for derived orthography',
  transformEngineLabel: 'Transform engine',
  transformEngineTableMap: 'Table Map',
  transformEngineIcuRule: 'ICU Rule',
  transformEngineManual: 'Manual',
  transformInputPreviewLabel: 'Preview input',
  transformInputPreviewPlaceholder: 'Type sample text to preview transformation',
  transformReversibleLabel: 'Mark as reversible transform',
  transformRuleTextLabel: 'Rule text',
  transformRuleTextPlaceholder: 'One mapping per line, e.g. aa -> a',
  transformSampleCaseLabel: 'Sample cases',
  transformSampleCasePlaceholder: 'One sample per line, e.g. shaa => saa',
  transformValidationTitle: 'Rule validation',
  transformPreviewOutputTitle: 'Preview output',
  transformSampleResultTitle: 'Sample results',
  sampleStatusFail: 'Fail',
  sampleStatusPass: 'Pass',
  sampleStatusPreview: 'Preview',
  sampleExpected: 'Expected: ',
  cancelCreate: 'Cancel',
  creating: 'Creating...',
  confirmRiskAndCreate: 'Confirm risk and create',
  createAndSelect: 'Create and select',
};

export function getOrthographyBuilderMessages(locale: Locale): OrthographyBuilderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
