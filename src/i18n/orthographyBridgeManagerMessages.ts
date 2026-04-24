import { normalizeLocale, type Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';

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
  deleteConfirm: string;
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

type OrthographyBridgeManagerCatalog = Omit<OrthographyBridgeManagerMessages, 'sampleCaseFailureCount'> & {
  sampleCaseFailureCount: string;
};

export function getOrthographyBridgeManagerMessages(locale: Locale): OrthographyBridgeManagerMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const { sampleCaseFailureCount, ...rest } = readMessageCatalog<OrthographyBridgeManagerCatalog>(normalizedLocale, 'msg.orthoBridge.catalog');
  return {
    ...rest,
    sampleCaseFailureCount: (count) => formatCatalogTemplate(sampleCaseFailureCount, { count }),
  };
}