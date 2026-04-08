import type { Locale } from './index';
import type { OrthographyCatalogGroupKey } from '../hooks/useOrthographyPicker';

export type OrthographyBuilderMessages = {
  panelTitle: string;
  contextTitle: string;
  workspaceNote: string;
  createModeSectionTitle: string;
  sourceSectionTitle: string;
  sourceSectionCopyDescription: string;
  identitySectionTitle: string;
  renderSectionTitle: string;
  bridgeSectionTitle: string;
  localizedNamesSectionTitle: string;
  examplesSectionTitle: string;
  advancedSectionTitle: string;
  bridgeSectionDescription: string;
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
  sourceLanguageAssetIdLabel: string;
  sourceLanguageAssetIdPlaceholder: string;
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
  bridgeEnabledLabel: string;
  bridgeEngineLabel: string;
  bridgeEngineTableMap: string;
  bridgeEngineIcuRule: string;
  bridgeEngineManual: string;
  bridgeInputPreviewLabel: string;
  bridgeInputPreviewPlaceholder: string;
  bridgeReversibleLabel: string;
  bridgeRuleTextLabel: string;
  bridgeRuleTextPlaceholder: string;
  bridgeRuleTextPlaceholderTableMap: string;
  bridgeRuleTextPlaceholderIcuRule: string;
  bridgeRuleTextPlaceholderManual: string;
  bridgeRuleSyntaxTitle: string;
  bridgeRuleSyntaxTableMap: string;
  bridgeRuleSyntaxIcuRule: string;
  bridgeRuleSyntaxManual: string;
  bridgeSampleCaseLabel: string;
  bridgeSampleCaseDescription: string;
  bridgeSampleCasePlaceholder: string;
  bridgeValidationTitle: string;
  bridgePreviewOutputTitle: string;
  bridgeSampleResultTitle: string;
  expandBridgeChecks: string;
  collapseBridgeChecks: string;
  sampleStatusFail: string;
  sampleStatusPass: string;
  sampleStatusPreview: string;
  sampleExpected: string;
  cancelCreate: string;
  creating: string;
  confirmRiskAndCreate: string;
  createAndSelect: string;
  orthographyGroupUser: string;
  orthographyGroupReviewedPrimary: string;
  orthographyGroupReviewedSecondary: string;
  orthographyGroupHistorical: string;
  orthographyGroupNeedsReview: string;
  orthographyGroupExperimental: string;
  orthographyGroupLegacy: string;
  orthographyGroupOther: string;
};

const zhCN: OrthographyBuilderMessages = {
  panelTitle: '\u6b63\u5b57\u6cd5\u6784\u5efa\u5668',
  contextTitle: '\u5f53\u524d\u521b\u5efa\u573a\u666f',
  workspaceNote: '\u5de5\u4f5c\u533a\u5185\u90e8\u4f7f\u7528\uff1a\u6b64\u6b63\u5b57\u6cd5\u4ec5\u5728\u5f53\u524d\u9879\u76ee\u4e2d\u53ef\u89c1\u3002',
  createModeSectionTitle: '\u521b\u5efa\u6a21\u5f0f',
  sourceSectionTitle: '\u6765\u6e90',
  sourceSectionCopyDescription: '\u590d\u5236\u5f53\u524d\u6a21\u5f0f\u4e0b\u53ea\u9700\u9009\u4e00\u4e2a\u6765\u6e90\u6b63\u5b57\u6cd5\uff0c\u5b8c\u6574\u5dee\u5f02\u7ef4\u62a4\u7559\u7ed9\u5de5\u4f5c\u53f0\u3002',
  identitySectionTitle: '\u547d\u540d',
  renderSectionTitle: '\u6e32\u67d3\u8bbe\u7f6e',
  bridgeSectionTitle: '\u6865\u63a5\u8bbe\u7f6e',
  localizedNamesSectionTitle: '\u9644\u52a0\u8bed\u8a00\u6807\u7b7e',
  examplesSectionTitle: '\u5b57\u8868\u793a\u4f8b',
  advancedSectionTitle: '\u9ad8\u7ea7\u8bbe\u7f6e',
  bridgeSectionDescription: '\u53ea\u6709\u5f53\u4f60\u5e0c\u671b\u65b0\u65b9\u6848\u521b\u5efa\u540e\u7acb\u5373\u53ef\u4ece\u6765\u6e90\u65b9\u6848\u63a8\u5bfc\u65f6\uff0c\u624d\u5728\u8fd9\u91cc\u8865\u4e00\u6761\u8d77\u6b65\u6865\u63a5\u3002\u5b8c\u6574\u6865\u63a5\u8bbe\u8ba1\u4e0e\u540e\u7eed\u7ef4\u62a4\u8bf7\u53bb\u5de5\u4f5c\u53f0\u3002',
  sourceLanguagePlaceholder: '\u8bf7\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCodePlaceholder: '\u4f8b\uff1aeng',
  nameZhPlaceholder: '\u4f8b\uff1a\u82d7\u6587 IPA',
  nameEnPlaceholder: 'e.g. IPA for Miao',
  systemDefaultFontKey: '\u7cfb\u7edf\u9ed8\u8ba4',
  createModeLabel: '\u521b\u5efa\u65b9\u5f0f',
  createModeIpa: '\u4ece IPA \u521b\u5efa',
  createModeCopyCurrent: '\u590d\u5236\u5f53\u524d\u6b63\u5b57\u6cd5',
  createModeDeriveOther: '\u4ece\u5176\u4ed6\u8bed\u8a00\u884d\u751f',
  sourceLanguageLabel: '\u6765\u6e90\u8bed\u8a00',
  sourceLanguageCompactPlaceholder: '\u9009\u62e9\u6765\u6e90\u8bed\u8a00\u2026',
  sourceLanguageCustom: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165\u4e09\u5b57\u6bcd\u8bed\u8a00\u4ee3\u7801\uff09',
  sourceLanguageAssetIdLabel: '\u6765\u6e90\u8bed\u8a00 ID\uff08\u7cfb\u7edf\u552f\u4e00\u6807\u8bc6\uff09',
  sourceLanguageAssetIdPlaceholder: '\u7559\u7a7a\u5219\u81ea\u52a8\u751f\u6210',
  sourceLanguageCodeLabel: '\u6765\u6e90\u8bed\u8a00\u4ee3\u7801',
  sourceOrthographyLabel: '\u6765\u6e90\u6b63\u5b57\u6cd5',
  sourceOrthographyHint: '\u5f53\u524d\u6a21\u5f0f\u4e0b\u6682\u65e0\u53ef\u590d\u5236\u7684\u6765\u6e90\u6b63\u5b57\u6cd5\uff0c\u8bf7\u5148\u5207\u6362\u6765\u6e90\u8bed\u8a00\u6216\u6539\u7528\u56fd\u9645\u97f3\u6807\u6a21\u5f0f\u521b\u5efa\u3002',
  nameZhLabel: '\u672c\u65cf\u8bed\u540d\u79f0',
  nameZhCompactPlaceholder: '\u6b63\u5b57\u6cd5\u672c\u65cf\u8bed\u540d\u79f0\uff08\u53ef\u9009\uff09',
  nameEnLabel: '\u82f1\u6587\u540d\u79f0',
  nameEnCompactPlaceholder: '\u6b63\u5b57\u6cd5\u82f1\u6587\u56de\u9000\u540d\uff08\u53ef\u9009\uff09',
  abbreviationLabel: '\u7f29\u5199',
  abbreviationPlaceholder: '\u4f8b\uff1aIPA',
  scriptTagLabel: '\u6587\u5b57\u6807\u7b7e',
  scriptTagPlaceholder: '\u4f8b\uff1aLatn',
  typeLabel: '\u7c7b\u578b',
  typePhonemic: '\u97f3\u4f4d (phonemic)',
  typePhonetic: '\u8bed\u97f3 (phonetic)',
  typePractical: '\u5b9e\u7528 (practical)',
  typeHistorical: '\u5386\u53f2 (historical)',
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
  collapseAdvanced: '\u25be \u6536\u8d77\u9ad8\u7ea7\u5b57\u6bb5',
  expandAdvanced: '\u25b8 \u9ad8\u7ea7\u8bbe\u7f6e\uff08locale / region / bidi \u2026\uff09',
  advancedLocaleLabel: '\u8bed\u8a00\u533a\u57df',
  advancedRegionLabel: '\u5730\u533a\u6807\u7b7e',
  advancedVariantLabel: '\u53d8\u4f53\u6807\u8bb0',
  advancedDirectionLabel: '\u6587\u672c\u65b9\u5411',
  advancedDirectionLtr: '\u4ece\u5de6\u5230\u53f3',
  advancedDirectionRtl: '\u4ece\u53f3\u5230\u5de6',
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
  bridgeEnabledLabel: '\u521b\u5efa\u65f6\u987a\u624b\u5e26\u4e0a\u4e00\u6761\u8d77\u6b65\u6865\u63a5',
  bridgeEngineLabel: '\u6865\u63a5\u5f15\u64ce',
  bridgeEngineTableMap: '\u8868\u683c\u6620\u5c04',
  bridgeEngineIcuRule: 'ICU \u89c4\u5219',
  bridgeEngineManual: '\u624b\u5de5\u89c4\u5219',
  bridgeInputPreviewLabel: '\u6865\u63a5\u9884\u89c8\u8f93\u5165',
  bridgeInputPreviewPlaceholder: '\u8f93\u5165\u4e00\u6bb5\u6837\u4f8b\u6587\u672c\u9884\u89c8\u6865\u63a5\u7ed3\u679c',
  bridgeReversibleLabel: '\u6807\u8bb0\u4e3a\u53ef\u9006\u6865\u63a5',
  bridgeRuleTextLabel: '\u6865\u63a5\u89c4\u5219\u6587\u672c',
  bridgeRuleTextPlaceholder: '\u6bcf\u884c\u4e00\u6761\u6620\u5c04\uff0c\u5982 aa -> a',
  bridgeRuleTextPlaceholderTableMap: '\u6bcf\u884c\u4e00\u6761\u6620\u5c04\uff0c\u5982 aa => a',
  bridgeRuleTextPlaceholderIcuRule: '\u652f\u6301 ::NFC \u6216 /regex/flags => replacement\uff0c\u6309\u884c\u987a\u5e8f\u6267\u884c',
  bridgeRuleTextPlaceholderManual: '\u624b\u5de5\u89c4\u5219\u4e0d\u4f1a\u81ea\u52a8\u6267\u884c\uff0c\u53ef\u7559\u7a7a\u6216\u8bb0\u5f55\u4eba\u5de5\u6865\u63a5\u8bf4\u660e',
  bridgeRuleSyntaxTitle: '\u6865\u63a5\u8bed\u6cd5\u63d0\u793a',
  bridgeRuleSyntaxTableMap: '\u8868\u683c\u6620\u5c04\u6309\u6700\u957f\u5339\u914d\u6267\u884c\uff0c\u9002\u5408\u5b57\u7b26\u6216\u5b57\u7b26\u4e32\u6865\u63a5\u66ff\u6362\uff0c\u4f8b\u5982 aa => a \u6216 sh => s\u3002',
  bridgeRuleSyntaxIcuRule: 'ICU \u89c4\u5219\u6309\u884c\u94fe\u5f0f\u6267\u884c\uff0c\u652f\u6301 ::NFC/::NFD/::NFKC/::NFKD \u89c4\u8303\u5316\u6307\u4ee4\uff0c\u4ee5\u53ca /regex/flags => replacement \u6b63\u5219\u6865\u63a5\u66ff\u6362\u3002',
  bridgeRuleSyntaxManual: '\u624b\u5de5\u89c4\u5219\u4e0d\u81ea\u52a8\u6865\u63a5\u6587\u672c\uff0c\u9002\u5408\u9700\u8981\u4eba\u5de5\u5ba1\u6838\u6216\u5916\u90e8\u6d41\u7a0b\u7684\u6d3e\u751f\u6b63\u5b57\u6cd5\u3002',
  bridgeSampleCaseLabel: '\u6865\u63a5\u6837\u4f8b',
  bridgeSampleCaseDescription: '\u53ef\u9009\u3002\u53ea\u6709\u60f3\u5728\u521b\u5efa\u524d\u518d\u770b\u51e0\u6761\u6837\u4f8b\u65f6\u624d\u586b\u5199\u3002',
  bridgeSampleCasePlaceholder: '\u6bcf\u884c\u4e00\u6761\u6837\u4f8b\uff0c\u683c\u5f0f\u5982 shaa => saa',
  bridgeValidationTitle: '\u6865\u63a5\u89c4\u5219\u6821\u9a8c',
  bridgePreviewOutputTitle: '\u6865\u63a5\u9884\u89c8\u8f93\u51fa',
  bridgeSampleResultTitle: '\u6865\u63a5\u6837\u4f8b\u7ed3\u679c',
  expandBridgeChecks: '\u6dfb\u52a0\u521b\u5efa\u524d\u81ea\u68c0\u6837\u4f8b',
  collapseBridgeChecks: '\u6536\u8d77\u521b\u5efa\u524d\u81ea\u68c0\u6837\u4f8b',
  sampleStatusFail: '\u672a\u901a\u8fc7',
  sampleStatusPass: '\u901a\u8fc7',
  sampleStatusPreview: '\u9884\u89c8',
  sampleExpected: '\u671f\u671b\uff1a',
  cancelCreate: '\u53d6\u6d88\u65b0\u5efa',
  creating: '\u521b\u5efa\u4e2d...',
  confirmRiskAndCreate: '\u786e\u8ba4\u98ce\u9669\u5e76\u521b\u5efa',
  createAndSelect: '\u521b\u5efa\u5e76\u9009\u4e2d',
  orthographyGroupUser: '\u81ea\u5efa\u6b63\u5b57\u6cd5',
  orthographyGroupReviewedPrimary: '\u5df2\u5ba1\u6821\u4e3b\u9879',
  orthographyGroupReviewedSecondary: '\u5df2\u5ba1\u6821\u6b21\u7ea7\u9879',
  orthographyGroupHistorical: '\u5386\u53f2\u6216\u4f20\u7edf\u9879',
  orthographyGroupNeedsReview: '\u5f85\u5ba1\u6838\u5185\u7f6e\u9879',
  orthographyGroupExperimental: '\u5b9e\u9a8c\u9879',
  orthographyGroupLegacy: '\u65e7\u7248\u517c\u5bb9\u9879',
  orthographyGroupOther: '\u5176\u4ed6\u9879',
};

const enUS: OrthographyBuilderMessages = {
  panelTitle: 'Orthography Builder',
  contextTitle: 'Current creation context',
  workspaceNote: 'Workspace-only: this orthography is visible only in the current project.',
  createModeSectionTitle: 'Create mode',
  sourceSectionTitle: 'Source',
  sourceSectionCopyDescription: 'Copy-current only needs a source orthography. Long-term differences should be maintained in the workspace.',
  identitySectionTitle: 'Naming',
  renderSectionTitle: 'Rendering',
  bridgeSectionTitle: 'Bridge',
  localizedNamesSectionTitle: 'Additional language labels',
  examplesSectionTitle: 'Exemplar sets',
  advancedSectionTitle: 'Advanced settings',
  bridgeSectionDescription: 'Only add a starter bridge here when the new orthography should be immediately derivable from the source. Full bridge design and ongoing maintenance stay in the workspace.',

  sourceLanguagePlaceholder: 'Select source language\u2026',
  sourceLanguageCodePlaceholder: 'e.g. eng',
  nameZhPlaceholder: 'e.g. Miao IPA',
  nameEnPlaceholder: 'e.g. IPA for Miao',
  systemDefaultFontKey: '\u7cfb\u7edf\u9ed8\u8ba4',
  createModeLabel: 'Create mode',
  createModeIpa: 'Create from IPA',
  createModeCopyCurrent: 'Copy current orthography',
  createModeDeriveOther: 'Derive from another language',
  sourceLanguageLabel: 'Source language',
  sourceLanguageCompactPlaceholder: 'Select source language\u2026',
  sourceLanguageCustom: 'Other (manual ISO 639-3 code input)',
  sourceLanguageAssetIdLabel: 'Source language ID (unique identifier)',
  sourceLanguageAssetIdPlaceholder: 'Auto-generated if left empty',
  sourceLanguageCodeLabel: 'Source language code',
  sourceOrthographyLabel: 'Source orthography',
  sourceOrthographyHint: 'No source orthography can be copied in this mode. Switch source language or use IPA mode.',
  nameZhLabel: 'Autonym',
  nameZhCompactPlaceholder: 'Orthography autonym (optional)',
  nameEnLabel: 'English name',
  nameEnCompactPlaceholder: 'Orthography English fallback name (optional)',
  abbreviationLabel: 'Abbreviation',
  abbreviationPlaceholder: 'e.g. IPA',
  scriptTagLabel: 'Writing system',
  scriptTagPlaceholder: 'e.g. Latn',
  typeLabel: 'Type',
  typePhonemic: 'Phonemic (phonemic)',
  typePhonetic: 'Phonetic (phonetic)',
  typePractical: 'Practical (practical)',
  typeHistorical: 'Historical (historical)',
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
  collapseAdvanced: '▾ Collapse advanced fields',
  expandAdvanced: '▸ Advanced (locale / region / bidi …)',
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
  bridgeEnabledLabel: 'Bring along one starter bridge during creation',
  bridgeEngineLabel: 'Bridge engine',
  bridgeEngineTableMap: 'Table Map',
  bridgeEngineIcuRule: 'ICU Rule',
  bridgeEngineManual: 'Manual',
  bridgeInputPreviewLabel: 'Bridge preview input',
  bridgeInputPreviewPlaceholder: 'Type sample text to preview the bridge output',
  bridgeReversibleLabel: 'Mark as reversible bridge',
  bridgeRuleTextLabel: 'Bridge rule text',
  bridgeRuleTextPlaceholder: 'One mapping per line, e.g. aa -> a',
  bridgeRuleTextPlaceholderTableMap: 'One mapping per line, e.g. aa => a',
  bridgeRuleTextPlaceholderIcuRule: 'Supports ::NFC and /regex/flags => replacement, executed line by line',
  bridgeRuleTextPlaceholderManual: 'Manual rules are not auto-executed; leave notes here if human review is required for the bridge path',
  bridgeRuleSyntaxTitle: 'Bridge syntax hint',
  bridgeRuleSyntaxTableMap: 'Table-map uses longest-match replacement and fits direct character or string bridge mappings such as aa => a and sh => s.',
  bridgeRuleSyntaxIcuRule: 'ICU-rule runs as an ordered rule chain. It supports ::NFC/::NFD/::NFKC/::NFKD directives and /regex/flags => replacement bridge rules.',
  bridgeRuleSyntaxManual: 'Manual rules do not bridge text automatically. Use them for workflows that require human confirmation or external processing.',
  bridgeSampleCaseLabel: 'Bridge samples',
  bridgeSampleCaseDescription: 'Optional. Fill this only when you want a few extra checks before creation.',
  bridgeSampleCasePlaceholder: 'One sample per line, e.g. shaa => saa',
  bridgeValidationTitle: 'Bridge rule validation',
  bridgePreviewOutputTitle: 'Bridge preview output',
  bridgeSampleResultTitle: 'Bridge sample results',
  expandBridgeChecks: 'Add pre-create sample checks',
  collapseBridgeChecks: 'Hide pre-create sample checks',
  sampleStatusFail: 'Fail',
  sampleStatusPass: 'Pass',
  sampleStatusPreview: 'Preview',
  sampleExpected: 'Expected: ',
  cancelCreate: 'Cancel',
  creating: 'Creating...',
  confirmRiskAndCreate: 'Confirm risk and create',
  createAndSelect: 'Create and select',
  orthographyGroupUser: 'User-created',
  orthographyGroupReviewedPrimary: 'Reviewed primary',
  orthographyGroupReviewedSecondary: 'Reviewed secondary',
  orthographyGroupHistorical: 'Historical',
  orthographyGroupNeedsReview: 'Needs review',
  orthographyGroupExperimental: 'Experimental',
  orthographyGroupLegacy: 'Legacy compatibility',
  orthographyGroupOther: 'Other',
};

export function getOrthographyBuilderMessages(locale: Locale): OrthographyBuilderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}

export function getOrthographyBridgeRulePlaceholder(
  messages: OrthographyBuilderMessages,
  engine: 'table-map' | 'icu-rule' | 'manual',
): string {
  switch (engine) {
    case 'icu-rule':
      return messages.bridgeRuleTextPlaceholderIcuRule;
    case 'manual':
      return messages.bridgeRuleTextPlaceholderManual;
    default:
      return messages.bridgeRuleTextPlaceholderTableMap;
  }
}

export function getOrthographyBridgeSyntaxHint(
  messages: OrthographyBuilderMessages,
  engine: 'table-map' | 'icu-rule' | 'manual',
): string {
  switch (engine) {
    case 'icu-rule':
      return messages.bridgeRuleSyntaxIcuRule;
    case 'manual':
      return messages.bridgeRuleSyntaxManual;
    default:
      return messages.bridgeRuleSyntaxTableMap;
  }
}

export function getOrthographyCatalogGroupLabel(locale: Locale, groupKey: OrthographyCatalogGroupKey): string {
  const messages = getOrthographyBuilderMessages(locale);
  switch (groupKey) {
    case 'user':
      return messages.orthographyGroupUser;
    case 'reviewed-primary':
      return messages.orthographyGroupReviewedPrimary;
    case 'reviewed-secondary':
      return messages.orthographyGroupReviewedSecondary;
    case 'historical':
      return messages.orthographyGroupHistorical;
    case 'needs-review':
      return messages.orthographyGroupNeedsReview;
    case 'experimental':
      return messages.orthographyGroupExperimental;
    case 'legacy':
      return messages.orthographyGroupLegacy;
    default:
      return messages.orthographyGroupOther;
  }
}
