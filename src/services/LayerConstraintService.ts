/**
 * Layer constraint validation service (pure functions).
 *
 * Rules:
 * - Translation layers depend on transcription layers.
 * - Do not delete the last transcription layer when translations still depend on it.
 * - Soft-limit overflow emits warnings without blocking.
 */
import {
  LAYER_SOFT_LIMITS,
  type LayerDocType,
  type LayerLinkDocType,
} from '../db';

// Result types

export interface CanCreateResult {
  allowed: boolean;
  /** Blocking reason */
  reason?: string;
  /** Non-blocking warning */
  warning?: string;
}

export interface CanDeleteResult {
  allowed: boolean;
  reason?: string;
  /** Number of links that will be cleaned up */
  affectedLinkCount?: number;
  /** Translation layer IDs that would become orphaned */
  orphanedTranslationIds?: string[];
  /** Transcription layer key orphans will be re-linked to */
  relinkTargetKey?: string;
}

export type ExistingLayerConstraintIssueCode =
  | 'invalid-root-transcription-constraint'
  | 'missing-parent-layer'
  | 'parent-layer-not-found'
  | 'invalid-parent-layer-type'
  | 'constraint-runtime-not-supported'
  | 'parent-cycle-detected';

export interface ExistingLayerConstraintIssue {
  layerId: string;
  code: ExistingLayerConstraintIssueCode;
  message: string;
}

export interface ExistingLayerConstraintRepair {
  layerId: string;
  code: ExistingLayerConstraintIssueCode;
  message: string;
}

export type TranslationCreateBlockReason =
  | 'missing-transcription'
  | 'duplicate-same-type-without-alias'
  | 'cross-type-same-language'
  | 'invalid-constraint-for-root-transcription'
  | 'invalid-translation-constraint'
  | 'constraint-parent-required'
  | 'constraint-runtime-not-supported';

export interface ConstraintRuntimeCapabilities {
  symbolic_association: boolean;
  independent_boundary: boolean;
  time_subdivision: boolean;
}

const DEFAULT_CONSTRAINT_RUNTIME_CAPABILITIES: ConstraintRuntimeCapabilities = {
  symbolic_association: true,
  independent_boundary: true,
  time_subdivision: true,
};

const ZH = {
  issueConstraintUnsupported: (layerKey: string, constraint: string) => `\u5c42 ${layerKey} \u4f7f\u7528\u4e86\u5f53\u524d\u8fd0\u884c\u65f6\u672a\u542f\u7528\u7684\u7ea6\u675f\uff1a${constraint}`,
  issueRootTranscriptionIndependentOnly: '\u9996\u4e2a\u8f6c\u5199\u5c42\u5fc5\u987b\u4f7f\u7528\u72ec\u7acb\u8fb9\u754c\u3002',
  issueMissingParentLayerId: (layerKey: string, constraint: string) => `\u5c42 ${layerKey} \u4f7f\u7528 ${constraint} \u4f46\u7f3a\u5c11 parentLayerId\u3002`,
  issueParentNotFound: (layerKey: string, parentLayerId: string) => `\u5c42 ${layerKey} \u7684\u7236\u5c42 ${parentLayerId} \u4e0d\u5b58\u5728\u3002`,
  issueParentMustBeIndependentTranscription: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u7236\u5c42\u5fc5\u987b\u662f\u72ec\u7acb\u8f6c\u5199\u5c42\u3002`,
  issueParentCycle: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u7236\u5c42\u5f15\u7528\u5b58\u5728\u5faa\u73af\u3002`,
  repairRootTranscription: (layerKey: string) => `\u5df2\u5c06\u9996\u4e2a\u8f6c\u5199\u5c42 ${layerKey} \u7684\u7ea6\u675f\u4fee\u590d\u4e3a\u72ec\u7acb\u8fb9\u754c\u3002`,
  repairBindFallbackParent: (layerKey: string, parentKey: string) => `\u5df2\u4e3a\u5c42 ${layerKey} \u81ea\u52a8\u7ed1\u5b9a\u7236\u5c42 ${parentKey}\u3002`,
  repairDowngradeNoParent: (layerKey: string) => `\u5c42 ${layerKey} \u7f3a\u5c11\u53ef\u7528\u7236\u5c42\uff0c\u5df2\u964d\u7ea7\u4e3a\u72ec\u7acb\u8fb9\u754c\u3002`,
  repairTimeSubdivisionToDependent: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u65f6\u95f4\u7ec6\u5206\u5df2\u964d\u7ea7\u4e3a\u4f9d\u8d56\u8fb9\u754c\u3002`,
  repairTimeSubdivisionToIndependent: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u65f6\u95f4\u7ec6\u5206\u4e0d\u53ef\u7528\uff0c\u5df2\u964d\u7ea7\u4e3a\u72ec\u7acb\u8fb9\u754c\u3002`,
  repairConstraintToIndependent: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u7ea6\u675f\u4e0d\u53ef\u7528\uff0c\u5df2\u964d\u7ea7\u4e3a\u72ec\u7acb\u8fb9\u754c\u3002`,
  repairCycleToFallbackParent: (layerKey: string, parentKey: string) => `\u5c42 ${layerKey} \u7684\u7236\u5c42\u5faa\u73af\u5df2\u4fee\u590d\u4e3a ${parentKey}\u3002`,
  repairCycleRemoved: (layerKey: string) => `\u5c42 ${layerKey} \u7684\u7236\u5c42\u5faa\u73af\u5df2\u79fb\u9664\u5e76\u964d\u7ea7\u4e3a\u72ec\u7acb\u8fb9\u754c\u3002`,
  transcription: '\u8f6c\u5199',
  translation: '\u7ffb\u8bd1',
  invalidTranslationConstraint: '\u7ffb\u8bd1\u5c42\u4e0d\u652f\u6301\u72ec\u7acb\u8fb9\u754c\uff0c\u8bf7\u6539\u7528\u4f9d\u8d56\u8fb9\u754c\u5e76\u9009\u62e9\u8f6c\u5199\u7236\u5c42\u3002',
  invalidTranslationConstraintShort: '\u7ffb\u8bd1\u5c42\u4ec5\u652f\u6301\u4f9d\u8d56\u8fb9\u754c',
  timeSubdivisionUnavailable: '\u5f53\u524d\u7248\u672c\u6682\u672a\u542f\u7528\u201c\u65f6\u95f4\u7ec6\u5206\u201d\u7f16\u8f91\u80fd\u529b\uff0c\u8bf7\u6539\u7528\u4f9d\u8d56\u8fb9\u754c\u6216\u72ec\u7acb\u8fb9\u754c\u3002',
  constraintUnavailable: '\u5f53\u524d\u6a21\u5f0f\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u9009\u62e9\u5176\u4ed6\u8fb9\u754c\u7ea6\u675f\u3002',
  timeSubdivisionUnavailableShort: '\u65f6\u95f4\u7ec6\u5206\u6682\u4e0d\u53ef\u7528',
  constraintUnavailableShort: '\u8be5\u7ea6\u675f\u5f53\u524d\u4e0d\u53ef\u7528',
  rootTranscriptionIndependentOnlyShort: '\u9996\u4e2a\u8f6c\u5199\u5c42\u4ec5\u652f\u6301\u72ec\u7acb\u8fb9\u754c',
  chooseDependentBoundary: '\u5b58\u5728\u591a\u4e2a\u72ec\u7acb\u8f6c\u5199\u5c42\uff0c\u8bf7\u5148\u9009\u62e9\u8981\u4f9d\u8d56\u7684\u8fb9\u754c\u5c42\u3002',
  chooseDependentBoundaryShort: '\u8bf7\u9009\u62e9\u4f9d\u8d56\u5c42',
  chooseValidDependentBoundary: '\u8bf7\u9009\u62e9\u6709\u6548\u7684\u72ec\u7acb\u8f6c\u5199\u5c42\u4f5c\u4e3a\u4f9d\u8d56\u8fb9\u754c\u3002',
  chooseValidDependentBoundaryShort: '\u8bf7\u9009\u62e9\u6709\u6548\u4f9d\u8d56\u5c42',
  constraintNeedsParent: '\u8be5\u8fb9\u754c\u7ea6\u675f\u9700\u8981\u5148\u9009\u62e9\u6709\u6548\u7236\u5c42\u3002',
  constraintNeedsParentShort: '\u8be5\u7ea6\u675f\u9700\u7236\u5c42',
  needTranscriptionFirst: '\u8bf7\u5148\u521b\u5efa\u8f6c\u5199\u5c42\uff0c\u7ffb\u8bd1\u5c42\u4f9d\u8d56\u8f6c\u5199\u5c42\u3002',
  needTranscriptionFirstShort: '\u9700\u5148\u6709\u8f6c\u5199\u5c42',
  crossTypeLanguageConflict: (opposite: string, same: string) => `\u8be5\u8bed\u8a00\u5df2\u5b58\u5728${opposite}\u5c42\uff0c\u7981\u6b62\u4e0e${same}\u5c42\u540c\u8bed\u8a00\u3002`,
  crossTypeLanguageConflictShort: (opposite: string) => `\u4e0e${opposite}\u5c42\u8bed\u8a00\u51b2\u7a81`,
  sameTypeAliasRequired: (same: string) => `\u8be5\u8bed\u8a00\u5df2\u5b58\u5728${same}\u5c42\uff0c\u8bf7\u63d0\u4f9b\u522b\u540d\u4ee5\u533a\u5206\u3002`,
  sameTypeAliasRequiredShort: (same: string) => `\u540c\u8bed\u8a00${same}\u5c42\u5df2\u5b58\u5728\uff0c\u9700\u586b\u522b\u540d`,
  softLimitWarning: (count: number, label: string, limit: number) => `\u5f53\u524d\u5df2\u6709 ${count} \u4e2a${label}\u5c42\uff08\u5efa\u8bae\u4e0a\u9650 ${limit}\uff09\uff0c\u7ee7\u7eed\u521b\u5efa\u53ef\u80fd\u5f71\u54cd\u6027\u80fd\u3002`,
  deleteTargetNotFound: '\u672a\u627e\u5230\u8981\u5220\u9664\u7684\u5c42\u3002',
};

function detectParentCycle(layerById: Map<string, LayerDocType>, startLayer: LayerDocType): boolean {
  const visited = new Set<string>();
  let cursor: LayerDocType | undefined = startLayer;
  while (cursor) {
    if (visited.has(cursor.id)) return true;
    visited.add(cursor.id);
    const parentId = cursor.parentLayerId;
    if (!parentId) return false;
    cursor = layerById.get(parentId);
  }
  return false;
}

export function validateExistingLayerConstraints(
  layers: LayerDocType[],
  runtimeCapabilities?: Partial<ConstraintRuntimeCapabilities>,
): ExistingLayerConstraintIssue[] {
  const issues: ExistingLayerConstraintIssue[] = [];
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const capabilities: ConstraintRuntimeCapabilities = {
    ...DEFAULT_CONSTRAINT_RUNTIME_CAPABILITIES,
    ...(runtimeCapabilities ?? {}),
  };

  const transcriptionLayers = layers.filter((layer) => layer.layerType === 'transcription');
  const independentTranscriptionLayerIds = new Set(
    listIndependentBoundaryTranscriptionLayers(layers).map((layer) => layer.id),
  );
  const rootTranscription = transcriptionLayers
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  for (const layer of layers) {
    const constraint = layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');

    if (!capabilities[constraint]) {
      issues.push({
        layerId: layer.id,
        code: 'constraint-runtime-not-supported',
        message: ZH.issueConstraintUnsupported(layer.key, constraint),
      });
    }

    if (layer.layerType === 'transcription' && rootTranscription && rootTranscription.id === layer.id && constraint !== 'independent_boundary') {
      issues.push({
        layerId: layer.id,
        code: 'invalid-root-transcription-constraint',
        message: ZH.issueRootTranscriptionIndependentOnly,
      });
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      if (!layer.parentLayerId) {
        issues.push({
          layerId: layer.id,
          code: 'missing-parent-layer',
          message: ZH.issueMissingParentLayerId(layer.key, constraint),
        });
        continue;
      }
      const parent = layerById.get(layer.parentLayerId);
      if (!parent) {
        issues.push({
          layerId: layer.id,
          code: 'parent-layer-not-found',
          message: ZH.issueParentNotFound(layer.key, layer.parentLayerId),
        });
        continue;
      }
      if (parent.layerType !== 'transcription' || !independentTranscriptionLayerIds.has(parent.id)) {
        issues.push({
          layerId: layer.id,
          code: 'invalid-parent-layer-type',
          message: ZH.issueParentMustBeIndependentTranscription(layer.key),
        });
      }
    }

    if (detectParentCycle(layerById, layer)) {
      issues.push({
        layerId: layer.id,
        code: 'parent-cycle-detected',
        message: ZH.issueParentCycle(layer.key),
      });
    }
  }

  return issues;
}

function getEffectiveConstraint(layer: LayerDocType): NonNullable<LayerDocType['constraint']> {
  return layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
}

export function listIndependentBoundaryTranscriptionLayers(layers: LayerDocType[]): LayerDocType[] {
  return layers
    .filter((layer) => layer.layerType === 'transcription' && getEffectiveConstraint(layer) === 'independent_boundary')
    .sort((a, b) => {
      const sortOrderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (sortOrderDiff !== 0) return sortOrderDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

function hasSameConstraint(a: LayerDocType, b: LayerDocType): boolean {
  return getEffectiveConstraint(a) === getEffectiveConstraint(b)
    && (a.parentLayerId ?? '') === (b.parentLayerId ?? '');
}

export function repairExistingLayerConstraints(
  layers: LayerDocType[],
  runtimeCapabilities?: Partial<ConstraintRuntimeCapabilities>,
): { layers: LayerDocType[]; repairs: ExistingLayerConstraintRepair[] } {
  const capabilities: ConstraintRuntimeCapabilities = {
    ...DEFAULT_CONSTRAINT_RUNTIME_CAPABILITIES,
    ...(runtimeCapabilities ?? {}),
  };
  const clonedLayers: LayerDocType[] = layers.map((layer) => ({ ...layer }));
  const layerById = new Map(clonedLayers.map((layer) => [layer.id, layer]));
  const repairs: ExistingLayerConstraintRepair[] = [];
  const transcriptionLayers = clonedLayers.filter((layer) => layer.layerType === 'transcription');
  const rootTranscription = transcriptionLayers
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  const findFallbackParent = (currentId: string): LayerDocType | undefined => {
    return listIndependentBoundaryTranscriptionLayers(clonedLayers)
      .find((candidate) => candidate.id !== currentId);
  };

  const pushRepair = (layerId: string, code: ExistingLayerConstraintIssueCode, message: string): void => {
    repairs.push({ layerId, code, message });
  };

  for (const layer of clonedLayers) {
    const before = { ...layer };
    let constraint = getEffectiveConstraint(layer);

    if (layer.layerType === 'transcription' && rootTranscription && rootTranscription.id === layer.id && constraint !== 'independent_boundary') {
      layer.constraint = 'independent_boundary';
      delete layer.parentLayerId;
      constraint = 'independent_boundary';
      pushRepair(layer.id, 'invalid-root-transcription-constraint', ZH.repairRootTranscription(layer.key));
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      const parent = layer.parentLayerId ? layerById.get(layer.parentLayerId) : undefined;
      if (!parent || parent.id === layer.id || !listIndependentBoundaryTranscriptionLayers(clonedLayers).some((candidate) => candidate.id === parent.id)) {
        const fallbackParent = findFallbackParent(layer.id);
        if (fallbackParent) {
          layer.parentLayerId = fallbackParent.id;
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', ZH.repairBindFallbackParent(layer.key, fallbackParent.key));
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          constraint = 'independent_boundary';
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', ZH.repairDowngradeNoParent(layer.key));
        }
      }
    }

    constraint = getEffectiveConstraint(layer);
    if (!capabilities[constraint]) {
      if (constraint === 'time_subdivision') {
        const fallbackParent = layer.parentLayerId ? layerById.get(layer.parentLayerId) : findFallbackParent(layer.id);
        if (capabilities.symbolic_association && fallbackParent && fallbackParent.layerType === 'transcription') {
          layer.constraint = 'symbolic_association';
          layer.parentLayerId = fallbackParent.id;
          pushRepair(layer.id, 'constraint-runtime-not-supported', ZH.repairTimeSubdivisionToDependent(layer.key));
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          pushRepair(layer.id, 'constraint-runtime-not-supported', ZH.repairTimeSubdivisionToIndependent(layer.key));
        }
      } else {
        layer.constraint = 'independent_boundary';
        delete layer.parentLayerId;
        pushRepair(layer.id, 'constraint-runtime-not-supported', ZH.repairConstraintToIndependent(layer.key));
      }
    }

    if (!hasSameConstraint(before, layer) && !layer.updatedAt) {
      layer.updatedAt = new Date().toISOString();
    }
  }

  for (const layer of clonedLayers) {
    if (!detectParentCycle(layerById, layer)) continue;
    const fallbackParent = findFallbackParent(layer.id);
    if (fallbackParent && getEffectiveConstraint(layer) !== 'independent_boundary') {
      layer.parentLayerId = fallbackParent.id;
      pushRepair(layer.id, 'parent-cycle-detected', ZH.repairCycleToFallbackParent(layer.key, fallbackParent.key));
    } else {
      layer.constraint = 'independent_boundary';
      delete layer.parentLayerId;
      pushRepair(layer.id, 'parent-cycle-detected', ZH.repairCycleRemoved(layer.key));
    }
  }

  return { layers: clonedLayers, repairs };
}

export interface TranslationCreateGuardResult {
  allowed: boolean;
  reasonCode?: TranslationCreateBlockReason;
  /** Backend/action-facing message */
  reason?: string;
  /** Short UI helper message near buttons */
  reasonShort?: string;
}

function normalizeLanguageId(languageId: string | undefined): string {
  return (languageId ?? '').trim().toLowerCase();
}

function getLayerTypeLabel(layerType: 'transcription' | 'translation'): string {
  return layerType === 'transcription' ? ZH.transcription : ZH.translation;
}

function getOppositeLayerType(layerType: 'transcription' | 'translation'): 'transcription' | 'translation' {
  return layerType === 'transcription' ? 'translation' : 'transcription';
}

export function getLayerCreateGuard(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
  input: {
    languageId?: string;
    alias?: string;
    constraint?: LayerDocType['constraint'];
    parentLayerId?: string;
    hasSupportedParent?: boolean;
    runtimeCapabilities?: Partial<ConstraintRuntimeCapabilities>;
  },
): TranslationCreateGuardResult {
  const effectiveConstraint = input.constraint
    ?? (layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
  const dependentParentCandidates = listIndependentBoundaryTranscriptionLayers(layers);
  const normalizedParentLayerId = (input.parentLayerId ?? '').trim();
  const hasExplicitParent = normalizedParentLayerId.length > 0;
  const runtimeCapabilities: ConstraintRuntimeCapabilities = {
    ...DEFAULT_CONSTRAINT_RUNTIME_CAPABILITIES,
    ...(input.runtimeCapabilities ?? {}),
  };

  const hasTranscription = layers.some((l) => l.layerType === 'transcription');
  const inferredHasParent = input.hasSupportedParent
    ?? dependentParentCandidates.length > 0;

  if (layerType === 'translation' && effectiveConstraint === 'independent_boundary') {
    return {
      allowed: false,
      reasonCode: 'invalid-translation-constraint',
      reason: ZH.invalidTranslationConstraint,
      reasonShort: ZH.invalidTranslationConstraintShort,
    };
  }

  if (!runtimeCapabilities[effectiveConstraint]) {
    return {
      allowed: false,
      reasonCode: 'constraint-runtime-not-supported',
      reason: effectiveConstraint === 'time_subdivision'
        ? ZH.timeSubdivisionUnavailable
        : ZH.constraintUnavailable,
      reasonShort: effectiveConstraint === 'time_subdivision'
        ? ZH.timeSubdivisionUnavailableShort
        : ZH.constraintUnavailableShort,
    };
  }

  if (layerType === 'transcription' && !hasTranscription && effectiveConstraint !== 'independent_boundary') {
    return {
      allowed: false,
      reasonCode: 'invalid-constraint-for-root-transcription',
      reason: ZH.issueRootTranscriptionIndependentOnly,
      reasonShort: ZH.rootTranscriptionIndependentOnlyShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && dependentParentCandidates.length > 1
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: ZH.chooseDependentBoundary,
      reasonShort: ZH.chooseDependentBoundaryShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && hasExplicitParent
    && !dependentParentCandidates.some((layer) => layer.id === normalizedParentLayerId)) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: ZH.chooseValidDependentBoundary,
      reasonShort: ZH.chooseValidDependentBoundaryShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && !inferredHasParent
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: ZH.constraintNeedsParent,
      reasonShort: ZH.constraintNeedsParentShort,
    };
  }

  if (layerType === 'translation') {
    if (!hasTranscription) {
      return {
        allowed: false,
        reasonCode: 'missing-transcription',
        reason: ZH.needTranscriptionFirst,
        reasonShort: ZH.needTranscriptionFirstShort,
      };
    }
  }

  const languageId = normalizeLanguageId(input.languageId);
  const alias = (input.alias ?? '').trim();
  if (!languageId) {
    return { allowed: true };
  }

  const oppositeType = getOppositeLayerType(layerType);
  const oppositeTypeLabel = getLayerTypeLabel(oppositeType);
  const sameTypeLabel = getLayerTypeLabel(layerType);

  const hasOppositeTypeLanguage = layers.some(
    (l) => l.layerType === oppositeType && normalizeLanguageId(l.languageId) === languageId,
  );
  if (hasOppositeTypeLanguage) {
    return {
      allowed: false,
      reasonCode: 'cross-type-same-language',
      reason: ZH.crossTypeLanguageConflict(oppositeTypeLabel, sameTypeLabel),
      reasonShort: ZH.crossTypeLanguageConflictShort(oppositeTypeLabel),
    };
  }

  const hasSameTypeLanguage = layers.some(
    (l) => l.layerType === layerType && normalizeLanguageId(l.languageId) === languageId,
  );
  if (hasSameTypeLanguage && alias.length === 0) {
    return {
      allowed: false,
      reasonCode: 'duplicate-same-type-without-alias',
      reason: ZH.sameTypeAliasRequired(sameTypeLabel),
      reasonShort: ZH.sameTypeAliasRequiredShort(sameTypeLabel),
    };
  }

  return { allowed: true };
}

/** Shared translation-create guard (UI + backend). */
export function getTranslationCreateGuard(
  layers: LayerDocType[],
  input: { languageId?: string; alias?: string },
): TranslationCreateGuardResult {
  return getLayerCreateGuard(layers, 'translation', input);
}

// Create constraints

export function canCreateLayer(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
): CanCreateResult {
  // Translation layer requires at least one transcription layer.
  if (layerType === 'translation') {
    const hasTranscription = layers.some((l) => l.layerType === 'transcription');
    if (!hasTranscription) {
      return { allowed: false, reason: ZH.needTranscriptionFirst };
    }
  }

  // Soft limit warning.
  const existing = layers.filter((l) => l.layerType === layerType);
  const limit = LAYER_SOFT_LIMITS[layerType];
  if (existing.length >= limit) {
    const typeLabel = layerType === 'transcription' ? ZH.transcription : ZH.translation;
    return {
      allowed: true,
      warning: ZH.softLimitWarning(existing.length, typeLabel, limit),
    };
  }

  return { allowed: true };
}

// Delete constraints

export function canDeleteLayer(
  layers: LayerDocType[],
  targetLayerId: string,
): CanDeleteResult {
  const target = layers.find((l) => l.id === targetLayerId);
  if (!target) {
    return { allowed: false, reason: ZH.deleteTargetNotFound };
  }

  if (target.layerType === 'transcription') {
    const transcriptionLayers = listIndependentBoundaryTranscriptionLayers(layers);
    const dependentTranslations = layers.filter(
      (layer) => layer.layerType === 'translation' && layer.parentLayerId === target.id,
    );
    const orphanedTranslationIds = dependentTranslations.map((layer) => layer.id);

    // Most recent remaining transcription layer (re-link target).
    const remainingTrc = transcriptionLayers
      .filter((l) => l.id !== targetLayerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const result: CanDeleteResult = {
      allowed: true,
      affectedLinkCount: dependentTranslations.length,
    };
    if (orphanedTranslationIds.length > 0) {
      result.orphanedTranslationIds = orphanedTranslationIds;
      if (remainingTrc) {
        result.relinkTargetKey = remainingTrc.key;
      }
    }
    return result;
  }

  // Translation uses parent-layer relation as canonical model.
  return { allowed: true, affectedLinkCount: 0 };
}

// Link queries

/**
 * Get all linked layer IDs for a given layer.
 */
export function getLinkedLayers(
  _layerLinks: LayerLinkDocType[],
  layers: LayerDocType[],
  layerId: string,
): LayerDocType[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return [];

  if (target.layerType === 'transcription') {
    // Transcription -> translations whose parentLayerId points to this layer.
    return layers.filter((layer) => layer.layerType === 'translation' && layer.parentLayerId === target.id);
  }

  // Translation -> resolve parent transcription.
  if (!target.parentLayerId) return [];
  const parent = layers.find((layer) => layer.id === target.parentLayerId && layer.layerType === 'transcription');
  return parent ? [parent] : [];
}

/**
 * Get the most recently created layer of the opposite type.
 */
export function getMostRecentLayerOfType(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
): LayerDocType | undefined {
  return layers
    .filter((l) => l.layerType === layerType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
