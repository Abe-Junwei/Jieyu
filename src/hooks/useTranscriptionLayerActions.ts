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
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import {
  computeCanonicalLayerOrder,
  resolveLayerDrop,
} from '../services/LayerOrderingService';
import {
  createLayerLink,
} from '../services/LayerIdBridgeService';
import { listUtteranceTextsByUtterances } from '../services/LayerSegmentationTextService';
import {
  deleteLayerSegmentGraphByLayerId,
} from '../services/LayerSegmentGraphService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';

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
  const syncTranslationParentLinks = useCallback(async (
    previousLayers: LayerDocType[],
    nextLayers: LayerDocType[],
  ): Promise<LayerLinkDocType[] | null> => {
    const previousById = new Map(previousLayers.map((layer) => [layer.id, layer] as const));
    const nextById = new Map(nextLayers.map((layer) => [layer.id, layer] as const));
    let nextLayerLinks = [...layerLinks];
    let changed = false;

    const reparentedTranslations = nextLayers.filter((layer) => {
      if (layer.layerType !== 'translation') return false;
      const previous = previousById.get(layer.id);
      if (!previous) return false;
      return (previous.parentLayerId ?? '') !== (layer.parentLayerId ?? '');
    });

    if (reparentedTranslations.length === 0) {
      return null;
    }

    const db = await getDb();
    const now = new Date().toISOString();

    for (const layer of reparentedTranslations) {
      const previous = previousById.get(layer.id);
      if (!previous) continue;

      const previousParent = previous.parentLayerId ? previousById.get(previous.parentLayerId) : undefined;
      const nextParent = layer.parentLayerId ? nextById.get(layer.parentLayerId) : undefined;
      const previousParentKey = previousParent?.key;
      const nextParentKey = nextParent?.key;

      if (previousParentKey) {
        const removableLinks = nextLayerLinks.filter(
          (link) => link.layerId === layer.id && link.transcriptionLayerKey === previousParentKey,
        );
        if (removableLinks.length > 0) {
          await Promise.all(removableLinks.map((link) => db.collections.layer_links.remove(link.id)));
          const removableIds = new Set(removableLinks.map((link) => link.id));
          nextLayerLinks = nextLayerLinks.filter((link) => !removableIds.has(link.id));
          changed = true;
        }
      }

      if (!nextParentKey) {
        continue;
      }

      const alreadyLinked = nextLayerLinks.some(
        (link) => link.layerId === layer.id && link.transcriptionLayerKey === nextParentKey,
      );
      if (alreadyLinked) {
        continue;
      }

      const newLink = createLayerLink({
        id: newId('link'),
        transcriptionLayerKey: nextParentKey,
        targetLayerId: layer.id,
        createdAt: now,
      });
      await db.collections.layer_links.insert(newLink);
      nextLayerLinks = [...nextLayerLinks, newLink];
      changed = true;
    }

    return changed ? nextLayerLinks : null;
  }, [layerLinks]);

  const persistLayerState = useCallback(async (previousLayers: LayerDocType[], nextLayers: LayerDocType[]) => {
    const previousById = new Map(previousLayers.map((layer) => [layer.id, layer] as const));
    const db = await getDb();

    for (const layer of nextLayers) {
      const previous = previousById.get(layer.id);
      if (!previous) continue;

      const parentChanged = (previous.parentLayerId ?? '') !== (layer.parentLayerId ?? '');
      const sortChanged = (previous.sortOrder ?? 0) !== (layer.sortOrder ?? 0);
      if (!parentChanged && !sortChanged) continue;

      if (parentChanged) {
        await LayerTierUnifiedService.updateLayer({
          ...layer,
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      await LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0, db);
    }
  }, []);

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
    const requestedParentLayerId = input.parentLayerId?.trim();

    if (!languageId) {
      setLayerCreateMessage('请选择语言。');
      return false;
    }

    const hasExistingTranscriptionLayer = layers.some((layer) => layer.layerType === 'transcription');
    const resolvedConstraint = input.constraint
      ?? (layerType === 'transcription' && !hasExistingTranscriptionLayer ? 'independent_boundary' : undefined);
    const independentParentCandidates = listIndependentBoundaryTranscriptionLayers(layers);
    const resolvedParent = resolvedConstraint !== 'independent_boundary'
      ? (requestedParentLayerId
        ? independentParentCandidates.find((layer) => layer.id === requestedParentLayerId)
        : independentParentCandidates.length === 1
          ? independentParentCandidates[0]
          : undefined)
      : undefined;
    const resolvedParentLayerId = resolvedParent?.id ?? requestedParentLayerId;

    const createGuard = getLayerCreateGuard(layers, layerType, {
      languageId,
      alias,
      ...(resolvedConstraint !== undefined ? { constraint: resolvedConstraint } : {}),
      ...(resolvedParentLayerId ? { parentLayerId: resolvedParentLayerId } : {}),
      hasSupportedParent: independentParentCandidates.length > 0,
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
        ...(resolvedParentLayerId ? { parentLayerId: resolvedParentLayerId } : {}),
        createdAt: now,
        updatedAt: now,
      } as LayerDocType;

      pushUndo(`创建${typeLabel}层`);
      await LayerTierUnifiedService.createLayer(newLayer);

      let autoLink: LayerLinkDocType | undefined;
      if (layerType === 'translation') {
        if (resolvedParent) {
          autoLink = createLayerLink({
            id: newId('link'),
            transcriptionLayerKey: resolvedParent.key,
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

      const nextLayers = computeCanonicalLayerOrder([...layers, newLayer]);
      await persistLayerState([...layers, newLayer], nextLayers);

      setSelectedLayerId(id);
      setLayers(nextLayers);
      if (autoLink) {
        setLayerLinks((prev) => [...prev, autoLink]);
      }

      setLayerCreateMessage(`已创建${typeLabel}层：${autoName}（${languageId}）`);
      return true;
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '创建层失败');
      return false;
    }
  }, [layers, persistLayerState, pushUndo, setLayerCreateMessage, setLayerLinks, setLayers, setSelectedLayerId, utterancesRef]);

  /** 检查层是否有文本内容（用于判断是否需要确认） */
  const checkLayerHasContent = useCallback(async (layerId: string): Promise<number> => {
    return LayerSegmentQueryService.countSegmentContentsByLayerId(layerId);
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

      const affectedByProjectScope = (!keepUtterances && isDeletingLastTranscription)
        ? ((await db.dexie.utterances.where('textId').equals(targetLayer.textId).primaryKeys()) as string[])
        : [];
      const { affectedUtteranceIds: affectedByLayerTexts } = await deleteLayerSegmentGraphByLayerId(db, effectiveLayerId);
      const affectedUtteranceIds = !keepUtterances
        ? [...new Set([...affectedByLayerTexts, ...affectedByProjectScope])]
        : [];

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

  const reorderLayers = useCallback(async (draggedLayerId: string, targetIndex: number) => {
    const resolved = resolveLayerDrop(layers, draggedLayerId, targetIndex);
    if (!resolved.changed) {
      if (resolved.message) {
        setLayerCreateMessage(resolved.message);
      }
      return;
    }

    try {
      await persistLayerState(layers, resolved.layers);
      const nextLayerLinks = await syncTranslationParentLinks(layers, resolved.layers);
      setLayers(resolved.layers);
      if (nextLayerLinks) {
        setLayerLinks(nextLayerLinks);
      }
      if (resolved.message) {
        setLayerCreateMessage(resolved.message);
      }
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '层级重排失败');
    }
  }, [layers, persistLayerState, setLayerCreateMessage, setLayerLinks, setLayers, syncTranslationParentLinks]);

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
