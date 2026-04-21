/**
 * 层约束服务国际化文案 | Layer constraint service i18n messages
 */
import type { Locale } from './index';

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

const zhCN: LayerConstraintServiceMessages = {
  issueConstraintUnsupported: (layerKey, constraint) => `层 ${layerKey} 使用了当前运行时未启用的约束：${constraint}`,
  issueRootTranscriptionIndependentOnly: '首个转写层必须使用独立边界。',
  issueMissingParentLayerId: (layerKey, constraint) => `层 ${layerKey} 使用 ${constraint} 但缺少转写层树父（用于层树挂靠）。`,
  issueMissingTranslationHostLink: (layerKey, constraint) => `层 ${layerKey}（译文）使用 ${constraint} 但缺少指向宿主转写的 layer_links。`,
  issueParentNotFound: (layerKey, parentLayerId) => `层 ${layerKey} 所指向的层树父转写 ${parentLayerId} 不存在。`,
  issueParentMustBeIndependentTranscription: (layerKey) => `层 ${layerKey} 所依赖的转写层须为独立边界转写层。`,
  issueParentCycle: (layerKey) => `层 ${layerKey} 的层树父引用存在循环。`,
  repairRootTranscription: (layerKey) => `已将首个转写层 ${layerKey} 的约束修复为独立边界。`,
  repairBindFallbackParent: (layerKey, parentKey) => `已为转写层 ${layerKey} 自动绑定层树父 ${parentKey}。`,
  repairTranslationHostLinkHint: (layerKey, hostTranscriptionKey) => `译文层 ${layerKey} 建议通过 layer_links 关联到宿主转写层 ${hostTranscriptionKey}（当前未写入链接）。`,
  repairDowngradeNoParent: (layerKey) => `层 ${layerKey} 找不到可用的独立转写层作为树父或宿主参照，已降级为独立边界。`,
  repairTimeSubdivisionToDependent: (layerKey) => `层 ${layerKey} 的时间细分已降级为依赖边界。`,
  repairTimeSubdivisionToIndependent: (layerKey) => `层 ${layerKey} 的时间细分不可用，已降级为独立边界。`,
  repairConstraintToIndependent: (layerKey) => `层 ${layerKey} 的约束不可用，已降级为独立边界。`,
  repairCycleToFallbackParent: (layerKey, parentKey) => `层 ${layerKey} 的层树父循环已修复为挂靠 ${parentKey}。`,
  repairCycleClearedTranslationTreeParent: (layerKey) => `层 ${layerKey} 已存在译文宿主链接，已清除多余的树父字段以消除循环。`,
  repairCycleRemoved: (layerKey) => `层 ${layerKey} 的层树父循环已消除，并降级为独立边界。`,
  transcription: '转写',
  translation: '翻译',
  invalidTranslationConstraint: '翻译层不支持独立边界；请改用依赖边界，并在宿主链接（layer_links）中绑定宿主转写层。',
  invalidTranslationConstraintShort: '译文需依赖边界与 layer_links',
  timeSubdivisionUnavailable: '当前版本暂未启用"时间细分"编辑能力，请改用依赖边界或独立边界。',
  constraintUnavailable: '当前模式暂不可用，请选择其他边界约束。',
  timeSubdivisionUnavailableShort: '时间细分暂不可用',
  constraintUnavailableShort: '该约束当前不可用',
  rootTranscriptionIndependentOnlyShort: '首个转写层仅支持独立边界',
  chooseDependentBoundary: '存在多个独立边界转写层，请先为译文选择宿主转写（将写入 layer_links）。',
  chooseDependentBoundaryShort: '请选择宿主转写',
  chooseValidDependentBoundary: '请选择有效的独立边界转写层作为译文宿主。',
  chooseValidDependentBoundaryShort: '请选择有效宿主转写',
  constraintNeedsParent: '该边界约束需要先指定宿主转写层（或建立 layer_links）。',
  constraintNeedsParentShort: '需宿主转写',
  needTranscriptionFirst: '请先创建转写层；译文层需通过 layer_links 绑定宿主转写。',
  needTranscriptionFirstShort: '需先有转写与宿主链接',
  crossTypeLanguageConflict: (opposite, same) => `该语言已存在${opposite}层，禁止与${same}层同语言。`,
  crossTypeLanguageConflictShort: (opposite) => `与${opposite}层语言冲突`,
  sameTypeAliasRequired: (same) => `该语言已存在${same}层，请提供别名以区分。`,
  sameTypeAliasRequiredShort: (same) => `同语言${same}层已存在，需填别名`,
  softLimitWarning: (count, label, limit) => `当前已有 ${count} 个${label}层（建议上限 ${limit}），继续创建可能影响性能。`,
  deleteTargetNotFound: '未找到要删除的层。',
};

const enUS: LayerConstraintServiceMessages = {
  issueConstraintUnsupported: (layerKey, constraint) => `Layer ${layerKey} uses constraint "${constraint}" which is not enabled in current runtime.`,
  issueRootTranscriptionIndependentOnly: 'The first transcription layer must use independent boundary.',
  issueMissingParentLayerId: (layerKey, constraint) => `Layer ${layerKey} uses ${constraint} but has no transcription tree parent id for the layer tree.`,
  issueMissingTranslationHostLink: (layerKey, constraint) => `Layer ${layerKey} (translation) uses ${constraint} but has no layer_links to a host transcription layer.`,
  issueParentNotFound: (layerKey, parentLayerId) => `Transcription tree parent ${parentLayerId} referenced by ${layerKey} does not exist.`,
  issueParentMustBeIndependentTranscription: (layerKey) => `Layer ${layerKey} must depend on an independent-boundary transcription layer.`,
  issueParentCycle: (layerKey) => `Layer ${layerKey} has a cycle in tree-parent references.`,
  repairRootTranscription: (layerKey) => `Repaired first transcription layer ${layerKey} constraint to independent boundary.`,
  repairBindFallbackParent: (layerKey, parentKey) => `Rebound transcription layer ${layerKey} tree parent to ${parentKey}.`,
  repairTranslationHostLinkHint: (layerKey, hostTranscriptionKey) => `Translation layer ${layerKey}: add layer_links to host transcription ${hostTranscriptionKey} (no persisted host link yet).`,
  repairDowngradeNoParent: (layerKey) => `Layer ${layerKey} has no independent transcription to use as tree parent or host reference; downgraded to independent boundary.`,
  repairTimeSubdivisionToDependent: (layerKey) => `Time subdivision of layer ${layerKey} downgraded to dependent boundary.`,
  repairTimeSubdivisionToIndependent: (layerKey) => `Time subdivision of layer ${layerKey} unavailable, downgraded to independent boundary.`,
  repairConstraintToIndependent: (layerKey) => `Constraint of layer ${layerKey} unavailable, downgraded to independent boundary.`,
  repairCycleToFallbackParent: (layerKey, parentKey) => `Tree-parent cycle on layer ${layerKey} repaired to ${parentKey}.`,
  repairCycleClearedTranslationTreeParent: (layerKey) => `Layer ${layerKey} has translation host links; cleared stale tree-parent field to break a cycle.`,
  repairCycleRemoved: (layerKey) => `Tree-parent cycle on layer ${layerKey} removed; downgraded to independent boundary.`,
  transcription: 'Transcription',
  translation: 'Translation',
  invalidTranslationConstraint: 'Translation layers cannot use independent boundary. Switch to a dependent constraint and bind host transcription layer(s) via layer_links.',
  invalidTranslationConstraintShort: 'Translations need dependent boundary + layer_links',
  timeSubdivisionUnavailable: 'Time subdivision editing is not yet enabled. Please use dependent or independent boundary.',
  constraintUnavailable: 'This mode is currently unavailable. Please choose another boundary constraint.',
  timeSubdivisionUnavailableShort: 'Time subdivision unavailable',
  constraintUnavailableShort: 'This constraint is currently unavailable',
  rootTranscriptionIndependentOnlyShort: 'First transcription layer only supports independent boundary',
  chooseDependentBoundary: 'Multiple independent-boundary transcription layers exist. Pick a host transcription for the translation (stored as layer_links).',
  chooseDependentBoundaryShort: 'Select host transcription',
  chooseValidDependentBoundary: 'Please select a valid independent-boundary transcription layer as the translation host.',
  chooseValidDependentBoundaryShort: 'Select a valid host transcription',
  constraintNeedsParent: 'This boundary constraint requires a host transcription layer first (or layer_links).',
  constraintNeedsParentShort: 'Host transcription required',
  needTranscriptionFirst: 'Create a transcription layer first; translation layers must bind to a host transcription via layer_links.',
  needTranscriptionFirstShort: 'Transcription + host links required first',
  crossTypeLanguageConflict: (opposite, same) => `This language already has a ${opposite} layer. Cannot create ${same} layer with same language.`,
  crossTypeLanguageConflictShort: (opposite) => `Conflicts with ${opposite} layer language`,
  sameTypeAliasRequired: (same) => `This language already has a ${same} layer. Please provide an alias to distinguish.`,
  sameTypeAliasRequiredShort: (same) => `Same-language ${same} layer exists, alias required`,
  softLimitWarning: (count, label, limit) => `Currently ${count} ${label} layers (recommended max ${limit}). Creating more may affect performance.`,
  deleteTargetNotFound: 'Target layer to delete not found.',
};

export function getLayerConstraintServiceMessages(locale: Locale): LayerConstraintServiceMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
