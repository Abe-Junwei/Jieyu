/**
 * 层约束服务国际化文案 | Layer constraint service i18n messages
 */
import type { Locale } from './index';

export type LayerConstraintServiceMessages = {
  // 校验问题 | Validation issues
  issueConstraintUnsupported: (layerKey: string, constraint: string) => string;
  issueRootTranscriptionIndependentOnly: string;
  issueMissingParentLayerId: (layerKey: string, constraint: string) => string;
  issueParentNotFound: (layerKey: string, parentLayerId: string) => string;
  issueParentMustBeIndependentTranscription: (layerKey: string) => string;
  issueParentCycle: (layerKey: string) => string;

  // 修复消息 | Repair messages
  repairRootTranscription: (layerKey: string) => string;
  repairBindFallbackParent: (layerKey: string, parentKey: string) => string;
  repairDowngradeNoParent: (layerKey: string) => string;
  repairTimeSubdivisionToDependent: (layerKey: string) => string;
  repairTimeSubdivisionToIndependent: (layerKey: string) => string;
  repairConstraintToIndependent: (layerKey: string) => string;
  repairCycleToFallbackParent: (layerKey: string, parentKey: string) => string;
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
  issueMissingParentLayerId: (layerKey, constraint) => `层 ${layerKey} 使用 ${constraint} 但缺少 parentLayerId。`,
  issueParentNotFound: (layerKey, parentLayerId) => `层 ${layerKey} 的父层 ${parentLayerId} 不存在。`,
  issueParentMustBeIndependentTranscription: (layerKey) => `层 ${layerKey} 的父层必须是独立转写层。`,
  issueParentCycle: (layerKey) => `层 ${layerKey} 的父层引用存在循环。`,
  repairRootTranscription: (layerKey) => `已将首个转写层 ${layerKey} 的约束修复为独立边界。`,
  repairBindFallbackParent: (layerKey, parentKey) => `已为层 ${layerKey} 自动绑定父层 ${parentKey}。`,
  repairDowngradeNoParent: (layerKey) => `层 ${layerKey} 缺少可用父层，已降级为独立边界。`,
  repairTimeSubdivisionToDependent: (layerKey) => `层 ${layerKey} 的时间细分已降级为依赖边界。`,
  repairTimeSubdivisionToIndependent: (layerKey) => `层 ${layerKey} 的时间细分不可用，已降级为独立边界。`,
  repairConstraintToIndependent: (layerKey) => `层 ${layerKey} 的约束不可用，已降级为独立边界。`,
  repairCycleToFallbackParent: (layerKey, parentKey) => `层 ${layerKey} 的父层循环已修复为 ${parentKey}。`,
  repairCycleRemoved: (layerKey) => `层 ${layerKey} 的父层循环已移除并降级为独立边界。`,
  transcription: '转写',
  translation: '翻译',
  invalidTranslationConstraint: '翻译层不支持独立边界，请改用依赖边界并选择转写父层。',
  invalidTranslationConstraintShort: '翻译层仅支持依赖边界',
  timeSubdivisionUnavailable: '当前版本暂未启用"时间细分"编辑能力，请改用依赖边界或独立边界。',
  constraintUnavailable: '当前模式暂不可用，请选择其他边界约束。',
  timeSubdivisionUnavailableShort: '时间细分暂不可用',
  constraintUnavailableShort: '该约束当前不可用',
  rootTranscriptionIndependentOnlyShort: '首个转写层仅支持独立边界',
  chooseDependentBoundary: '存在多个独立转写层，请先选择要依赖的边界层。',
  chooseDependentBoundaryShort: '请选择依赖层',
  chooseValidDependentBoundary: '请选择有效的独立转写层作为依赖边界。',
  chooseValidDependentBoundaryShort: '请选择有效依赖层',
  constraintNeedsParent: '该边界约束需要先选择有效父层。',
  constraintNeedsParentShort: '该约束需父层',
  needTranscriptionFirst: '请先创建转写层，翻译层依赖转写层。',
  needTranscriptionFirstShort: '需先有转写层',
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
  issueMissingParentLayerId: (layerKey, constraint) => `Layer ${layerKey} uses ${constraint} but is missing parentLayerId.`,
  issueParentNotFound: (layerKey, parentLayerId) => `Parent layer ${parentLayerId} of layer ${layerKey} does not exist.`,
  issueParentMustBeIndependentTranscription: (layerKey) => `Parent layer of ${layerKey} must be an independent transcription layer.`,
  issueParentCycle: (layerKey) => `Parent reference of layer ${layerKey} contains a cycle.`,
  repairRootTranscription: (layerKey) => `Repaired first transcription layer ${layerKey} constraint to independent boundary.`,
  repairBindFallbackParent: (layerKey, parentKey) => `Auto-bound layer ${layerKey} to parent ${parentKey}.`,
  repairDowngradeNoParent: (layerKey) => `Layer ${layerKey} has no available parent, downgraded to independent boundary.`,
  repairTimeSubdivisionToDependent: (layerKey) => `Time subdivision of layer ${layerKey} downgraded to dependent boundary.`,
  repairTimeSubdivisionToIndependent: (layerKey) => `Time subdivision of layer ${layerKey} unavailable, downgraded to independent boundary.`,
  repairConstraintToIndependent: (layerKey) => `Constraint of layer ${layerKey} unavailable, downgraded to independent boundary.`,
  repairCycleToFallbackParent: (layerKey, parentKey) => `Parent cycle of layer ${layerKey} repaired to ${parentKey}.`,
  repairCycleRemoved: (layerKey) => `Parent cycle of layer ${layerKey} removed, downgraded to independent boundary.`,
  transcription: 'Transcription',
  translation: 'Translation',
  invalidTranslationConstraint: 'Translation layers do not support independent boundary. Please use dependent boundary and select a transcription parent.',
  invalidTranslationConstraintShort: 'Translation layers only support dependent boundary',
  timeSubdivisionUnavailable: 'Time subdivision editing is not yet enabled. Please use dependent or independent boundary.',
  constraintUnavailable: 'This mode is currently unavailable. Please choose another boundary constraint.',
  timeSubdivisionUnavailableShort: 'Time subdivision unavailable',
  constraintUnavailableShort: 'This constraint is currently unavailable',
  rootTranscriptionIndependentOnlyShort: 'First transcription layer only supports independent boundary',
  chooseDependentBoundary: 'Multiple independent transcription layers exist. Please select one to depend on.',
  chooseDependentBoundaryShort: 'Select dependent layer',
  chooseValidDependentBoundary: 'Please select a valid independent transcription layer as the dependent boundary.',
  chooseValidDependentBoundaryShort: 'Select a valid dependent layer',
  constraintNeedsParent: 'This boundary constraint requires selecting a valid parent layer first.',
  constraintNeedsParentShort: 'This constraint requires a parent layer',
  needTranscriptionFirst: 'Please create a transcription layer first. Translation layers depend on transcription layers.',
  needTranscriptionFirstShort: 'Transcription layer required first',
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
