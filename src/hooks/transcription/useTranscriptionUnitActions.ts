import { useCallback, useMemo } from 'react';
import { dexieStoresForLayerUnitsTableRead, getDb } from '../../db';
import type {
  AnchorDocType,
  MediaItemDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
  LayerUnitStatus,
  ProvenanceEnvelope,
} from '../../db';
import { LinguisticService } from '../../services/LinguisticService';

import type { TimingUndoState } from '../../utils/selectionUtils';

import {
  createTimelineUnit,
  type SaveState,
  type SnapGuide,
  type TimelineUnit,
} from './transcriptionTypes';

import { useTranscriptionVoiceTranslationActions } from './useTranscriptionVoiceTranslationActions';

import { LayerUnitSegmentWriteService } from '../../services/LayerUnitSegmentWriteService';
import { SegmentMetaService } from '../../services/SegmentMetaService';
import { t, useLocale } from '../../i18n';
import { getUndoLabel } from './useTranscriptionUnitActions.helpers';
import { createTranscriptionUnitBatchActions } from './useTranscriptionUnitActions.batchActions';
import { createLogger } from '../../observability/logger';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import { getUnitDocProjectionById } from '../../services/LayerSegmentGraphService';

import {
  createSaveUnitText,
  createSaveUnitLayerText,
} from './useTranscriptionUnitActions.textWrites';
import {
  createSaveUnitTiming,
  createCreateAdjacentUnit,
  createCreateUnitFromSelection,
  createDeleteUnit,
  createReassignTranslations,
  createMergeWithPrevious,
  createMergeWithNext,
  createSplitUnit,
  createDeleteSelectedUnits,
} from './useTranscriptionUnitActions.timelineMutations';

const log = createLogger('useTranscriptionUnitActions');

/**
 * 写入 `layer_units` 上「层私有的」标柱字段的统一 patch。
 * - 键出现且值为 `null`：从行上删除该字段。
 * - 键出现且值为非 null：写入该值。
 * - 键省略：不修改该字段。
 *
 * 存储约定 | Storage:
 *   - 段行与规范单元行均使用 `status`（LayerUnitDocType.status）存标注深度；读模型里 segment 视图映射为 `annotationStatus`。
 *   - `selfCertainty` / `provenance` 与 `status` 相同，均按行的 `unitType` 经 {@link saveUnitLayerFields} 分派到 segment upsert 或 unit batch。
 */
export type PerLayerRowFieldPatch = {
  selfCertainty?: UnitSelfCertainty | null;
  status?: LayerUnitStatus | null;
  provenance?: ProvenanceEnvelope | null;
};

function perLayerPatchTouchesOnlySelfCertainty(patch: PerLayerRowFieldPatch): boolean {
  return (
    patch.selfCertainty !== undefined &&
    patch.status === undefined &&
    patch.provenance === undefined
  );
}

function applyPerLayerRowFieldPatch(
  row: LayerUnitDocType,
  patch: PerLayerRowFieldPatch,
  nowIso: string,
): LayerUnitDocType {
  const next: LayerUnitDocType = { ...row, updatedAt: nowIso };
  if (patch.selfCertainty !== undefined) {
    if (patch.selfCertainty === null) delete next.selfCertainty;
    else next.selfCertainty = patch.selfCertainty;
  }
  if (patch.status !== undefined) {
    if (patch.status === null) {
      delete next.status;
      delete next.annotationStatus;
    } else {
      next.status = patch.status;
      delete next.annotationStatus;
    }
  }
  if (patch.provenance !== undefined) {
    if (patch.provenance === null) delete next.provenance;
    else next.provenance = patch.provenance;
  }
  return next;
}

export type TranscriptionUnitActionsParams = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  selectedUnitMedia?: MediaItemDocType | undefined;
  setSelectedMediaId?: React.Dispatch<React.SetStateAction<string>>;
  activeUnitId: string;
  translations: LayerUnitContentDocType[];
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  unitsOnCurrentMediaRef: React.MutableRefObject<LayerUnitDocType[]>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  timingGestureRef: React.MutableRefObject<{ active: boolean; unitId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (
    db: Awaited<ReturnType<typeof getDb>>,
    mediaId: string,
    time: number,
  ) => Promise<AnchorDocType>;
  updateAnchorTime: (
    db: Awaited<ReturnType<typeof getDb>>,
    anchorId: string,
    newTime: number,
  ) => Promise<void>;
  pruneOrphanAnchors: (
    db: Awaited<ReturnType<typeof getDb>>,
    removedUnitIds: Set<string>,
  ) => Promise<void>;
  setSaveState: (s: SaveState) => void;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTranslationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSelectedUnitIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  allowOverlapInTranscription?: boolean;
};

export function useTranscriptionUnitActions({
  defaultTranscriptionLayerId,
  layerById,
  selectedUnitMedia,
  setSelectedMediaId,
  activeUnitId,
  translations,
  unitsRef,
  unitsOnCurrentMediaRef,
  getUnitTextForLayer,
  timingGestureRef,
  timingUndoRef,
  pushUndo,
  rollbackUndo,
  createAnchor,
  updateAnchorTime,
  pruneOrphanAnchors,
  setSaveState,
  setSnapGuide,
  setMediaItems,
  setTranslations,
  setUnits,
  setUnitDrafts,
  setTranslationDrafts,
  setSelectedUnitIds,
  setSelectedTimelineUnit,
  allowOverlapInTranscription = false,
}: TranscriptionUnitActionsParams) {
  const locale = useLocale();

  const scheduleCreatePerfPaintProbe = useCallback(
    (startedAtMs: number, context: Record<string, unknown>) => {
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
        return;
      window.requestAnimationFrame(() => {
        const firstPaintMs = Math.round(performance.now() - startedAtMs);
        window.requestAnimationFrame(() => {
          const settledPaintMs = Math.round(performance.now() - startedAtMs);
          log.info('Create unit perf paint probe', {
            ...context,
            firstPaintMs,
            settledPaintMs,
          });
        });
      });
    },
    [],
  );

  const selectUnitPrimary = useCallback(
    (id: string) => {
      setSelectedUnitIds(id ? new Set([id]) : new Set());
      setSelectedTimelineUnit?.(
        id ? createTimelineUnit(defaultTranscriptionLayerId ?? '', id, 'unit') : null,
      );
    },
    [defaultTranscriptionLayerId, setSelectedTimelineUnit, setSelectedUnitIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedUnitIds(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUnitIds]);

  const resolveUnitById = useCallback(
    async (db: Awaited<ReturnType<typeof getDb>>, unitId: string) => {
      const local = unitsRef.current.find((item) => item.id === unitId);
      if (local) return local;
      return (await getUnitDocProjectionById(db, unitId)) ?? null;
    },
    [unitsRef],
  );

  const resolveTextIdForPlaceholder = useCallback((): string | undefined => {
    if (defaultTranscriptionLayerId) {
      const layer = layerById.get(defaultTranscriptionLayerId);
      if (layer?.textId) return layer.textId;
    }
    for (const layer of layerById.values()) {
      if (layer.layerType === 'transcription' || layer.layerType === 'translation') {
        return layer.textId;
      }
    }
    return undefined;
  }, [defaultTranscriptionLayerId, layerById]);

  /** 占位媒体仅在首次需要写时间轴（建段等）时创建，避免仅有空层时侧栏出现 `document-placeholder.track`。 */
  const ensureTimelineMediaRowResolved = useCallback(async (): Promise<MediaItemDocType | null> => {
    if (selectedUnitMedia) return selectedUnitMedia;
    const textId = resolveTextIdForPlaceholder();
    if (!textId) return null;

    const rowsExisting = await LinguisticService.media.listByTextId(textId);
    if (rowsExisting.length === 0) {
      await LinguisticService.timeline.ensureDocument({ textId });
      const created = await LinguisticService.media.createPlaceholder({ textId });
      setMediaItems((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      setSelectedMediaId?.(created.id);
      return created;
    }

    const preferred = rowsExisting[0];
    if (!preferred) return null;
    setMediaItems((prev) => {
      const byId = new Map<string, MediaItemDocType>(prev.map((m) => [m.id, m]));
      for (const r of rowsExisting) {
        byId.set(r.id, r);
      }
      return [...byId.values()];
    });
    setSelectedMediaId?.(preferred.id);
    return preferred;
  }, [resolveTextIdForPlaceholder, selectedUnitMedia, setMediaItems, setSelectedMediaId]);

  const { saveVoiceTranslation, deleteVoiceTranslation, transcribeVoiceTranslation } =
    useTranscriptionVoiceTranslationActions({
      resolveUnitById,
      setMediaItems,
      setSaveState,
      setTranslations,
      setTranslationDrafts,
    });

  const saveUnitText = useMemo(
    () =>
      createSaveUnitText({
        defaultTranscriptionLayerId,
        layerById,
        locale,
        pushUndo,
        resolveUnitById,
        setSaveState,
        setTranslations,
        setUnitDrafts,
      }),
    [
      defaultTranscriptionLayerId,
      layerById,
      locale,
      pushUndo,
      resolveUnitById,
      setSaveState,
      setTranslations,
      setUnitDrafts,
    ],
  );

  const saveUnitTiming = useMemo(
    () =>
      createSaveUnitTiming({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        timingGestureRef,
        timingUndoRef,
        updateAnchorTime,
        setSnapGuide,
        allowOverlapInTranscription,
      }),
    [
      allowOverlapInTranscription,
      locale,
      pushUndo,
      setSaveState,
      setSnapGuide,
      setUnits,
      timingGestureRef,
      timingUndoRef,
      updateAnchorTime,
    ],
  );

  const saveUnitLayerText = useMemo(
    () =>
      createSaveUnitLayerText({
        defaultTranscriptionLayerId,
        layerById,
        locale,
        pushUndo,
        resolveUnitById,
        setSaveState,
        setTranslations,
        setUnitDrafts,
      }),
    [
      defaultTranscriptionLayerId,
      layerById,
      locale,
      pushUndo,
      resolveUnitById,
      setSaveState,
      setTranslations,
      setUnitDrafts,
    ],
  );

  const createAdjacentUnit = useMemo(
    () =>
      createCreateAdjacentUnit({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setUnitDrafts,
        selectUnitPrimary,
        selectedUnitMedia,
        ensureTimelineMediaRowResolved,
        createAnchor,
      }),
    [
      createAnchor,
      ensureTimelineMediaRowResolved,
      locale,
      pushUndo,
      selectUnitPrimary,
      selectedUnitMedia,
      setSaveState,
      setUnitDrafts,
      setUnits,
    ],
  );

  const createUnitFromSelection = useMemo(
    () =>
      createCreateUnitFromSelection({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setUnitDrafts,
        setTranslations,
        selectUnitPrimary,
        ensureTimelineMediaRowResolved,
        createAnchor,
        allowOverlapInTranscription,
        unitsRef,
        defaultTranscriptionLayerId,
        layerById,
        scheduleCreatePerfPaintProbe,
      }),
    [
      allowOverlapInTranscription,
      createAnchor,
      defaultTranscriptionLayerId,
      ensureTimelineMediaRowResolved,
      layerById,
      locale,
      pushUndo,
      scheduleCreatePerfPaintProbe,
      selectUnitPrimary,
      setSaveState,
      setTranslations,
      setUnitDrafts,
      setUnits,
      unitsRef,
    ],
  );

  const deleteUnit = useMemo(
    () =>
      createDeleteUnit({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setTranslations,
        clearSelection,
        pruneOrphanAnchors,
        activeUnitId,
        unitsRef,
      }),
    [
      activeUnitId,
      clearSelection,
      locale,
      pruneOrphanAnchors,
      pushUndo,
      setSaveState,
      setTranslations,
      setUnits,
      unitsRef,
    ],
  );

  const reassignTranslations = useMemo(
    () => createReassignTranslations({ resolveUnitById, translations }),
    [resolveUnitById, translations],
  );

  const mergeWithPrevious = useMemo(
    () =>
      createMergeWithPrevious({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setTranslations,
        selectUnitPrimary,
        pruneOrphanAnchors,
        unitsRef,
        resolveUnitById,
        translations,
      }),
    [
      locale,
      pruneOrphanAnchors,
      pushUndo,
      resolveUnitById,
      selectUnitPrimary,
      setSaveState,
      setTranslations,
      setUnits,
      translations,
      unitsRef,
    ],
  );

  const mergeWithNext = useMemo(
    () =>
      createMergeWithNext({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setTranslations,
        selectUnitPrimary,
        pruneOrphanAnchors,
        unitsRef,
        resolveUnitById,
        translations,
      }),
    [
      locale,
      pruneOrphanAnchors,
      pushUndo,
      resolveUnitById,
      selectUnitPrimary,
      setSaveState,
      setTranslations,
      setUnits,
      translations,
      unitsRef,
    ],
  );

  const splitUnit = useMemo(
    () =>
      createSplitUnit({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setTranslations,
        setUnitDrafts,
        selectUnitPrimary,
        createAnchor,
        getUnitTextForLayer,
        unitsRef,
        translations,
      }),
    [
      createAnchor,
      getUnitTextForLayer,
      locale,
      pushUndo,
      selectUnitPrimary,
      setSaveState,
      setTranslations,
      setUnitDrafts,
      setUnits,
      translations,
      unitsRef,
    ],
  );

  const deleteSelectedUnits = useMemo(
    () =>
      createDeleteSelectedUnits({
        locale,
        pushUndo,
        setSaveState,
        setUnits,
        setTranslations,
        clearSelection,
        pruneOrphanAnchors,
        unitsRef,
      }),
    [
      clearSelection,
      locale,
      pruneOrphanAnchors,
      pushUndo,
      setSaveState,
      setTranslations,
      setUnits,
      unitsRef,
    ],
  );

  const saveUnitLayerFields = useCallback(
    async (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => {
      if (
        patch.selfCertainty === undefined &&
        patch.status === undefined &&
        patch.provenance === undefined
      ) {
        return;
      }

      const idSet = new Set([...unitIds].map((id) => id.trim()).filter((id) => id.length > 0));
      if (idSet.size === 0) return;

      const localTargets = unitsRef.current.filter((u) => idSet.has(u.id));
      const unresolvedIds = [...idSet].filter((id) => !localTargets.some((u) => u.id === id));
      const db = await getDb();
      const persistedTargets =
        unresolvedIds.length > 0
          ? await db.dexie.transaction('r', ...dexieStoresForLayerUnitsTableRead(db), async () =>
              (await db.dexie.layer_units.bulkGet(unresolvedIds)).filter(
                (row): row is LayerUnitDocType => Boolean(row),
              ),
            )
          : [];
      const targets = [...localTargets, ...persistedTargets];
      if (targets.length === 0) return;

      const undoKey: 'editSelfCertainty' | 'editPerLayerRowFields' =
        perLayerPatchTouchesOnlySelfCertainty(patch)
          ? 'editSelfCertainty'
          : 'editPerLayerRowFields';
      pushUndo(getUndoLabel(locale, undoKey));
      const now = new Date().toISOString();
      const updated = targets.map((u) => applyPerLayerRowFieldPatch(u, patch, now));

      const updatedUnits = updated.filter((item) => item.unitType !== 'segment');
      const updatedSegments = updated.filter((item) => item.unitType === 'segment');

      if (updatedUnits.length > 0) {
        await LinguisticService.units.saveBatch(updatedUnits);
        const updatedById = new Map(updatedUnits.map((item) => [item.id, item] as const));
        setUnits((prev) => prev.map((u) => updatedById.get(u.id) ?? u));
      }

      if (updatedSegments.length > 0) {
        await LayerUnitSegmentWriteService.upsertSegments(db, updatedSegments);
        void SegmentMetaService.syncForUnitIds(updatedSegments.map((item) => item.id)).catch(() => {
          // SegmentMeta 为统一读模型；刷新失败不应阻塞 per-layer 字段保存 | SegmentMeta is a shared read model.
        });
      }

      const doneKey = perLayerPatchTouchesOnlySelfCertainty(patch)
        ? 'transcription.unitAction.done.selfCertaintyUpdated'
        : 'transcription.unitAction.done.perLayerRowFieldsUpdated';
      setSaveState({ kind: 'done', message: t(locale, doneKey) });
    },
    [locale, pushUndo, setSaveState, setUnits, unitsRef],
  );

  const saveUnitSelfCertainty = useCallback(
    async (unitIds: Iterable<string>, value: UnitSelfCertainty | undefined) => {
      await saveUnitLayerFields(
        unitIds,
        value === undefined ? { selfCertainty: null } : { selfCertainty: value },
      );
    },
    [saveUnitLayerFields],
  );

  const { offsetSelectedTimes, scaleSelectedTimes, splitByRegex, mergeSelectedUnits } = useMemo(
    () =>
      createTranscriptionUnitBatchActions({
        allowOverlapInTranscription,
        locale,
        translations,
        unitsOnCurrentMediaRef,
        pushUndo,
        ...(rollbackUndo ? { rollbackUndo } : {}),
        createAnchor,
        updateAnchorTime,
        pruneOrphanAnchors,
        getUnitTextForLayer,
        reassignTranslations,
        selectUnitPrimary,
        setSaveState,
        setTranslations,
        setUnits,
        setUnitDrafts,
      }),
    [
      allowOverlapInTranscription,
      locale,
      translations,
      unitsOnCurrentMediaRef,
      pushUndo,
      rollbackUndo,
      createAnchor,
      updateAnchorTime,
      pruneOrphanAnchors,
      getUnitTextForLayer,
      reassignTranslations,
      selectUnitPrimary,
      setSaveState,
      setTranslations,
      setUnits,
      setUnitDrafts,
    ],
  );

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    transcribeVoiceTranslation,
    saveUnitText: saveUnitText,
    saveUnitSelfCertainty: saveUnitSelfCertainty,
    saveUnitLayerFields: saveUnitLayerFields,
    saveUnitTiming: saveUnitTiming,
    saveUnitLayerText: saveUnitLayerText,
    createAdjacentUnit: createAdjacentUnit,
    createUnitFromSelection,
    ensureTimelineMediaRowResolved,
    deleteUnit: deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit: splitUnit,
    deleteSelectedUnits: deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits: mergeSelectedUnits,
  };
}
