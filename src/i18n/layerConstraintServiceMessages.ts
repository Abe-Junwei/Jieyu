/**
 * 层约束服务国际化文案 | Layer constraint service i18n messages
 */
import { normalizeLocale, type Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';

export type LayerConstraintServiceMessages = {
  // 校验问题 | Validation issues
  issueConstraintUnsupported: (layerKey: string, constraint: string) => string;
  issueRootTranscriptionIndependentOnly: string;
  issueMissingParentLayerId: (layerKey: string, constraint: string) => string;
  issueMissingTranslationHostLink: (layerKey: string, constraint: string) => string;
  issueParentNotFound: (layerKey: string, parentLayerId: string) => string;
  issueParentMustBeIndependentTranscription: (layerKey: string) => string;
  issueParentCycle: (layerKey: string) => string;

  // 修复消息 | Repair messages
  repairRootTranscription: (layerKey: string) => string;
  repairBindFallbackParent: (layerKey: string, parentKey: string) => string;
  repairTranslationHostLinkHint: (layerKey: string, hostTranscriptionKey: string) => string;
  repairDowngradeNoParent: (layerKey: string) => string;
  repairTimeSubdivisionToDependent: (layerKey: string) => string;
  repairTimeSubdivisionToIndependent: (layerKey: string) => string;
  repairConstraintToIndependent: (layerKey: string) => string;
  repairCycleToFallbackParent: (layerKey: string, parentKey: string) => string;
  repairCycleClearedTranslationTreeParent: (layerKey: string) => string;
  repairCycleRemoved: (layerKey: string) => string;

  // 层类型标签 | Layer type labels
  transcription: string;
  translation: string;

  // 创建守卫 | Create guard messages
  invalidTranslationConstraint: string;
  invalidTranslationConstraintShort: string;
  timeSubdivisionUnavailable: string;
  constraintUnavailable: string;
  timeSubdivisionUnavailableShort: string;
  constraintUnavailableShort: string;
  rootTranscriptionIndependentOnlyShort: string;
  chooseDependentBoundary: string;
  chooseDependentBoundaryShort: string;
  chooseValidDependentBoundary: string;
  chooseValidDependentBoundaryShort: string;
  constraintNeedsParent: string;
  constraintNeedsParentShort: string;
  needTranscriptionFirst: string;
  needTranscriptionFirstShort: string;
  crossTypeLanguageConflict: (opposite: string, same: string) => string;
  crossTypeLanguageConflictShort: (opposite: string) => string;
  sameTypeAliasRequired: (same: string) => string;
  sameTypeAliasRequiredShort: (same: string) => string;
  softLimitWarning: (count: number, label: string, limit: number) => string;
  deleteTargetNotFound: string;
};

type LayerConstraintServiceCatalog = Omit<
  LayerConstraintServiceMessages,
  | 'issueConstraintUnsupported'
  | 'issueMissingParentLayerId'
  | 'issueMissingTranslationHostLink'
  | 'issueParentNotFound'
  | 'issueParentMustBeIndependentTranscription'
  | 'issueParentCycle'
  | 'repairRootTranscription'
  | 'repairBindFallbackParent'
  | 'repairTranslationHostLinkHint'
  | 'repairDowngradeNoParent'
  | 'repairTimeSubdivisionToDependent'
  | 'repairTimeSubdivisionToIndependent'
  | 'repairConstraintToIndependent'
  | 'repairCycleToFallbackParent'
  | 'repairCycleClearedTranslationTreeParent'
  | 'repairCycleRemoved'
  | 'crossTypeLanguageConflict'
  | 'crossTypeLanguageConflictShort'
  | 'sameTypeAliasRequired'
  | 'sameTypeAliasRequiredShort'
  | 'softLimitWarning'
> & {
  issueConstraintUnsupported: string;
  issueMissingParentLayerId: string;
  issueMissingTranslationHostLink: string;
  issueParentNotFound: string;
  issueParentMustBeIndependentTranscription: string;
  issueParentCycle: string;
  repairRootTranscription: string;
  repairBindFallbackParent: string;
  repairTranslationHostLinkHint: string;
  repairDowngradeNoParent: string;
  repairTimeSubdivisionToDependent: string;
  repairTimeSubdivisionToIndependent: string;
  repairConstraintToIndependent: string;
  repairCycleToFallbackParent: string;
  repairCycleClearedTranslationTreeParent: string;
  repairCycleRemoved: string;
  crossTypeLanguageConflict: string;
  crossTypeLanguageConflictShort: string;
  sameTypeAliasRequired: string;
  sameTypeAliasRequiredShort: string;
  softLimitWarning: string;
};

export function getLayerConstraintServiceMessages(locale: Locale): LayerConstraintServiceMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const {
    issueConstraintUnsupported,
    issueMissingParentLayerId,
    issueMissingTranslationHostLink,
    issueParentNotFound,
    issueParentMustBeIndependentTranscription,
    issueParentCycle,
    repairRootTranscription,
    repairBindFallbackParent,
    repairTranslationHostLinkHint,
    repairDowngradeNoParent,
    repairTimeSubdivisionToDependent,
    repairTimeSubdivisionToIndependent,
    repairConstraintToIndependent,
    repairCycleToFallbackParent,
    repairCycleClearedTranslationTreeParent,
    repairCycleRemoved,
    crossTypeLanguageConflict,
    crossTypeLanguageConflictShort,
    sameTypeAliasRequired,
    sameTypeAliasRequiredShort,
    softLimitWarning,
    ...rest
  } = readMessageCatalog<LayerConstraintServiceCatalog>(normalizedLocale, 'msg.layerConstraint.catalog');
  return {
    ...rest,
    issueConstraintUnsupported: (layerKey, constraint) => formatCatalogTemplate(issueConstraintUnsupported, { layerKey, constraint }),
    issueMissingParentLayerId: (layerKey, constraint) => formatCatalogTemplate(issueMissingParentLayerId, { layerKey, constraint }),
    issueMissingTranslationHostLink: (layerKey, constraint) => formatCatalogTemplate(issueMissingTranslationHostLink, { layerKey, constraint }),
    issueParentNotFound: (layerKey, parentLayerId) => formatCatalogTemplate(issueParentNotFound, { layerKey, parentLayerId }),
    issueParentMustBeIndependentTranscription: (layerKey) => formatCatalogTemplate(issueParentMustBeIndependentTranscription, { layerKey }),
    issueParentCycle: (layerKey) => formatCatalogTemplate(issueParentCycle, { layerKey }),
    repairRootTranscription: (layerKey) => formatCatalogTemplate(repairRootTranscription, { layerKey }),
    repairBindFallbackParent: (layerKey, parentKey) => formatCatalogTemplate(repairBindFallbackParent, { layerKey, parentKey }),
    repairTranslationHostLinkHint: (layerKey, hostTranscriptionKey) => formatCatalogTemplate(repairTranslationHostLinkHint, { layerKey, hostTranscriptionKey }),
    repairDowngradeNoParent: (layerKey) => formatCatalogTemplate(repairDowngradeNoParent, { layerKey }),
    repairTimeSubdivisionToDependent: (layerKey) => formatCatalogTemplate(repairTimeSubdivisionToDependent, { layerKey }),
    repairTimeSubdivisionToIndependent: (layerKey) => formatCatalogTemplate(repairTimeSubdivisionToIndependent, { layerKey }),
    repairConstraintToIndependent: (layerKey) => formatCatalogTemplate(repairConstraintToIndependent, { layerKey }),
    repairCycleToFallbackParent: (layerKey, parentKey) => formatCatalogTemplate(repairCycleToFallbackParent, { layerKey, parentKey }),
    repairCycleClearedTranslationTreeParent: (layerKey) => formatCatalogTemplate(repairCycleClearedTranslationTreeParent, { layerKey }),
    repairCycleRemoved: (layerKey) => formatCatalogTemplate(repairCycleRemoved, { layerKey }),
    crossTypeLanguageConflict: (opposite, same) => formatCatalogTemplate(crossTypeLanguageConflict, { opposite, same }),
    crossTypeLanguageConflictShort: (opposite) => formatCatalogTemplate(crossTypeLanguageConflictShort, { opposite }),
    sameTypeAliasRequired: (same) => formatCatalogTemplate(sameTypeAliasRequired, { same }),
    sameTypeAliasRequiredShort: (same) => formatCatalogTemplate(sameTypeAliasRequiredShort, { same }),
    softLimitWarning: (count, label, limit) => formatCatalogTemplate(softLimitWarning, { count, label, limit }),
  };
}
