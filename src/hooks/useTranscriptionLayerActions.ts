import { useCallback } from 'react';
import { getDb } from '../../db';
import type {
  LayerLinkDocType,
  MediaItemDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../../db';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { newId } from '../utils/transcriptionFormatters';
import type { LayerCreateInput } from './transcriptionTypes';
import { canCreateLayer, canDeleteLayer, getMostRecentLayerOfType } from '../../services/LayerConstraintService';

export type TranscriptionLayerActionsParams = {
  layers: TranslationLayerDocType[];
  layerLinks: LayerLinkDocType[];
  layerToDeleteId: string;
  selectedLayerId: string;
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  pushUndo: (label: string) => void;
  setLayerCreateMessage: React.Dispatch<React.SetStateAction<string>>;
  setLayers: React.Dispatch<React.SetStateAction<TranslationLayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayerToDeleteId: React.Dispatch<React.SetStateAction<string>>;
  setShowLayerManager: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setSelectedUtteranceId: React.Dispatch<React.SetStateAction<string>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
};

type DeleteLayerOptions = {
  skipBrowserConfirm?: boolean;
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
  setSelectedUtteranceId,
  setTranslations,
}: TranscriptionLayerActionsParams) {
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

    const constraint = canCreateLayer(layers, layerType);
    if (!constraint.allowed) {
      setLayerCreateMessage(constraint.reason!);
      return false;
    }
    if (constraint.warning) {
      console.warn('[LayerConstraint]', constraint.warning);
    }

    const existing = layers.find(
      (l) => l.languageId === languageId && l.layerType === layerType,
    );
    if (existing && !alias) {
      const existingLabel = existing.name.zho ?? existing.name.eng ?? existing.key;
      setLayerCreateMessage(
        `该语言已存在同类型层「${existingLabel}」（${existing.key}）。请提供别名以区分。`,
      );
      return false;
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
      const newLayer: TranslationLayerDocType = {
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
        createdAt: now,
        updatedAt: now,
      } as TranslationLayerDocType;

      pushUndo(`创建${typeLabel}层`);
      await LayerTierUnifiedService.createLayer(newLayer);

      let autoLink: LayerLinkDocType | undefined;
      if (layerType === 'translation') {
        const recentTrc = getMostRecentLayerOfType(layers, 'transcription');
        if (recentTrc) {
          autoLink = {
            id: newId('link'),
            transcriptionLayerKey: recentTrc.key,
            tierId: id,
            linkType: 'free',
            isPreferred: false,
            createdAt: now,
          };
          await db.collections.layer_links.insert(autoLink);
        }
      }

      if (layerType === 'transcription') {
        const recentTrl = getMostRecentLayerOfType(layers, 'translation');
        if (recentTrl) {
          autoLink = {
            id: newId('link'),
            transcriptionLayerKey: key,
            tierId: recentTrl.id,
            linkType: 'free',
            isPreferred: false,
            createdAt: now,
          };
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

  const deleteLayer = useCallback(async (targetLayerId?: string, options?: DeleteLayerOptions) => {
    const effectiveLayerId = targetLayerId ?? layerToDeleteId;
    if (!effectiveLayerId) {
      setLayerCreateMessage('请先选择要删除的层。');
      return;
    }

    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      setLayerCreateMessage('未找到要删除的层。');
      return;
    }

    const db = await getDb();
    const allLinkDocs = await db.collections.layer_links.find().exec();
    const allLinks = allLinkDocs.map((d) => d.toJSON()) as unknown as LayerLinkDocType[];
    const deleteCheck = canDeleteLayer(layers, allLinks, effectiveLayerId);
    if (!deleteCheck.allowed) {
      setLayerCreateMessage(deleteCheck.reason!);
      return;
    }

    const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
    const layerTypeLabel = targetLayer.layerType === 'translation' ? '翻译层' : '转写层';
    const translationDocs = await db.collections.utterance_texts.find().exec();
    const translationCount = translationDocs.filter(
      (d) => (d.toJSON() as unknown as { tierId: string }).tierId === effectiveLayerId,
    ).length;

    const depLines = [
      translationCount > 0 ? `翻译记录：${translationCount} 条` : '',
      (deleteCheck.affectedLinkCount ?? 0) > 0 ? `关联链接：${deleteCheck.affectedLinkCount} 条` : '',
    ].filter(Boolean);

    if (deleteCheck.orphanedTranslationIds && deleteCheck.orphanedTranslationIds.length > 0) {
      const orphanLabels = deleteCheck.orphanedTranslationIds.map((id) => {
        const l = layers.find((layer) => layer.id === id);
        return l ? (l.name.zho ?? l.name.eng ?? l.key) : id;
      });
      const relinkTarget = layers.find((l) => l.key === deleteCheck.relinkTargetKey);
      const relinkLabel = relinkTarget ? (relinkTarget.name.zho ?? relinkTarget.name.eng ?? relinkTarget.key) : deleteCheck.relinkTargetKey;
      depLines.push(`将自动重链接翻译层 [${orphanLabels.join(', ')}] → ${relinkLabel}`);
    }

    const depInfo = depLines.length > 0 ? `\n\n关联数据：\n${depLines.join('\n')}` : '';
    if (!options?.skipBrowserConfirm) {
      const confirmed = window.confirm(
        `确认删除层"${layerLabel}"吗？\n\n类型：${layerTypeLabel}\n键名：${targetLayer.key}${depInfo}\n\n将同时删除该层下全部文本/录音记录以及关联链接。可通过Ctrl+Z撤销。`,
      );
      if (!confirmed) return;
    }

    try {
      pushUndo(`删除${layerTypeLabel}`);
      await db.collections.utterance_texts.removeBySelector({ tierId: effectiveLayerId });

      const newAutoLinks: LayerLinkDocType[] = [];
      if (targetLayer.layerType === 'transcription') {
        if (deleteCheck.orphanedTranslationIds && deleteCheck.relinkTargetKey) {
          const now = new Date().toISOString();
          for (const trlId of deleteCheck.orphanedTranslationIds) {
            const relink: LayerLinkDocType = {
              id: newId('link'),
              transcriptionLayerKey: deleteCheck.relinkTargetKey,
              tierId: trlId,
              linkType: 'free',
              isPreferred: false,
              createdAt: now,
            };
            await db.collections.layer_links.insert(relink);
            newAutoLinks.push(relink);
          }
        }
        await db.collections.layer_links.removeBySelector({ transcriptionLayerKey: targetLayer.key });
      } else {
        await db.collections.layer_links.removeBySelector({ tierId: effectiveLayerId });
      }
      await LayerTierUnifiedService.deleteLayer(targetLayer);

      if (selectedLayerId === effectiveLayerId) {
        setSelectedLayerId('');
      }

      setLayers((prev) => prev.filter((item) => item.id !== effectiveLayerId));
      setTranslations((prev) => prev.filter((item) => item.tierId !== effectiveLayerId));
      if (targetLayer.layerType === 'transcription') {
        setLayerLinks((prev) => [
          ...prev.filter((item) => item.transcriptionLayerKey !== targetLayer.key),
          ...newAutoLinks,
        ]);
      } else {
        setLayerLinks((prev) => prev.filter((item) => item.tierId !== effectiveLayerId));
      }
      setLayerToDeleteId('');
      setShowLayerManager(false);
      setLayerCreateMessage(`已删除层：${layerLabel}`);
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '删除层失败');
    }
  }, [layerToDeleteId, layers, pushUndo, selectedLayerId, setLayerCreateMessage, setLayerLinks, setLayerToDeleteId, setLayers, setSelectedLayerId, setShowLayerManager, setTranslations]);

  const toggleLayerLink = useCallback(async (
    transcriptionLayerKey: string,
    tierId: string,
  ) => {
    const db = await getDb();
    const existing = layerLinks.find(
      (link) => link.transcriptionLayerKey === transcriptionLayerKey
        && link.tierId === tierId,
    );

    if (existing) {
      pushUndo('取消层关联');
      await db.collections.layer_links.remove(existing.id);
      setLayerLinks((prev) => prev.filter((item) => item.id !== existing.id));
    } else {
      pushUndo('建立层关联');
      const now = new Date().toISOString();
      const newLink: LayerLinkDocType = {
        id: newId('link'),
        transcriptionLayerKey,
        tierId,
        linkType: 'free',
        isPreferred: false,
        createdAt: now,
      };
      await db.collections.layer_links.insert(newLink);
      setLayerLinks((prev) => [...prev, newLink]);
    }
  }, [layerLinks, pushUndo, setLayerLinks]);

  const addMediaItem = useCallback((item: MediaItemDocType) => {
    setMediaItems((prev) => [...prev, item]);
    setSelectedMediaId(item.id);
    setSelectedUtteranceId('');
  }, [setMediaItems, setSelectedMediaId, setSelectedUtteranceId]);

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

    let reorderedLayers: TranslationLayerDocType[];

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
      const updates: Array<{ layer: TranslationLayerDocType; sortOrder: number }> = sorted.map((l, i) => ({
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
      const updates: Array<{ layer: TranslationLayerDocType; sortOrder: number }> = [];

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
    for (const layer of reorderedLayers) {
      const original = layers.find((l) => l.id === layer.id);
      if (original && original.sortOrder !== layer.sortOrder) {
        await LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0);
      }
    }

    // Update state
    setLayers(reorderedLayers);
  }, [layers, setLayers]);

  return {
    createLayer,
    deleteLayer,
    toggleLayerLink,
    addMediaItem,
    reorderLayers,
  };
}
