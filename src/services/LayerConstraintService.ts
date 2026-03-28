/**
 * 层约束验证服务（纯函数）
 * Layer constraint validation service (pure functions)
 *
 * 规则：
 * - 翻译层依赖转写层：无转写层时禁止创建翻译层
 * - 有翻译层时禁止删除最后一个转写层
 * - 超过软上限时发出警告（不阻断）
 */
import {
  LAYER_SOFT_LIMITS,
  type LayerDocType,
  type LayerLinkDocType,
} from '../db';

// ─── 结果类型 | Result types ─────────────────────────────────────────

export interface CanCreateResult {
  allowed: boolean;
  /** 阻断原因 | Blocking reason */
  reason?: string;
  /** 非阻断警告（如超软上限）| Non-blocking warning */
  warning?: string;
}

export interface CanDeleteResult {
  allowed: boolean;
  reason?: string;
  /** 将被清理的链接数 | Number of links that will be cleaned up */
  affectedLinkCount?: number;
  /** 因删除而变成孤立的翻译层 ID | Translation layer IDs that would become orphaned */
  orphanedTranslationIds?: string[];
  /** 孤立翻译层将被重链到的转写层 key | Transcription layer key orphans will be re-linked to */
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
        message: `层 ${layer.key} 使用了当前运行时未启用的约束：${constraint}`,
      });
    }

    if (layer.layerType === 'transcription' && rootTranscription && rootTranscription.id === layer.id && constraint !== 'independent_boundary') {
      issues.push({
        layerId: layer.id,
        code: 'invalid-root-transcription-constraint',
        message: '首个转写层必须使用独立边界。',
      });
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      if (!layer.parentLayerId) {
        issues.push({
          layerId: layer.id,
          code: 'missing-parent-layer',
          message: `层 ${layer.key} 使用 ${constraint} 但缺少 parentLayerId。`,
        });
        continue;
      }
      const parent = layerById.get(layer.parentLayerId);
      if (!parent) {
        issues.push({
          layerId: layer.id,
          code: 'parent-layer-not-found',
          message: `层 ${layer.key} 的父层 ${layer.parentLayerId} 不存在。`,
        });
        continue;
      }
      if (parent.layerType !== 'transcription' || !independentTranscriptionLayerIds.has(parent.id)) {
        issues.push({
          layerId: layer.id,
          code: 'invalid-parent-layer-type',
          message: `层 ${layer.key} 的父层必须是独立转写层。`,
        });
      }
    }

    if (detectParentCycle(layerById, layer)) {
      issues.push({
        layerId: layer.id,
        code: 'parent-cycle-detected',
        message: `层 ${layer.key} 的父层引用存在循环。`,
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
      pushRepair(layer.id, 'invalid-root-transcription-constraint', `已将首个转写层 ${layer.key} 的约束修复为独立边界。`);
    }

    if (constraint === 'symbolic_association' || constraint === 'time_subdivision') {
      const parent = layer.parentLayerId ? layerById.get(layer.parentLayerId) : undefined;
      if (!parent || parent.id === layer.id || !listIndependentBoundaryTranscriptionLayers(clonedLayers).some((candidate) => candidate.id === parent.id)) {
        const fallbackParent = findFallbackParent(layer.id);
        if (fallbackParent) {
          layer.parentLayerId = fallbackParent.id;
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', `已为层 ${layer.key} 自动绑定父层 ${fallbackParent.key}。`);
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          constraint = 'independent_boundary';
          pushRepair(layer.id, !parent ? 'missing-parent-layer' : 'invalid-parent-layer-type', `层 ${layer.key} 缺少可用父层，已降级为独立边界。`);
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
          pushRepair(layer.id, 'constraint-runtime-not-supported', `层 ${layer.key} 的时间细分已降级为依赖边界。`);
        } else {
          layer.constraint = 'independent_boundary';
          delete layer.parentLayerId;
          pushRepair(layer.id, 'constraint-runtime-not-supported', `层 ${layer.key} 的时间细分不可用，已降级为独立边界。`);
        }
      } else {
        layer.constraint = 'independent_boundary';
        delete layer.parentLayerId;
        pushRepair(layer.id, 'constraint-runtime-not-supported', `层 ${layer.key} 的约束不可用，已降级为独立边界。`);
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
      pushRepair(layer.id, 'parent-cycle-detected', `层 ${layer.key} 的父层循环已修复为 ${fallbackParent.key}。`);
    } else {
      layer.constraint = 'independent_boundary';
      delete layer.parentLayerId;
      pushRepair(layer.id, 'parent-cycle-detected', `层 ${layer.key} 的父层循环已移除并降级为独立边界。`);
    }
  }

  return { layers: clonedLayers, repairs };
}

export interface TranslationCreateGuardResult {
  allowed: boolean;
  reasonCode?: TranslationCreateBlockReason;
  /** 面向后端/动作提示文案 | Backend/action-facing message */
  reason?: string;
  /** 面向按钮附近的短提示 | Short UI helper message near buttons */
  reasonShort?: string;
}

function normalizeLanguageId(languageId: string | undefined): string {
  return (languageId ?? '').trim().toLowerCase();
}

function getLayerTypeLabel(layerType: 'transcription' | 'translation'): string {
  return layerType === 'transcription' ? '转写' : '翻译';
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
      reason: '翻译层不支持独立边界，请改用依赖边界并选择转写父层。',
      reasonShort: '翻译层仅支持依赖边界',
    };
  }

  if (!runtimeCapabilities[effectiveConstraint]) {
    return {
      allowed: false,
      reasonCode: 'constraint-runtime-not-supported',
      reason: effectiveConstraint === 'time_subdivision'
        ? '当前版本暂未启用“时间细分”编辑能力，请改用依赖边界或独立边界。'
        : '当前模式暂不可用，请选择其他边界约束。',
      reasonShort: effectiveConstraint === 'time_subdivision'
        ? '时间细分暂不可用'
        : '该约束当前不可用',
    };
  }

  if (layerType === 'transcription' && !hasTranscription && effectiveConstraint !== 'independent_boundary') {
    return {
      allowed: false,
      reasonCode: 'invalid-constraint-for-root-transcription',
      reason: '首个转写层必须使用独立边界。',
      reasonShort: '首个转写层仅支持独立边界',
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && dependentParentCandidates.length > 1
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: '存在多个独立转写层，请先选择要依赖的边界层。',
      reasonShort: '请选择依赖层',
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && hasExplicitParent
    && !dependentParentCandidates.some((layer) => layer.id === normalizedParentLayerId)) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: '请选择有效的独立转写层作为依赖边界。',
      reasonShort: '请选择有效依赖层',
    };
  }

  if ((effectiveConstraint === 'symbolic_association' || effectiveConstraint === 'time_subdivision')
    && !inferredHasParent
    && !hasExplicitParent) {
    return {
      allowed: false,
      reasonCode: 'constraint-parent-required',
      reason: '该边界约束需要先选择有效父层。',
      reasonShort: '该约束需父层',
    };
  }

  if (layerType === 'translation') {
    if (!hasTranscription) {
      return {
        allowed: false,
        reasonCode: 'missing-transcription',
        reason: '请先创建转写层，翻译层依赖转写层。',
        reasonShort: '需先有转写层',
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
      reason: `该语言已存在${oppositeTypeLabel}层，禁止与${sameTypeLabel}层同语言。`,
      reasonShort: `与${oppositeTypeLabel}层语言冲突`,
    };
  }

  const hasSameTypeLanguage = layers.some(
    (l) => l.layerType === layerType && normalizeLanguageId(l.languageId) === languageId,
  );
  if (hasSameTypeLanguage && alias.length === 0) {
    return {
      allowed: false,
      reasonCode: 'duplicate-same-type-without-alias',
      reason: `该语言已存在${sameTypeLabel}层，请提供别名以区分。`,
      reasonShort: `同语言${sameTypeLabel}已存在，需填别名`,
    };
  }

  return { allowed: true };
}

/**
 * 统一翻译层创建守卫（UI + 后端共用）| Shared translation-create guard (UI + backend)
 */
export function getTranslationCreateGuard(
  layers: LayerDocType[],
  input: { languageId?: string; alias?: string },
): TranslationCreateGuardResult {
  return getLayerCreateGuard(layers, 'translation', input);
}

// ─── 创建约束 | Create constraints ───────────────────────────────────

export function canCreateLayer(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
): CanCreateResult {
  // 翻译层需至少一个转写层存在 | Translation layer requires at least one transcription layer
  if (layerType === 'translation') {
    const hasTranscription = layers.some((l) => l.layerType === 'transcription');
    if (!hasTranscription) {
      return { allowed: false, reason: '请先创建转写层，翻译层依赖转写层。' };
    }
  }

  // 软上限警告 | Soft limit warning
  const existing = layers.filter((l) => l.layerType === layerType);
  const limit = LAYER_SOFT_LIMITS[layerType];
  if (existing.length >= limit) {
    const typeLabel = layerType === 'transcription' ? '转写' : '翻译';
    return {
      allowed: true,
      warning: `当前已有 ${existing.length} 个${typeLabel}层（建议上限 ${limit}），继续创建可能影响性能。`,
    };
  }

  return { allowed: true };
}

// ─── 删除约束 | Delete constraints ───────────────────────────────────

export function canDeleteLayer(
  layers: LayerDocType[],
  layerLinks: LayerLinkDocType[],
  targetLayerId: string,
): CanDeleteResult {
  const target = layers.find((l) => l.id === targetLayerId);
  if (!target) {
    return { allowed: false, reason: '未找到要删除的层。' };
  }

  if (target.layerType === 'transcription') {
    const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');

    // 统计受影响链接（按 transcriptionLayerKey）
    const affectedLinkCount = layerLinks.filter(
      (link) => link.transcriptionLayerKey === target.key,
    ).length;

    // 检测孤立翻译层：只链接到被删转写层的翻译层
    // Detect orphaned translations: those linked ONLY to the target transcription
    const linkedTrlIds = new Set(
      layerLinks
        .filter((link) => link.transcriptionLayerKey === target.key)
        .map((link) => link.layerId),
    );
    const orphanedTranslationIds: string[] = [];
    for (const trlId of linkedTrlIds) {
      const otherLinks = layerLinks.filter(
        (link) => link.layerId === trlId && link.transcriptionLayerKey !== target.key,
      );
      if (otherLinks.length === 0) {
        orphanedTranslationIds.push(trlId);
      }
    }

    // 最近的剩余转写层（重链目标）| Most recent remaining transcription layer (re-link target)
    const remainingTrc = transcriptionLayers
      .filter((l) => l.id !== targetLayerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const result: CanDeleteResult = { allowed: true, affectedLinkCount };
    if (orphanedTranslationIds.length > 0) {
      result.orphanedTranslationIds = orphanedTranslationIds;
      if (remainingTrc) {
        result.relinkTargetKey = remainingTrc.key;
      }
    }
    return result;
  }

  // 翻译层：统计受影响链接 | Translation layer: count affected links
  const affectedLinkCount = layerLinks.filter(
    (link) => link.layerId === targetLayerId,
  ).length;
  return { allowed: true, affectedLinkCount };
}

// ─── 链接查询 | Link queries ─────────────────────────────────────────

/**
 * 获取某一层的所有关联层 ID
 * Get all linked layer IDs for a given layer
 */
export function getLinkedLayers(
  layerLinks: LayerLinkDocType[],
  layers: LayerDocType[],
  layerId: string,
): LayerDocType[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return [];

  if (target.layerType === 'transcription') {
    // 转写层 → 找关联的翻译层 | Transcription → find linked translations
    const linkedTranslationIds = new Set(
      layerLinks
        .filter((link) => link.transcriptionLayerKey === target.key)
        .map((link) => link.layerId),
    );
    return layers.filter((l) => linkedTranslationIds.has(l.id));
  }

  // 翻译层 → 找关联的转写层 | Translation → find linked transcriptions
  const linkedTrcKeys = new Set(
    layerLinks
      .filter((link) => link.layerId === layerId)
      .map((link) => link.transcriptionLayerKey),
  );
  return layers.filter((l) => linkedTrcKeys.has(l.key));
}

/**
 * 获取最近创建的对侧类型层（按 createdAt 降序）
 * Get the most recently created layer of the opposite type
 */
export function getMostRecentLayerOfType(
  layers: LayerDocType[],
  layerType: 'transcription' | 'translation',
): LayerDocType | undefined {
  return layers
    .filter((l) => l.layerType === layerType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
