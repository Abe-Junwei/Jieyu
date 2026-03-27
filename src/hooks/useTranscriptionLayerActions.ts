import { useCallback } from 'react';
import { getDb } from '../db';
import type {
  LayerLinkDocType,
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { LinguisticService } from '../services/LinguisticService';
import { newId } from '../utils/transcriptionFormatters';
import type { LayerCreateInput, TimelineUnit } from './transcriptionTypes';
import {
  canCreateLayer,
  canDeleteLayer,
  getLayerCreateGuard,
  getMostRecentLayerOfType,
} from '../services/LayerConstraintService';
import {
  createLayerLink,
} from '../services/LayerIdBridgeService';
import { listUtteranceTextsByUtterances } from '../services/LayerSegmentationTextService';

export type TranscriptionLayerActionsParams = {
  layers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  layerToDeleteId: string;
  selectedLayerId: string;
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  pushUndo: (label: string) => void;
  setLayerCreateMessage: React.Dispatch<React.SetStateAction<string>>;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayerToDeleteId: React.Dispatch<React.SetStateAction<string>>;
  setShowLayerManager: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setSelectedUtteranceIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
};

type DeleteLayerOptions = {
  /** 保留关联语段 | Keep associated utterances */
  keepUtterances?: boolean;
};

type PerformLayerDeleteOptions = DeleteLayerOptions & {
  /** 静默执行，不更新弹窗与提示文案 | Silent mode: don't update dialog/message state */
  silent?: boolean;
  /** 跳过 undo 记录，用于级联子删除 | Skip undo record for cascaded child deletions */
  skipUndo?: boolean;
  /** 级联删除的翻译层数量（仅用于最终提示）| Number of cascaded translation deletions (for final message only) */
  cascadedTranslationCount?: number;
};

export function useTranscriptionLayerActions({
  layers,
  layerLinks,
  layerToDeleteId,
  selectedLayerId,
  utterancesRef,
  pushUndo,
  setLayerCreateMessage,
  setLayers,
  setLayerLinks,
  setLayerToDeleteId,
  setShowLayerManager,
  setSelectedLayerId,
  setSelectedMediaId,
  setMediaItems,
  setSelectedUtteranceIds,
  setSelectedTimelineUnit,
  setTranslations,
  setUtterances,
}: TranscriptionLayerActionsParams) {
  const clearTimelineSelection = useCallback(() => {
    setSelectedUtteranceIds?.(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const createLayer = useCallback(async (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ): Promise<boolean> => {
    const languageId = input.languageId.trim();
    const alias = (input.alias ?? '').trim();

    if (!languageId) {
      setLayerCreateMessage('请选择语言。');
      return false;
    }

    const hasExistingTranscriptionLayer = layers.some((layer) => layer.layerType === 'transcription');
    const resolvedConstraint = input.constraint
      ?? (layerType === 'transcription' && !hasExistingTranscriptionLayer ? 'independent_boundary' : undefined);

    const inferredParent = layerType === 'translation'
      ? getMostRecentLayerOfType(layers, 'transcription')
      : (resolvedConstraint && resolvedConstraint !== 'independent_boundary'
        ? getMostRecentLayerOfType(layers, 'transcription')
        : undefined);

    const createGuard = getLayerCreateGuard(layers, layerType, {
      languageId,
      alias,
      ...(resolvedConstraint !== undefined ? { constraint: resolvedConstraint } : {}),
      ...(inferredParent?.id ? { parentLayerId: inferredParent.id } : {}),
      hasSupportedParent: Boolean(inferredParent),
    });
    if (!createGuard.allowed) {
      setLayerCreateMessage(createGuard.reason ?? '当前无法创建该层。');
      return false;
    }

    const constraint = canCreateLayer(layers, layerType);
    if (!constraint.allowed) {
      setLayerCreateMessage(constraint.reason!);
      return false;
    }
    if (constraint.warning) {
      console.warn('[LayerConstraint]', constraint.warning);
    }

    const suffix = Math.random().toString(36).slice(2, 7);
    const key = `${layerType === 'transcription' ? 'trc' : 'trl'}_${languageId}_${suffix}`;
    const effectiveModality = layerType === 'transcription' ? 'text' : (modality ?? 'text');
    const typeLabel = layerType === 'transcription' ? '转写' : '翻译';
    const autoName = alias ? `${typeLabel} · ${alias}` : typeLabel;

    // Compute sortOrder: append to end of appropriate section
    const existingOfType = layers.filter((l) => l.layerType === layerType);
    const maxSortOrder = existingOfType.reduce((max, l) => Math.max(max, l.sortOrder ?? 0), -1);
    const newSortOrder = maxSortOrder + 1;

    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const id = newId('layer');
      const textId = input.textId?.trim() || utterancesRef.current[0]?.textId || layers[0]?.textId || '';
      if (!textId) {
        setLayerCreateMessage('未找到当前项目上下文，请先进入目标项目后再创建层。');
        return false;
      }
      const newLayer: LayerDocType = {
        id,
        textId,
        key,
        name: {
          zho: autoName,
        },
        layerType,
        languageId,
        modality: effectiveModality,
        acceptsAudio: effectiveModality !== 'text',
        sortOrder: newSortOrder,
        ...(resolvedConstraint !== undefined ? { constraint: resolvedConstraint } : {}),
        ...(inferredParent ? { parentLayerId: inferredParent.id } : {}),
        createdAt: now,
        updatedAt: now,
      } as LayerDocType;

      pushUndo(`创建${typeLabel}层`);
      await LayerTierUnifiedService.createLayer(newLayer);

      let autoLink: LayerLinkDocType | undefined;
      if (layerType === 'translation') {
        if (inferredParent) {
          autoLink = createLayerLink({
            id: newId('link'),
            transcriptionLayerKey: inferredParent.key,
            targetLayerId: id,
            createdAt: now,
          });
          await db.collections.layer_links.insert(autoLink);
        }
      }

      if (layerType === 'transcription') {
        const recentTrl = getMostRecentLayerOfType(layers, 'translation');
        if (recentTrl) {
          autoLink = createLayerLink({
            id: newId('link'),
            transcriptionLayerKey: key,
            targetLayerId: recentTrl.id,
            createdAt: now,
          });
          await db.collections.layer_links.insert(autoLink);
        }
      }

      setSelectedLayerId(id);
      setLayers((prev) => [...prev, newLayer]);
      if (autoLink) {
        setLayerLinks((prev) => [...prev, autoLink]);
      }

      setLayerCreateMessage(`已创建${typeLabel}层：${autoName}（${languageId}）`);
      return true;
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '创建层失败');
      return false;
    }
  }, [layers, pushUndo, setLayerCreateMessage, setLayerLinks, setLayers, setSelectedLayerId, utterancesRef]);

  /** 检查层是否有文本内容（用于判断是否需要确认） */
  const checkLayerHasContent = useCallback(async (layerId: string): Promise<number> => {
    const db = await getDb();
    // Phase 2: V2 单一读路径 | Phase 2: V2 single read path
    return db.dexie.layer_segment_contents.where('layerId').equals(layerId).count();
  }, []);

  /** 执行层的实际删除操作（无确认提示） */
  const performLayerDelete = useCallback(async (targetLayerId: string, options?: PerformLayerDeleteOptions) => {
    const effectiveLayerId = targetLayerId;
    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      if (!options?.silent) {
        setLayerCreateMessage('未找到要删除的层。');
      }
      return;
    }

    const db = await getDb();
    const allLinks = await db.dexie.layer_links.toArray();
    const deleteCheck = canDeleteLayer(layers, allLinks, effectiveLayerId);
    if (!deleteCheck.allowed) {
      if (!options?.silent) {
        setLayerCreateMessage(deleteCheck.reason ?? '当前层无法删除。');
      }
      return;
    }

    const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
    const layerTypeLabel = targetLayer.layerType === 'translation' ? '翻译层' : '转写层';
    const keepUtterances = options?.keepUtterances ?? false;

    try {
      if (!options?.skipUndo) {
        pushUndo(`删除${layerTypeLabel}`);
      }

      const isDeletingLastTranscription =
        targetLayer.layerType === 'transcription'
        && layers.filter((item) => item.layerType === 'transcription').length <= 1;

      // Phase 2: 从 V2 layer_segments 获取受影响的 utteranceId | Phase 2: get affected utteranceIds from V2 layer_segments
      const affectedByLayerTexts = keepUtterances
        ? []
        : [...new Set(
            (await db.dexie.layer_segments.where('layerId').equals(effectiveLayerId).toArray())
              .map((s) => s.utteranceId)
              .filter((id): id is string => Boolean(id)),
          )];

      const affectedByProjectScope = (!keepUtterances && isDeletingLastTranscription)
        ? ((await db.dexie.utterances.where('textId').equals(targetLayer.textId).primaryKeys()) as string[])
        : [];

      const affectedUtteranceIds = [...new Set([...affectedByLayerTexts, ...affectedByProjectScope])];

      // V2 cascade handles full cleanup (layer_segments → layer_segment_contents → segment_links)
      // Phase 1 之后 V1 无新写入，无需额外清理 | No V1 writes after Phase 1; V1 is now read-only archive
      // Collect segment IDs before deletion so we can clean up referencing links.
      // Note: sourceLayerId/targetLayerId are optional (undefined) on many existing
      // segment_links rows, so we must delete by segmentId ownership — not by layerId.
      const deletedSegmentIds = (await db.dexie.layer_segments
        .where('layerId')
        .equals(effectiveLayerId)
        .primaryKeys()) as string[];

      await db.dexie.layer_segment_contents.where('layerId').equals(effectiveLayerId).delete();
      await db.dexie.layer_segments.where('layerId').equals(effectiveLayerId).delete();

      if (deletedSegmentIds.length > 0) {
        const sourceLinkIds = (await db.dexie.segment_links
          .where('sourceSegmentId')
          .anyOf(deletedSegmentIds)
          .primaryKeys()) as string[];
        const targetLinkIds = (await db.dexie.segment_links
          .where('targetSegmentId')
          .anyOf(deletedSegmentIds)
          .primaryKeys()) as string[];
        const linksToDelete = [...new Set([...sourceLinkIds, ...targetLinkIds])];
        if (linksToDelete.length > 0) {
          await db.dexie.segment_links.bulkDelete(linksToDelete);
        }
      }

      const newAutoLinks: LayerLinkDocType[] = [];
      if (targetLayer.layerType === 'transcription') {
        if (deleteCheck.orphanedTranslationIds && deleteCheck.relinkTargetKey) {
          const now = new Date().toISOString();
          for (const trlId of deleteCheck.orphanedTranslationIds) {
            const relink = createLayerLink({
              id: newId('link'),
              transcriptionLayerKey: deleteCheck.relinkTargetKey,
              targetLayerId: trlId,
              createdAt: now,
            });
            await db.collections.layer_links.insert(relink);
            newAutoLinks.push(relink);
          }
        }
        await db.collections.layer_links.removeBySelector({ transcriptionLayerKey: targetLayer.key });
      } else {
        await db.collections.layer_links.removeBySelector({ layerId: effectiveLayerId });
      }
      await LayerTierUnifiedService.deleteLayer(targetLayer);

      let removedUtteranceIds = new Set<string>();
      if (!keepUtterances && affectedUtteranceIds.length > 0) {
        const uniqueIds = [...new Set(affectedUtteranceIds)];
        const remainingTexts = await listUtteranceTextsByUtterances(db, uniqueIds);
        const stillReferencedIds = new Set(remainingTexts.map((d) => d.utteranceId));
        const orphanIds = uniqueIds.filter((id) => !stillReferencedIds.has(id));
        if (orphanIds.length > 0) {
          await LinguisticService.removeUtterancesBatch(orphanIds);
          removedUtteranceIds = new Set(orphanIds);
        }
      }

      if (selectedLayerId === effectiveLayerId) {
        setSelectedLayerId('');
      }

      setLayers((prev) => prev.filter((item) => item.id !== effectiveLayerId));
      setTranslations((prev) => prev.filter((item) => item.layerId !== effectiveLayerId));
      if (removedUtteranceIds.size > 0) {
        setUtterances((prev) => prev.filter((u) => !removedUtteranceIds.has(u.id)));
      }
      if (targetLayer.layerType === 'transcription') {
        setLayerLinks((prev) => [
          ...prev.filter((item) => item.transcriptionLayerKey !== targetLayer.key),
          ...newAutoLinks,
        ]);
      } else {
        setLayerLinks((prev) => prev.filter((item) => item.layerId !== effectiveLayerId));
      }
      if (!options?.silent) {
        setLayerToDeleteId('');
        setShowLayerManager(false);
        const removedCount = removedUtteranceIds.size;
        const cascadedCount = options?.cascadedTranslationCount ?? 0;
        const cascadedNote = cascadedCount > 0
          ? `（自动级联删除 ${cascadedCount} 个依赖翻译层）`
          : '';
        setLayerCreateMessage(removedCount > 0
          ? `已删除层：${layerLabel}${cascadedNote}（同时清除 ${removedCount} 个孤立语段）`
          : `已删除层：${layerLabel}${cascadedNote}`);
      }
    } catch (error) {
      if (options?.silent) {
        throw (error instanceof Error ? error : new Error('删除层失败'));
      }
      if (!options?.silent) {
        setLayerCreateMessage(error instanceof Error ? error.message : '删除层失败');
      }
    }
  }, [layers, pushUndo, selectedLayerId, setLayerCreateMessage, setLayerLinks, setLayerToDeleteId, setLayers, setSelectedLayerId, setShowLayerManager, setTranslations, setUtterances]);

  /** 删除层，不弹出浏览器确认（用于已通过自定义确认对话框的用户） */
  const deleteLayerWithoutConfirm = useCallback(async (targetLayerId: string) => {
    return performLayerDelete(targetLayerId);
  }, [performLayerDelete]);

  const deleteLayer = useCallback(async (targetLayerId?: string, options?: DeleteLayerOptions) => {
    const effectiveLayerId = targetLayerId ?? layerToDeleteId;
    if (!effectiveLayerId) {
      setLayerCreateMessage('请先选择要删除的层。');
      return;
    }

    const keepUtterances = options?.keepUtterances ?? false;
    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      setLayerCreateMessage('未找到要删除的层。');
      return;
    }

    // 删除最后一个转写层时，自动级联删除其依赖翻译层 | When deleting the last transcription layer, cascade-delete dependent translation layers
    if (targetLayer.layerType === 'transcription') {
      const transcriptionLayers = layers.filter((item) => item.layerType === 'transcription');
      if (transcriptionLayers.length <= 1) {
        try {
          const db = await getDb();
          const allLinks = await db.dexie.layer_links.toArray();
          const dependentByLink = allLinks
            .filter((link) => link.transcriptionLayerKey === targetLayer.key)
            .map((link) => link.layerId);
          const dependentByParent = layers
            .filter((layer) => layer.layerType === 'translation' && layer.parentLayerId === targetLayer.id)
            .map((layer) => layer.id);
          const dependentTranslationIds = [...new Set([...dependentByLink, ...dependentByParent])]
            .filter((id) => layers.some((layer) => layer.id === id && layer.layerType === 'translation'));

          for (const dependentTranslationId of dependentTranslationIds) {
            await performLayerDelete(dependentTranslationId, {
              keepUtterances,
              silent: true,
              skipUndo: true,
            });
          }

          await performLayerDelete(effectiveLayerId, {
            keepUtterances,
            cascadedTranslationCount: dependentTranslationIds.length,
          });
          return;
        } catch (error) {
          setLayerCreateMessage(error instanceof Error ? error.message : '删除层失败');
          return;
        }
      }
    }

    await performLayerDelete(effectiveLayerId, { keepUtterances });
  }, [layerToDeleteId, layers, performLayerDelete, setLayerCreateMessage]);

  const toggleLayerLink = useCallback(async (
    transcriptionLayerKey: string,
    layerId: string,
  ) => {
    const db = await getDb();
    const existing = layerLinks.find(
      (link) => link.transcriptionLayerKey === transcriptionLayerKey && link.layerId === layerId,
    );

    if (existing) {
      pushUndo('取消层关联');
      await db.collections.layer_links.remove(existing.id);
      setLayerLinks((prev) => prev.filter((item) => item.id !== existing.id));
    } else {
      pushUndo('建立层关联');
      const now = new Date().toISOString();
      const newLink = createLayerLink({
        id: newId('link'),
        transcriptionLayerKey,
        targetLayerId: layerId,
        createdAt: now,
      });
      await db.collections.layer_links.insert(newLink);
      setLayerLinks((prev) => [...prev, newLink]);
    }
  }, [layerLinks, pushUndo, setLayerLinks]);

  const addMediaItem = useCallback((item: MediaItemDocType) => {
    setMediaItems((prev) => [...prev, item]);
    setSelectedMediaId(item.id);
    clearTimelineSelection();
  }, [clearTimelineSelection, setMediaItems, setSelectedMediaId]);

  /**
   * Reorder layers within their own type section (transcription or translation).
   * Translation layers cannot move above transcription layers.
   */
  const reorderLayers = useCallback(async (draggedLayerId: string, targetIndex: number) => {
    // Current order: transcription layers first, then translation layers
    const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');
    const translationLayers = layers.filter((l) => l.layerType === 'translation');

    const trcCount = transcriptionLayers.length;

    const draggedLayer = layers.find((l) => l.id === draggedLayerId);
    if (!draggedLayer) return;

    let reorderedLayers: LayerDocType[];

    if (draggedLayer.layerType === 'transcription') {
      // Can only reorder within transcription section
      const sorted = [...transcriptionLayers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const currentIndex = sorted.findIndex((l) => l.id === draggedLayerId);
      if (currentIndex === -1) return;

      // Clamp target to valid range
      const clampedTarget = Math.max(0, Math.min(targetIndex, trcCount - 1));
      if (clampedTarget === currentIndex) return;

      // Reorder in memory
      sorted.splice(currentIndex, 1);
      sorted.splice(clampedTarget, 0, draggedLayer);

      // Assign new sortOrder values to transcription layers
      const updates: Array<{ layer: LayerDocType; sortOrder: number }> = sorted.map((l, i) => ({
        layer: l,
        sortOrder: i,
      }));

      // Translation layers keep their relative order (and their sortOrder offset)
      translationLayers.forEach((l, i) => {
        updates.push({ layer: l, sortOrder: trcCount + i });
      });

      // Build new layers array
      const trcSortMap = new Map(updates.slice(0, trcCount).map((u) => [u.layer.id, u.sortOrder]));
      const trlSortMap = new Map(updates.slice(trcCount).map((u) => [u.layer.id, u.sortOrder]));

      reorderedLayers = layers.map((l) => {
        if (trcSortMap.has(l.id)) {
          return { ...l, sortOrder: trcSortMap.get(l.id)! };
        }
        if (trlSortMap.has(l.id)) {
          return { ...l, sortOrder: trlSortMap.get(l.id)! };
        }
        return l;
      });
    } else {
      // Translation layer - can only reorder within translation section
      const sorted = [...translationLayers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const currentIndex = sorted.findIndex((l) => l.id === draggedLayerId);
      if (currentIndex === -1) return;

      const trlCount = translationLayers.length;
      // Clamp target to valid range within translation section
      const clampedTarget = Math.max(0, Math.min(targetIndex, trlCount - 1));
      if (clampedTarget === currentIndex) return;

      // Reorder in memory
      sorted.splice(currentIndex, 1);
      sorted.splice(clampedTarget, 0, draggedLayer);

      // Assign new sortOrder values
      const updates: Array<{ layer: LayerDocType; sortOrder: number }> = [];

      // Transcription layers keep their relative order
      transcriptionLayers.forEach((l, i) => {
        updates.push({ layer: l, sortOrder: i });
      });

      // Translation layers reordered
      sorted.forEach((l, i) => {
        updates.push({ layer: l, sortOrder: trcCount + i });
      });

      const trcSortMap = new Map(updates.slice(0, trcCount).map((u) => [u.layer.id, u.sortOrder]));
      const trlSortMap = new Map(updates.slice(trcCount).map((u) => [u.layer.id, u.sortOrder]));

      reorderedLayers = layers.map((l) => {
        if (trcSortMap.has(l.id)) {
          return { ...l, sortOrder: trcSortMap.get(l.id)! };
        }
        if (trlSortMap.has(l.id)) {
          return { ...l, sortOrder: trlSortMap.get(l.id)! };
        }
        return l;
      });
    }

    // Persist sortOrder updates to database
    // 一次获取 db，避免循环内重复调用 getDb | Acquire db once to avoid repeated getDb calls in loop
    const db = await getDb();
    for (const layer of reorderedLayers) {
      const original = layers.find((l) => l.id === layer.id);
      if (original && original.sortOrder !== layer.sortOrder) {
        await LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0, db);
      }
    }

    // Update state
    setLayers(reorderedLayers);
  }, [layers, setLayers]);

  return {
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    addMediaItem,
    reorderLayers,
  };
}
