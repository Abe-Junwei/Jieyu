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
  type TranscriptionLayerDocType,
  type TranslationLayerDocType,
  layerTranscriptionTreeParentId,
} from '../db';
import type { Locale } from '../i18n';
import { getLayerConstraintServiceMessages } from '../i18n/messages';
import {
  buildTranscriptionIdByKeyMap,
  getHostTranscriptionLayerIdsForTranslation,
  getPreferredHostTranscriptionLayerIdForTranslation,
  resolveLayerLinkHostTranscriptionLayerId,
} from '../utils/translationHostLinkQuery';

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

type ParentCycleLinkContext = {
  layerLinks: readonly LayerLinkDocType[];
  layers: readonly LayerDocType[];
};

function translationHasResolvedLinkHosts(
  layer: LayerDocType,
  linkContext: ParentCycleLinkContext | undefined,
): boolean {
  if (layer.layerType !== 'translation' || !linkContext?.layerLinks.length) return false;
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(linkContext.layers);
  return getHostTranscriptionLayerIdsForTranslation(layer.id, linkContext.layerLinks, transcriptionIdByKey).length > 0;
}

/** Walk layer.parentLayerId only; skip tree parent for link-hosted translations (hosts are SSOT). */
function detectParentCycle(
  layerById: Map<string, LayerDocType>,
  startLayer: LayerDocType,
  linkContext?: ParentCycleLinkContext,
): boolean {
  const visited = new Set<string>();
  let cursor: LayerDocType | undefined = startLayer;
  while (cursor) {
    if (visited.has(cursor.id)) return true;
    visited.add(cursor.id);
    const parentId = translationHasResolvedLinkHosts(cursor, linkContext)
      ? undefined
      : layerTranscriptionTreeParentId(cursor);
    if (!parentId) return false;
    cursor = layerById.get(parentId);
  }
  return false;
}

/** Stable signature for whether a repaired layer row should be persisted (constraint + tree parent or link hosts). */
function constraintBindingSignature(
  layer: LayerDocType,
  layerLinks: readonly LayerLinkDocType[],
  transcriptionIdByKey: ReadonlyMap<string, string>,
): string {
  const c = getEffectiveConstraint(layer);
  if (layer.layerType === 'translation' && layerLinks.length > 0) {
    const hostIds = getHostTranscriptionLayerIdsForTranslation(layer.id, layerLinks, transcriptionIdByKey);
    if (hostIds.length > 0) {
      const pref = getPreferredHostTranscriptionLayerIdForTranslation(layer.id, layerLinks, transcriptionIdByKey) ?? '';
      const sortedHosts = [...hostIds].sort().join('\u0001');
      return `${c}\u0002links:${sortedHosts}\u0002pref:${pref}`;
    }
  }
  return `${c}\u0002tree:${layerTranscriptionTreeParentId(layer) ?? ''}`;
}

export function hasRepairPersistableLayerDiff(
  before: LayerDocType,
  after: LayerDocType,
  allLayers: readonly LayerDocType[],
  layerLinks: readonly LayerLinkDocType[],
): boolean {
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(allLayers);
  return constraintBindingSignature(before, layerLinks, transcriptionIdByKey)
    !== constraintBindingSignature(after, layerLinks, transcriptionIdByKey);
}

export function validateExistingLayerConstraints(
  layers: LayerDocType[],
  runtimeCapabilities?: Partial<ConstraintRuntimeCapabilities>,
  locale: Locale = DEFAULT_LOCALE,
  layerLinks: readonly LayerLinkDocType[] = [],
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
      if (layer.layerType === 'translation') {
        if (layerLinks.length > 0) {
          const transcriptionIdByKey = buildTranscriptionIdByKeyMap(layers);
          const hostIds = getHostTranscriptionLayerIdsForTranslation(layer.id, layerLinks, transcriptionIdByKey);
          if (hostIds.length > 0) {
            for (const hostId of hostIds) {
              const hostLayer = layerById.get(hostId);
              if (!hostLayer || hostLayer.layerType !== 'transcription' || !independentTranscriptionLayerIds.has(hostLayer.id)) {
                issues.push({
                  layerId: layer.id,
                  code: 'invalid-parent-layer-type',
                  message: msg.issueParentMustBeIndependentTranscription(layer.key),
                });
                break;
              }
            }
            continue;
          }
        }
        issues.push({
          layerId: layer.id,
          code: 'missing-parent-layer',
          message: msg.issueMissingTranslationHostLink(layer.key, constraint),
        });
        continue;
      }

      const treeParentId = layerTranscriptionTreeParentId(layer);
      if (!treeParentId) {
        issues.push({
          layerId: layer.id,
          code: 'missing-parent-layer',
          message: msg.issueMissingParentLayerId(layer.key, constraint),
        });
        continue;
      }
      const parent = layerById.get(treeParentId);
      if (!parent) {
        issues.push({
          layerId: layer.id,
          code: 'parent-layer-not-found',
          message: msg.issueParentNotFound(layer.key, treeParentId),
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

    const cycleCtx: ParentCycleLinkContext | undefined = layerLinks.length > 0
      ? { layerLinks, layers }
      : undefined;
    if (detectParentCycle(layerById, layer, cycleCtx)) {
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

export function repairExistingLayerConstraints(
  layers: LayerDocType[],
  runtimeCapabilities?: Partial<ConstraintRuntimeCapabilities>,
  locale: Locale = DEFAULT_LOCALE,
  layerLinks: readonly LayerLinkDocType[] = [],
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
  const transcriptionIdByKeyForRepair = buildTranscriptionIdByKeyMap(clonedLayers);
  const cycleLinkCtx: ParentCycleLinkContext | undefined = layerLinks.length > 0
    ? { layerLinks, layers: clonedLayers }
    : undefined;

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
      if (layer.layerType === 'translation') {
        if (layerLinks.length > 0) {
          const hostIds = getHostTranscriptionLayerIdsForTranslation(layer.id, layerLinks, transcriptionIdByKeyForRepair);
          if (hostIds.length > 0) {
            delete (layer as unknown as Record<string, unknown>).parentLayerId;
            const independentIds = new Set(listIndependentBoundaryTranscriptionLayers(clonedLayers).map((l) => l.id));
            const invalidHost = hostIds.some((hostId) => {
              const hostLayer = layerById.get(hostId);
              return !hostLayer || hostLayer.layerType !== 'transcription' || !independentIds.has(hostId);
            });
            if (invalidHost) {
              pushRepair(layer.id, 'invalid-parent-layer-type', msg.issueParentMustBeIndependentTranscription(layer.key));
            }
            // 已解析宿主链接：不再走「缺父 / 树父重绑」分支，但仍需执行下方运行时能力降级等逻辑
            // Resolved link hosts: skip missing-host / tree-parent repair, but still run capability downgrade below.
          } else {
            const fallbackParent = findFallbackParent(layer.id);
            if (fallbackParent) {
              pushRepair(layer.id, 'missing-parent-layer', msg.repairTranslationHostLinkHint(layer.key, fallbackParent.key));
            } else {
              layer.constraint = 'independent_boundary';
              delete (layer as unknown as Record<string, unknown>).parentLayerId;
              constraint = 'independent_boundary';
              pushRepair(layer.id, 'missing-parent-layer', msg.repairDowngradeNoParent(layer.key));
            }
            continue;
          }
        } else {
          const fallbackParent = findFallbackParent(layer.id);
          if (fallbackParent) {
            pushRepair(layer.id, 'missing-parent-layer', msg.repairTranslationHostLinkHint(layer.key, fallbackParent.key));
          } else {
            layer.constraint = 'independent_boundary';
            delete (layer as unknown as Record<string, unknown>).parentLayerId;
            constraint = 'independent_boundary';
            pushRepair(layer.id, 'missing-parent-layer', msg.repairDowngradeNoParent(layer.key));
          }
          continue;
        }
      } else {
        const treeParentId = layerTranscriptionTreeParentId(layer);
        const parent = treeParentId ? layerById.get(treeParentId) : undefined;
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
    }

    constraint = getEffectiveConstraint(layer);
    if (!capabilities[constraint]) {
      if (constraint === 'time_subdivision') {
        const treeId = layerTranscriptionTreeParentId(layer);
        const fallbackParent = treeId ? layerById.get(treeId) : findFallbackParent(layer.id);
        if (capabilities.symbolic_association && fallbackParent && fallbackParent.layerType === 'transcription') {
          layer.constraint = 'symbolic_association';
          if (layer.layerType === 'translation' && layerLinks.length > 0) {
            const hostIds = getHostTranscriptionLayerIdsForTranslation(layer.id, layerLinks, transcriptionIdByKeyForRepair);
            if (hostIds.length > 0) {
              delete (layer as unknown as Record<string, unknown>).parentLayerId;
            }
          } else if (layer.layerType === 'transcription') {
            layer.parentLayerId = fallbackParent.id;
          }
          pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairTimeSubdivisionToDependent(layer.key));
        } else {
          layer.constraint = 'independent_boundary';
          if (layer.layerType === 'transcription') {
            delete layer.parentLayerId;
          } else {
            delete (layer as unknown as Record<string, unknown>).parentLayerId;
          }
          pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairTimeSubdivisionToIndependent(layer.key));
        }
      } else {
        layer.constraint = 'independent_boundary';
        if (layer.layerType === 'transcription') {
          delete layer.parentLayerId;
        } else {
          delete (layer as unknown as Record<string, unknown>).parentLayerId;
        }
        pushRepair(layer.id, 'constraint-runtime-not-supported', msg.repairConstraintToIndependent(layer.key));
      }
    }

    if (constraintBindingSignature(before, layerLinks, transcriptionIdByKeyForRepair)
      !== constraintBindingSignature(layer, layerLinks, transcriptionIdByKeyForRepair)
      && !layer.updatedAt) {
      layer.updatedAt = new Date().toISOString();
    }
  }

  for (const layer of clonedLayers) {
    if (!detectParentCycle(layerById, layer, cycleLinkCtx)) continue;
    const fallbackParent = findFallbackParent(layer.id);
    if (fallbackParent && getEffectiveConstraint(layer) !== 'independent_boundary') {
      if (layer.layerType === 'translation' && translationHasResolvedLinkHosts(layer, cycleLinkCtx)) {
        delete (layer as unknown as Record<string, unknown>).parentLayerId;
        pushRepair(layer.id, 'parent-cycle-detected', msg.repairCycleClearedTranslationTreeParent(layer.key));
        continue;
      }
      if (layer.layerType === 'transcription') {
        layer.parentLayerId = fallbackParent.id;
        pushRepair(layer.id, 'parent-cycle-detected', msg.repairCycleToFallbackParent(layer.key, fallbackParent.key));
      }
    } else {
      layer.constraint = 'independent_boundary';
      if (layer.layerType === 'transcription') {
        delete layer.parentLayerId;
      } else {
        delete (layer as unknown as Record<string, unknown>).parentLayerId;
      }
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

/** Normalize layer / intent modality for duplicate detection (missing → text). */
function normalizeEffectiveModality(
  modality: LayerDocType['modality'] | undefined,
): 'text' | 'audio' | 'mixed' {
  const m = modality ?? 'text';
  if (m === 'audio' || m === 'mixed') return m;
  return 'text';
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
    modality?: LayerDocType['modality'];
    constraint?: LayerDocType['constraint'];
    parentLayerId?: string;
    /** Translation: explicit independent-boundary host transcription ids (layer_links targets). */
    hostTranscriptionLayerIds?: string[];
    preferredHostTranscriptionLayerId?: string;
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
  const normalizedHostTranscriptionLayerIds = layerType === 'translation'
    ? [...new Set((input.hostTranscriptionLayerIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0))]
    : [];
  const translationHasExplicitHosts = layerType === 'translation' && normalizedHostTranscriptionLayerIds.length > 0;
  const normalizedPreferredHostId = (input.preferredHostTranscriptionLayerId ?? '').trim();
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

  const translationHasPreferredHost = layerType === 'translation'
    && normalizedPreferredHostId.length > 0
    && dependentParentCandidates.some((candidate) => candidate.id === normalizedPreferredHostId);
  const translationExplicitDependency = hasExplicitParent
    || translationHasExplicitHosts
    || translationHasPreferredHost;
  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && dependentParentCandidates.length > 1
    && (layerType === 'translation' ? !translationExplicitDependency : !hasExplicitParent)) {
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

  if (translationHasExplicitHosts) {
    const invalidHostId = normalizedHostTranscriptionLayerIds.find(
      (hostId) => !dependentParentCandidates.some((layer) => layer.id === hostId),
    );
    if (invalidHostId) {
      return {
        allowed: false,
        reasonCode: 'constraint-parent-required',
        reason: msg.chooseValidDependentBoundary,
        reasonShort: msg.chooseValidDependentBoundaryShort,
      };
    }
    if (normalizedPreferredHostId
      && !normalizedHostTranscriptionLayerIds.includes(normalizedPreferredHostId)) {
      return {
        allowed: false,
        reasonCode: 'constraint-parent-required',
        reason: msg.chooseValidDependentBoundary,
        reasonShort: msg.chooseValidDependentBoundaryShort,
      };
    }
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && !inferredHasParent
    && (layerType === 'translation' ? !translationExplicitDependency : !hasExplicitParent)) {
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

  const incomingModality = normalizeEffectiveModality(input.modality);
  const hasSameTypeLanguageAndModality = layers.some(
    (l) => l.layerType === layerType
      && normalizeLanguageId(l.languageId) === languageId
      && normalizeEffectiveModality(l.modality) === incomingModality,
  );
  if (hasSameTypeLanguageAndModality && alias.length === 0) {
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
  input: {
    languageId?: string;
    alias?: string;
    modality?: LayerDocType['modality'];
    hostTranscriptionLayerIds?: string[];
    preferredHostTranscriptionLayerId?: string;
  },
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
  layerLinks: LayerLinkDocType[] = [],
  locale: Locale = DEFAULT_LOCALE,
): CanDeleteResult {
  const msg = getLayerConstraintServiceMessages(locale);
  const target = layers.find((l) => l.id === targetLayerId);
  if (!target) {
    return { allowed: false, reason: msg.deleteTargetNotFound };
  }

  if (target.layerType === 'transcription') {
    const transcriptionLayers = listIndependentBoundaryTranscriptionLayers(layers);
    const transcriptionIdByKey = buildTranscriptionIdByKeyMap(layers);
    const translationById = new Map(
      layers
        .filter((layer) => layer.layerType === 'translation')
        .map((layer) => [layer.id, layer] as const),
    );

    const dependentLinks = layerLinks.filter((link) => {
      const hostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
      return hostId === target.id;
    });

    const orphanedTranslationIdsFromLinks = [...new Set(
      dependentLinks
        .map((link) => link.layerId)
        .filter((id) => translationById.has(id)),
    )];
    const orphanedTranslationIds = orphanedTranslationIdsFromLinks;

    // Most recent remaining transcription layer (re-link target).
    const remainingTrc = transcriptionLayers
      .filter((l) => l.id !== targetLayerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const result: CanDeleteResult = {
      allowed: true,
      affectedLinkCount: dependentLinks.length,
    };
    if (orphanedTranslationIds.length > 0) {
      result.orphanedTranslationIds = orphanedTranslationIds;
      if (remainingTrc) {
        result.relinkTargetKey = remainingTrc.key;
      }
    }
    return result;
  }

  const affectedLinkCount = layerLinks.filter((link) => link.layerId === target.id).length;
  return { allowed: true, affectedLinkCount };
}

// Link queries

/**
 * Get all linked layer IDs for a given layer.
 */
export function getLinkedLayers(
  layerLinks: LayerLinkDocType[],
  layers: LayerDocType[],
  layerId: string,
): LayerDocType[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return [];

  const transcriptionById = new Map(
    layers
      .filter((layer) => layer.layerType === 'transcription')
      .map((layer) => [layer.id, layer] as const),
  );
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(layers);

  if (target.layerType === 'transcription') {
    const linkedTranslationIds = [...new Set(
      layerLinks
        .filter((link) => resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey) === target.id)
        .map((link) => link.layerId),
    )];
    const translationById = new Map(
      layers
        .filter((layer) => layer.layerType === 'translation')
        .map((layer) => [layer.id, layer] as const),
    );
    return linkedTranslationIds
      .map((id) => translationById.get(id))
      .filter((layer): layer is TranslationLayerDocType => Boolean(layer));
  }

  const linkedHostIds = [...new Set(
    layerLinks
      .filter((link) => link.layerId === target.id)
      .map((link) => resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey))
      .filter((id): id is string => id.length > 0),
  )];
  if (linkedHostIds.length > 0) {
    return linkedHostIds
      .map((id) => transcriptionById.get(id))
      .filter((layer): layer is TranscriptionLayerDocType => Boolean(layer));
  }
  return [];
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
