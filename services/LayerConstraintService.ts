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
  type TranslationLayerDocType,
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

// ─── 创建约束 | Create constraints ───────────────────────────────────

export function canCreateLayer(
  layers: TranslationLayerDocType[],
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
  layers: TranslationLayerDocType[],
  layerLinks: LayerLinkDocType[],
  targetLayerId: string,
): CanDeleteResult {
  const target = layers.find((l) => l.id === targetLayerId);
  if (!target) {
    return { allowed: false, reason: '未找到要删除的层。' };
  }

  if (target.layerType === 'transcription') {
    const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');
    const translationLayers = layers.filter((l) => l.layerType === 'translation');

    // 禁止删除最后一个转写层（如果还有翻译层存在）
    // Prevent deleting last transcription layer if translation layers exist
    if (transcriptionLayers.length <= 1 && translationLayers.length > 0) {
      return {
        allowed: false,
        reason: '无法删除最后一个转写层，因为仍有翻译层依赖它。请先删除所有翻译层。',
      };
    }

    // 统计受影响链接（按 transcriptionLayerKey）
    const affectedLinkCount = layerLinks.filter(
      (link) => link.transcriptionLayerKey === target.key,
    ).length;

    // 检测孤立翻译层：只链接到被删转写层的翻译层
    // Detect orphaned translations: those linked ONLY to the target transcription
    const linkedTrlIds = new Set(
      layerLinks
        .filter((link) => link.transcriptionLayerKey === target.key)
        .map((link) => link.tierId),
    );
    const orphanedTranslationIds: string[] = [];
    for (const trlId of linkedTrlIds) {
      const otherLinks = layerLinks.filter(
        (link) => link.tierId === trlId && link.transcriptionLayerKey !== target.key,
      );
      if (otherLinks.length === 0) {
        orphanedTranslationIds.push(trlId);
      }
    }

    // 最近的剩余转写层（重链目标）
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

  // 翻译层：统计受影响链接
  const affectedLinkCount = layerLinks.filter(
    (link) => link.tierId === targetLayerId,
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
  layers: TranslationLayerDocType[],
  layerId: string,
): TranslationLayerDocType[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return [];

  if (target.layerType === 'transcription') {
    // 转写层 → 找关联的翻译层 | Transcription → find linked translations
    const linkedTranslationIds = new Set(
      layerLinks
        .filter((link) => link.transcriptionLayerKey === target.key)
        .map((link) => link.tierId),
    );
    return layers.filter((l) => linkedTranslationIds.has(l.id));
  }

  // 翻译层 → 找关联的转写层 | Translation → find linked transcriptions
  const linkedTrcKeys = new Set(
    layerLinks
      .filter((link) => link.tierId === layerId)
      .map((link) => link.transcriptionLayerKey),
  );
  return layers.filter((l) => linkedTrcKeys.has(l.key));
}

/**
 * 获取最近创建的对侧类型层（按 createdAt 降序）
 * Get the most recently created layer of the opposite type
 */
export function getMostRecentLayerOfType(
  layers: TranslationLayerDocType[],
  layerType: 'transcription' | 'translation',
): TranslationLayerDocType | undefined {
  return layers
    .filter((l) => l.layerType === layerType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
