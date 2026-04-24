import { normalizeLocale, type Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';
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

type OrthographyBuilderCatalog = Omit<OrthographyBuilderMessages, 'fontCoverageSample'> & {
  fontCoverageSample: string;
};

export function getOrthographyBuilderMessages(locale: Locale): OrthographyBuilderMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const { fontCoverageSample, ...rest } = readMessageCatalog<OrthographyBuilderCatalog>(normalizedLocale, 'msg.orthoBuilder.catalog');
  return {
    ...rest,
    fontCoverageSample: (count) => formatCatalogTemplate(fontCoverageSample, { count }),
  };
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
