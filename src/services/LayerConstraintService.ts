/**
 * Layer constraint validation service (pure functions).
 *
 * Rules:
 * - Translation layers depend on transcription layers.
 * - Do not delete the last transcription layer when translations still depend on it.
 * - Soft-limit overflow emits warnings without blocking.
 */
import { LAYER_SOFT_LIMITS, type LayerDocType, type LayerLinkDocType } from '../db';
import type { Locale } from '../i18n';
import { getLayerConstraintServiceMessages } from '../i18n/layerConstraintServiceMessages';

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

/** 默认 locale | Default locale for backward compatibility */
const DEFAULT_LOCALE: Locale = 'zh-CN';

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
  locale: Locale = DEFAULT_LOCALE,
): ExistingLayerConstraintIssue[] {
  const msg = getLayerConstraintServiceMessages(locale);
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
        message: msg.issueConstraintUnsupported(layer.key, constraint),
      });
    }

    if (layer.layerType === 'transcription' && rootTranscription && rootTranscription.id === layer.id && constraint !== 'independent_boundary') {
      issues.push({
        layerId: layer.id,
        code: 'invalid-root-transcription-constraint',
        message: msg.issueRootTranscriptionIndependentOnly,
      });
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      if (!layer.parentLayerId) {
        issues.push({
          layerId: layer.id,
          code: 'missing-parent-layer',
          message: msg.issueMissingParentLayerId(layer.key, constraint),
        });
        continue;
      }
      const parent = layerById.get(layer.parentLayerId);
      if (!parent) {
        issues.push({
          layerId: layer.id,
          code: 'parent-layer-not-found',
          message: msg.issueParentNotFound(layer.key, layer.parentLayerId),
        });
        continue;
      }
      if (parent.layerType !== 'transcription' || !independentTranscriptionLayerIds.has(parent.id)) {
        issues.push({
          layerId: layer.id,
          code: 'invalid-parent-layer-type',
          message: msg.issueParentMustBeIndependentTranscription(layer.key),
        });
      }
    }

    if (detectParentCycle(layerById, layer)) {
      issues.push({
        layerId: layer.id,
        code: 'parent-cycle-detected',
        message: msg.issueParentCycle(layer.key),
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
  locale: Locale = DEFAULT_LOCALE,
): { layers: LayerDocType[]; repairs: ExistingLayerConstraintRepair[] } {
  const msg = getLayerConstraintServiceMessages(locale);
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
      pushRepair(layer.id, 'invalid-root-transcription-constraint', msg.repairRootTranscription(layer.key));
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      const parent = layer.parentLayerId ? layerById.get(layer.parentLayerId) : undefined;
      if (!parent || parent.id === layer.id || !listIndependentBoundaryTranscriptionLayers(clonedLayers).some((candidate) => candidate.id === parent.id)) {
        const fallbackParent = findFallbackParent(layer.id);
        if (fallbackParent) {
          layer.parentLayerId = fallbackParent.id;
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', msg.repairBindFallbackParent(layer.key, fallbackParent.key));
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          constraint = 'independent_boundary';
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', msg.repairDowngradeNoParent(layer.key));
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
          pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairTimeSubdivisionToDependent(layer.key));
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairTimeSubdivisionToIndependent(layer.key));
        }
      } else {
        layer.constraint = 'independent_boundary';
        delete layer.parentLayerId;
        pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairConstraintToIndependent(layer.key));
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
      pushRepair(layer.id, 'parent-cycle-detected', msg.repairCycleToFallbackParent(layer.key, fallbackParent.key));
    } else {
      layer.constraint = 'independent_boundary';
      delete layer.parentLayerId;
      pushRepair(layer.id, 'parent-cycle-detected', msg.repairCycleRemoved(layer.key));
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

function getLayerTypeLabel(layerType: 'transcription' | 'translation', msg: ReturnType<typeof getLayerConstraintServiceMessages>): string {
  return layerType === 'transcription' ? msg.transcription : msg.translation;
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
  locale: Locale = DEFAULT_LOCALE,
): TranslationCreateGuardResult {
  const msg = getLayerConstraintServiceMessages(locale);
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
      reason: msg.invalidTranslationConstraint,
      reasonShort: msg.invalidTranslationConstraintShort,
    };
  }

  if (!runtimeCapabilities[effectiveConstraint]) {
    return {
      allowed: false,
      reasonCode: 'constraint-runtime-not-supported',
      reason: effectiveConstraint === 'time_subdivision'
        ? msg.timeSubdivisionUnavailable
        : msg.constraintUnavailable,
      reasonShort: effectiveConstraint === 'time_subdivision'
        ? msg.timeSubdivisionUnavailableShort
        : msg.constraintUnavailableShort,
    };
  }

  if (layerType === 'transcription' && !hasTranscription && effectiveConstraint !== 'independent_boundary') {
    return {
      allowed: false,
      reasonCode: 'invalid-constraint-for-root-transcription',
      reason: msg.issueRootTranscriptionIndependentOnly,
      reasonShort: msg.rootTranscriptionIndependentOnlyShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && dependentParentCandidates.length > 1
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: msg.chooseDependentBoundary,
      reasonShort: msg.chooseDependentBoundaryShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && hasExplicitParent
    && !dependentParentCandidates.some((layer) => layer.id === normalizedParentLayerId)) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: msg.chooseValidDependentBoundary,
      reasonShort: msg.chooseValidDependentBoundaryShort,
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && !inferredHasParent
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: msg.constraintNeedsParent,
      reasonShort: msg.constraintNeedsParentShort,
    };
  }

  if (layerType === 'translation') {
    if (!hasTranscription) {
      return {
        allowed: false,
        reasonCode: 'missing-transcription',
        reason: msg.needTranscriptionFirst,
        reasonShort: msg.needTranscriptionFirstShort,
      };
    }
  }

  const languageId = normalizeLanguageId(input.languageId);
  const alias = (input.alias ?? '').trim();
  if (!languageId) {
    return { allowed: true };
  }

  const oppositeType = getOppositeLayerType(layerType);
  const oppositeTypeLabel = getLayerTypeLabel(oppositeType, msg);
  const sameTypeLabel = getLayerTypeLabel(layerType, msg);

  const hasOppositeTypeLanguage = layers.some(
    (l) => l.layerType === oppositeType && normalizeLanguageId(l.languageId) === languageId,
  );
  if (hasOppositeTypeLanguage) {
    return {
      allowed: false,
      reasonCode: 'cross-type-same-language',
      reason: msg.crossTypeLanguageConflict(oppositeTypeLabel, sameTypeLabel),
      reasonShort: msg.crossTypeLanguageConflictShort(oppositeTypeLabel),
    };
  }

  const hasSameTypeLanguage = layers.some(
    (l) => l.layerType === layerType && normalizeLanguageId(l.languageId) === languageId,
  );
  if (hasSameTypeLanguage && alias.length === 0) {
    return {
      allowed: false,
      reasonCode: 'duplicate-same-type-without-alias',
      reason: msg.sameTypeAliasRequired(sameTypeLabel),
      reasonShort: msg.sameTypeAliasRequiredShort(sameTypeLabel),
    };
  }

  return { allowed: true };
}

/** Shared translation-create guard (UI + backend). */
export function getTranslationCreateGuard(
  layers: LayerDocType[],
  input: { languageId?: string; alias?: string },
  locale: Locale = DEFAULT_LOCALE,
): TranslationCreateGuardResult {
  return getLayerCreateGuard(layers, 'translation', input, locale);
}

// Create constraints

export function canCreateLayer(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
  locale: Locale = DEFAULT_LOCALE,
): CanCreateResult {
  const msg = getLayerConstraintServiceMessages(locale);
  // Translation layer requires at least one transcription layer.
  if (layerType === 'translation') {
    const hasTranscription = layers.some((l) => l.layerType === 'transcription');
    if (!hasTranscription) {
      return { allowed: false, reason: msg.needTranscriptionFirst };
    }
  }

  // Soft limit warning.
  const existing = layers.filter((l) => l.layerType === layerType);
  const limit = LAYER_SOFT_LIMITS[layerType];
  if (existing.length >= limit) {
    const typeLabel = layerType === 'transcription' ? msg.transcription : msg.translation;
    return {
      allowed: true,
      warning: msg.softLimitWarning(existing.length, typeLabel, limit),
    };
  }

  return { allowed: true };
}

// Delete constraints

export function canDeleteLayer(
  layers: LayerDocType[],
  targetLayerId: string,
  locale: Locale = DEFAULT_LOCALE,
): CanDeleteResult {
  const msg = getLayerConstraintServiceMessages(locale);
  const target = layers.find((l) => l.id === targetLayerId);
  if (!target) {
    return { allowed: false, reason: msg.deleteTargetNotFound };
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
