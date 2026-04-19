import { useCallback } from 'react';
import { getDb } from '../db';
import type { LayerLinkDocType, MediaItemDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { LinguisticService } from '../services/LinguisticService';
import { newId } from '../utils/transcriptionFormatters';
import type { LayerCreateInput, SaveState, TimelineUnit } from './transcriptionTypes';
import { canCreateLayer, canDeleteLayer, getLayerCreateGuard, listIndependentBoundaryTranscriptionLayers } from '../services/LayerConstraintService';
import { computeCanonicalLayerOrder, resolveLayerDrop } from '../services/LayerOrderingService';
import { createLayerLink } from '../services/LayerIdBridgeService';
import { listUnitTextsByUnits } from '../services/LayerSegmentationTextService';
import { deleteLayerSegmentGraphByLayerId, listUnitUnitPrimaryKeysByTextId } from '../services/LayerSegmentGraphService';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { createLogger } from '../observability/logger';
import { t, useLocale } from '../i18n';

const log = createLogger('useTranscriptionLayerActions');

export type TranscriptionLayerActionsParams = {
  layers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  layerToDeleteId: string;
  selectedLayerId: string;
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  pushUndo: (label: string) => void;
  setLayerCreateMessage: React.Dispatch<React.SetStateAction<string>>;
  setSaveState?: React.Dispatch<React.SetStateAction<SaveState>>;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayerToDeleteId: React.Dispatch<React.SetStateAction<string>>;
  setShowLayerManager: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setSelectedUnitIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
};

type DeleteLayerOptions = {
  /** Keep associated units. */
  keepUnits?: boolean;
};

type PerformLayerDeleteOptions = DeleteLayerOptions & {
  /** Silent mode: do not update dialog or toast/message state. */
  silent?: boolean;
  /** Skip undo tracking for cascaded child deletions. */
  skipUndo?: boolean;
  /** Number of cascaded translation deletions, used only in the final message. */
  cascadedTranslationCount?: number;
};

export function useTranscriptionLayerActions({
  layers,
  layerLinks,
  layerToDeleteId,
  selectedLayerId,
  unitsRef,
  pushUndo,
  setLayerCreateMessage,
  setSaveState,
  setLayers,
  setLayerLinks,
  setLayerToDeleteId,
  setShowLayerManager,
  setSelectedLayerId,
  setSelectedMediaId,
  setMediaItems,
  setSelectedUnitIds,
  setSelectedTimelineUnit,
  setTranslations,
  setUnits,
}: TranscriptionLayerActionsParams) {
  const locale = useLocale();
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

      const nextParent = layer.parentLayerId ? nextById.get(layer.parentLayerId) : undefined;
      const nextParentKey = nextParent?.key;

      const removableLinks = nextLayerLinks.filter((link) => link.layerId === layer.id);
      if (removableLinks.length > 0) {
        await Promise.all(removableLinks.map((link) => db.collections.layer_links.remove(link.id)));
        const removableIds = new Set(removableLinks.map((link) => link.id));
        nextLayerLinks = nextLayerLinks.filter((link) => !removableIds.has(link.id));
        changed = true;
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
        // parentChanged 时 updateLayer 已整行覆盖写入（含 sortOrder），
        // 但仍需检查 sortChanged 以免未来 updateLayerSortOrder 增加额外逻辑时遗漏
        // | updateLayer writes full row (incl. sortOrder), but still check sortChanged
        // to avoid missing future side-effects in updateLayerSortOrder
        if (!sortChanged) continue;
      }

      await LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0, db);
    }
  }, []);

  const clearTimelineSelection = useCallback(() => {
    setSelectedUnitIds?.(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUnitIds]);

  const createLayer = useCallback(async (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ): Promise<boolean> => {
    const languageId = input.languageId.trim();
    const dialect = (input.dialect ?? '').trim();
    const vernacular = (input.vernacular ?? '').trim();
    const orthographyId = input.orthographyId?.trim();
    const alias = (input.alias ?? '').trim();
    const requestedParentLayerId = input.parentLayerId?.trim();

    if (!languageId) {
      setLayerCreateMessage('\u8bf7\u9009\u62e9\u8bed\u8a00\u3002');
      return false;
    }
    if (!isKnownIso639_3Code(languageId)) {
      setLayerCreateMessage('语言代码必须是有效的 ISO 639-3 三字母代码。');
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

    const effectiveModality = modality ?? 'text';
    const createGuard = getLayerCreateGuard(layers, layerType, {
      languageId,
      alias,
      modality: effectiveModality,
      ...(resolvedConstraint !== undefined ? { constraint: resolvedConstraint } : {}),
      ...(resolvedParentLayerId ? { parentLayerId: resolvedParentLayerId } : {}),
      hasSupportedParent: independentParentCandidates.length > 0,
    });
    if (!createGuard.allowed) {
      setLayerCreateMessage(createGuard.reason ?? '\u5f53\u524d\u65e0\u6cd5\u521b\u5efa\u8be5\u5c42\u3002');
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
    const typeLabel = layerType === 'transcription' ? '\u8f6c\u5199' : '\u7ffb\u8bd1';
    const autoName = alias ? `${typeLabel} · ${alias}` : typeLabel;

    const existingOfType = layers.filter((l) => l.layerType === layerType);
    const maxSortOrder = existingOfType.reduce((max, l) => Math.max(max, l.sortOrder ?? 0), -1);
    const newSortOrder = maxSortOrder + 1;

    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const id = newId('layer');
      const textId = input.textId?.trim() || unitsRef.current[0]?.textId || layers[0]?.textId || '';
      if (!textId) {
        setLayerCreateMessage('\u672a\u627e\u5230\u5f53\u524d\u9879\u76ee\u4e0a\u4e0b\u6587\uff0c\u8bf7\u5148\u8fdb\u5165\u76ee\u6807\u9879\u76ee\u540e\u518d\u521b\u5efa\u5c42\u3002');
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
        ...(dialect ? { dialect } : {}),
        ...(vernacular ? { vernacular } : {}),
        ...(orthographyId ? { orthographyId } : {}),
        modality: effectiveModality,
        acceptsAudio: effectiveModality !== 'text',
        sortOrder: newSortOrder,
        ...(resolvedConstraint !== undefined ? { constraint: resolvedConstraint } : {}),
        ...(resolvedParentLayerId ? { parentLayerId: resolvedParentLayerId } : {}),
        createdAt: now,
        updatedAt: now,
      } as LayerDocType;

      pushUndo(layerType === 'transcription'
        ? t(locale, 'transcription.layer.undo.createTranscription')
        : t(locale, 'transcription.layer.undo.createTranslation'));
      await LayerTierUnifiedService.createLayer(newLayer);

      // 尚无转写层时在波形上创建的语段只存在于内存（saveUnit 无法写入 layer_units）。
      // 首个转写层创建后补写 canonical unit，并在独立边界层下为每条有媒体绑定的语段建 segment，供时间轴与波形读取。
      // | Units created on audio before any transcription layer existed were never persisted; after the first
      // transcription layer is created, flush them to the graph and mirror segments for independent-boundary lanes.
      if (layerType === 'transcription' && !hasExistingTranscriptionLayer) {
        const pendingUnits = unitsRef.current.filter((u) => u.textId === textId);
        for (const u of pendingUnits) {
          try {
            await LinguisticService.saveUnit(u);
            if (newLayer.constraint === 'independent_boundary' && u.mediaId?.trim()) {
              const seg: LayerUnitDocType = {
                id: newId('seg'),
                textId: u.textId,
                mediaId: u.mediaId.trim(),
                layerId: id,
                startTime: u.startTime,
                endTime: u.endTime,
                unitId: u.id,
                createdAt: u.createdAt ?? now,
                updatedAt: u.updatedAt ?? now,
                ...(u.speakerId ? { speakerId: u.speakerId } : {}),
              };
              await LayerSegmentationV2Service.createSegment(seg);
            }
          } catch (adoptErr) {
            // 层已写入 DB；此处失败不得阻断 setLayers，否则会出现「库里有层、列表无层、同语言无法再建」。
            // | Layer row is already persisted; failures here must not skip UI updates.
            log.warn('Adopt pending units / mirror segments after first transcription layer failed', {
              unitId: u.id,
              textId: u.textId,
              error: adoptErr instanceof Error ? adoptErr.message : String(adoptErr),
            });
          }
        }
      }

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

      const nextLayers = computeCanonicalLayerOrder([...layers, newLayer]);
      await persistLayerState([...layers, newLayer], nextLayers);

      setSelectedLayerId(id);
      setLayers(nextLayers);
      if (autoLink) {
        setLayerLinks((prev) => [...prev, autoLink]);
      }

      setLayerCreateMessage(`\u5df2\u521b\u5efa${typeLabel}\u5c42\uff1a${autoName}\uff08${languageId}\uff09`);
      return true;
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '\u521b\u5efa\u5c42\u5931\u8d25');
      return false;
    }
  }, [layers, locale, persistLayerState, pushUndo, setLayerCreateMessage, setLayerLinks, setLayers, setSelectedLayerId, unitsRef]);

  /** Check whether the layer contains text content and needs confirmation. */
  const checkLayerHasContent = useCallback(async (layerId: string): Promise<number> => {
    return LayerSegmentQueryService.countSegmentContentsByLayerId(layerId);
  }, []);

  /** Execute the actual layer deletion without a confirmation prompt. */
  const performLayerDelete = useCallback(async (targetLayerId: string, options?: PerformLayerDeleteOptions) => {
    const effectiveLayerId = targetLayerId;
    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      if (!options?.silent) {
        setLayerCreateMessage('\u672a\u627e\u5230\u8981\u5220\u9664\u7684\u5c42\u3002');
      }
      return;
    }

    const db = await getDb();
    const deleteCheck = canDeleteLayer(layers, effectiveLayerId);
    if (!deleteCheck.allowed) {
      if (!options?.silent) {
        setLayerCreateMessage(deleteCheck.reason ?? '\u5f53\u524d\u5c42\u65e0\u6cd5\u5220\u9664\u3002');
      }
      return;
    }

    const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
    const keepUnits = options?.keepUnits ?? false;

    try {
      if (!options?.skipUndo) {
        pushUndo(targetLayer.layerType === 'translation'
          ? t(locale, 'transcription.layer.undo.deleteTranslation')
          : t(locale, 'transcription.layer.undo.deleteTranscription'));
      }

      const isDeletingLastTranscription =
        targetLayer.layerType === 'transcription'
        && layers.filter((item) => item.layerType === 'transcription').length <= 1;

      const affectedByProjectScope = (!keepUnits && isDeletingLastTranscription)
        ? await listUnitUnitPrimaryKeysByTextId(db, targetLayer.textId)
        : [];
      const { affectedUnitIds: affectedByLayerTexts } = await deleteLayerSegmentGraphByLayerId(db, effectiveLayerId);
      const affectedUnitIds = !keepUnits
        ? [...new Set([...affectedByLayerTexts, ...affectedByProjectScope])]
        : [];

      const reparentedLayerById = new Map<string, LayerDocType>();
      let nextLayerLinks = [...layerLinks];
      if (targetLayer.layerType === 'transcription') {
        if (deleteCheck.orphanedTranslationIds && deleteCheck.relinkTargetKey) {
          const now = new Date().toISOString();
          const relinkTargetLayer = layers.find(
            (layer) => layer.layerType === 'transcription' && layer.key === deleteCheck.relinkTargetKey,
          );
          for (const trlId of deleteCheck.orphanedTranslationIds) {
            const translationLayer = layers.find(
              (layer) => layer.id === trlId && layer.layerType === 'translation',
            );
            if (!translationLayer || !relinkTargetLayer) continue;

            const updatedTranslation: LayerDocType = {
              ...translationLayer,
              constraint: 'symbolic_association',
              parentLayerId: relinkTargetLayer.id,
              updatedAt: now,
            };
            await LayerTierUnifiedService.updateLayer(updatedTranslation);
            reparentedLayerById.set(updatedTranslation.id, updatedTranslation);

            const removableLinks = nextLayerLinks.filter((link) => link.layerId === trlId);
            if (removableLinks.length > 0) {
              await Promise.all(removableLinks.map((link) => db.collections.layer_links.remove(link.id)));
              const removableIds = new Set(removableLinks.map((link) => link.id));
              nextLayerLinks = nextLayerLinks.filter((link) => !removableIds.has(link.id));
            }

            const relink = createLayerLink({
              id: newId('link'),
              transcriptionLayerKey: deleteCheck.relinkTargetKey,
              targetLayerId: trlId,
              createdAt: now,
            });
            await db.collections.layer_links.insert(relink);
            nextLayerLinks = [...nextLayerLinks, relink];
          }
        }
        await db.collections.layer_links.removeBySelector({ transcriptionLayerKey: targetLayer.key });
        nextLayerLinks = nextLayerLinks.filter((link) => link.transcriptionLayerKey !== targetLayer.key);
      } else {
        await db.collections.layer_links.removeBySelector({ layerId: effectiveLayerId });
        nextLayerLinks = nextLayerLinks.filter((link) => link.layerId !== effectiveLayerId);
      }
      await LayerTierUnifiedService.deleteLayer(targetLayer);

      let removedUnitIds = new Set<string>();
      if (!keepUnits && affectedUnitIds.length > 0) {
        const uniqueIds = [...new Set(affectedUnitIds)];
        const remainingTexts = await listUnitTextsByUnits(db, uniqueIds);
        const stillReferencedIds = new Set(remainingTexts.map((d) => d.unitId));
        const orphanIds = uniqueIds.filter((id) => !stillReferencedIds.has(id));
        if (orphanIds.length > 0) {
          await LinguisticService.removeUnitsBatch(orphanIds);
          removedUnitIds = new Set(orphanIds);
        }
      }

      if (selectedLayerId === effectiveLayerId) {
        setSelectedLayerId('');
      }

      setLayers((prev) => prev
        .filter((item) => item.id !== effectiveLayerId)
        .map((item) => reparentedLayerById.get(item.id) ?? item));
      setTranslations((prev) => prev.filter((item) => item.layerId !== effectiveLayerId));
      if (removedUnitIds.size > 0) {
        setUnits((prev) => prev.filter((u) => !removedUnitIds.has(u.id)));
      }
      setLayerLinks(nextLayerLinks);
      if (!options?.silent) {
        setLayerToDeleteId('');
        setShowLayerManager(false);
        const removedCount = removedUnitIds.size;
        const cascadedCount = options?.cascadedTranslationCount ?? 0;
        const cascadedNote = cascadedCount > 0
          ? `\uff08\u81ea\u52a8\u7ea7\u8054\u5220\u9664 ${cascadedCount} \u4e2a\u4f9d\u8d56\u7ffb\u8bd1\u5c42\uff09`
          : '';
        setLayerCreateMessage(removedCount > 0
          ? `\u5df2\u5220\u9664\u5c42\uff1a${layerLabel}${cascadedNote}\uff08\u540c\u65f6\u6e05\u9664 ${removedCount} \u4e2a\u5b64\u7acb\u8bed\u6bb5\uff09`
          : `\u5df2\u5220\u9664\u5c42\uff1a${layerLabel}${cascadedNote}`);
      }
    } catch (error) {
      if (options?.silent) {
        throw (error instanceof Error ? error : new Error('\u5220\u9664\u5c42\u5931\u8d25'));
      }
      if (!options?.silent) {
        setLayerCreateMessage(error instanceof Error ? error.message : '\u5220\u9664\u5c42\u5931\u8d25');
      }
    }
  }, [layerLinks, layers, locale, pushUndo, selectedLayerId, setLayerCreateMessage, setLayerLinks, setLayerToDeleteId, setLayers, setSelectedLayerId, setShowLayerManager, setTranslations, setUnits]);

  /** Delete a layer without showing the browser confirm dialog. */
  const deleteLayerWithoutConfirm = useCallback(async (targetLayerId: string) => {
    return performLayerDelete(targetLayerId);
  }, [performLayerDelete]);

  const deleteLayer = useCallback(async (targetLayerId?: string, options?: DeleteLayerOptions) => {
    const effectiveLayerId = targetLayerId ?? layerToDeleteId;
    if (!effectiveLayerId) {
      setLayerCreateMessage('\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u5c42\u3002');
      return;
    }

    const keepUnits = options?.keepUnits ?? false;
    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      setLayerCreateMessage('\u672a\u627e\u5230\u8981\u5220\u9664\u7684\u5c42\u3002');
      return;
    }

    // When deleting the last transcription layer, cascade-delete dependent translation layers.
    if (targetLayer.layerType === 'transcription') {
      const transcriptionLayers = layers.filter((item) => item.layerType === 'transcription');
      if (transcriptionLayers.length <= 1) {
        try {
          const dependentTranslationIds = layers
            .filter((layer) => layer.layerType === 'translation' && layer.parentLayerId === targetLayer.id)
            .map((layer) => layer.id);

          for (const dependentTranslationId of dependentTranslationIds) {
            await performLayerDelete(dependentTranslationId, {
              keepUnits,
              silent: true,
              skipUndo: true,
            });
          }

          await performLayerDelete(effectiveLayerId, {
            keepUnits,
            cascadedTranslationCount: dependentTranslationIds.length,
          });
          return;
        } catch (error) {
          setLayerCreateMessage(error instanceof Error ? error.message : '\u5220\u9664\u5c42\u5931\u8d25');
          return;
        }
      }
    }

    await performLayerDelete(effectiveLayerId, { keepUnits });
  }, [layerToDeleteId, layers, performLayerDelete, setLayerCreateMessage]);

  const toggleLayerLink = useCallback(async (
    transcriptionLayerKey: string,
    layerId: string,
  ) => {
    const targetParent = listIndependentBoundaryTranscriptionLayers(layers)
      .find((layer) => layer.key === transcriptionLayerKey);
    if (!targetParent) {
      setLayerCreateMessage('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u72ec\u7acb\u8f6c\u5199\u5c42\u4f5c\u4e3a\u4f9d\u8d56\u76ee\u6807\u3002');
      return;
    }

    const translationLayer = layers.find(
      (layer) => layer.id === layerId && layer.layerType === 'translation',
    );
    if (!translationLayer) {
      setLayerCreateMessage('\u672a\u627e\u5230\u8981\u8c03\u6574\u4f9d\u8d56\u7684\u7ffb\u8bd1\u5c42\u3002');
      return;
    }

    if (translationLayer.parentLayerId === targetParent.id) {
      return;
    }

    pushUndo(t(locale, 'transcription.layer.undo.adjustDependency'));
    const now = new Date().toISOString();
    const updatedTranslationBase: LayerDocType = {
      ...translationLayer,
      constraint: 'symbolic_association',
      parentLayerId: targetParent.id,
      updatedAt: now,
    };
    const nextLayers = computeCanonicalLayerOrder(layers.map((layer) => (
      layer.id === layerId ? updatedTranslationBase : layer
    )));
    const updatedTranslation = nextLayers.find((layer) => layer.id === layerId) ?? updatedTranslationBase;
    const previousById = new Map(layers.map((layer) => [layer.id, layer] as const));

    const db = await getDb();
    await LayerTierUnifiedService.updateLayer(updatedTranslation);
    const changedSortLayers = nextLayers.filter((layer) => {
      if (layer.id === updatedTranslation.id) return false;
      const previous = previousById.get(layer.id);
      if (!previous) return false;
      return (previous.sortOrder ?? 0) !== (layer.sortOrder ?? 0);
    });
    if (changedSortLayers.length > 0) {
      await Promise.all(changedSortLayers.map((layer) => LayerTierUnifiedService.updateLayerSortOrder(layer.id, layer.sortOrder ?? 0, db)));
    }

    const removableLinks = layerLinks.filter((link) => link.layerId === layerId);
    if (removableLinks.length > 0) {
      await Promise.all(removableLinks.map((link) => db.collections.layer_links.remove(link.id)));
    }

    const newLink = createLayerLink({
      id: newId('link'),
      transcriptionLayerKey: targetParent.key,
      targetLayerId: layerId,
      createdAt: now,
    });
    await db.collections.layer_links.insert(newLink);

    setLayers(nextLayers);
    setLayerLinks((prev) => [
      ...prev.filter((link) => link.layerId !== layerId),
      newLink,
    ]);
  }, [layerLinks, layers, locale, pushUndo, setLayerCreateMessage, setLayerLinks, setLayers]);

  const addMediaItem = useCallback((item: MediaItemDocType) => {
    setMediaItems((prev) => {
      const existingIndex = prev.findIndex((candidate) => candidate.id === item.id);
      if (existingIndex < 0) {
        return [...prev, item];
      }
      const next = [...prev];
      next[existingIndex] = item;
      return next;
    });
    setSelectedMediaId(item.id);
    clearTimelineSelection();
  }, [clearTimelineSelection, setMediaItems, setSelectedMediaId]);

  const reorderLayers = useCallback(async (draggedLayerId: string, targetIndex: number) => {
    const resolved = resolveLayerDrop(layers, draggedLayerId, targetIndex);
    if (!resolved.changed) {
      if (resolved.message) {
        setLayerCreateMessage(resolved.message);
        if (resolved.messageLevel === 'error') {
          setSaveState?.({ kind: 'error', message: resolved.message });
        }
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
        setSaveState?.({
          kind: resolved.messageLevel === 'error' ? 'error' : 'done',
          message: resolved.message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '\u5c42\u7ea7\u91cd\u6392\u5931\u8d25';
      setLayerCreateMessage(message);
      setSaveState?.({ kind: 'error', message });
    }
  }, [layers, persistLayerState, setLayerCreateMessage, setLayerLinks, setLayers, setSaveState, syncTranslationParentLinks]);

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
