import { startTransition, useCallback, useMemo } from 'react';
import { dexieStoresForLayerUnitsTableRead, getDb } from '../db';
import type {
  AnchorDocType,
  MediaItemDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
  LayerUnitStatus,
  ProvenanceEnvelope,
} from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { shouldPushTimingUndo, type TimingUndoState } from '../utils/selectionUtils';
import { reportValidationError } from '../utils/validationErrorReporter';
import { assertTimelineMediaForMutation } from '../utils/assertTimelineMediaForMutation';
import { createTimelineUnit, type SaveState, type SnapGuide, type TimelineUnit } from './transcriptionTypes';
import { invalidateUnitEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import { useTranscriptionVoiceTranslationActions } from './useTranscriptionVoiceTranslationActions';
import { listUnitTextsByUnit, removeUnitTextFromSegmentationV2, syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { type UnitTextWithoutLayerId, withUnitTextLayerId } from '../services/LayerIdBridgeService';
import { LayerUnitSegmentWriteService } from '../services/LayerUnitSegmentWriteService';
import { SegmentMetaService } from '../services/SegmentMetaService';
import { t, tf, useLocale } from '../i18n';
import { getUndoLabel, resolveProjectionLayerIdsForNewUnit, stripSpeakerAssociationFromTranslationText } from './useTranscriptionUnitActions.helpers';
import { createTranscriptionUnitBatchActions } from './useTranscriptionUnitActions.batchActions';
import { createLogger } from '../observability/logger';
import { mergeUnitSelfCertaintyConservative, type UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { getUnitDocProjectionById, listUnitDocsFromCanonicalLayerUnits } from '../services/LayerSegmentGraphService';
import { isTranscriptionPerfDebugEnabled } from '../utils/transcriptionPerfDebug';

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
  return patch.selfCertainty !== undefined
    && patch.status === undefined
    && patch.provenance === undefined;
}

function applyPerLayerRowFieldPatch(row: LayerUnitDocType, patch: PerLayerRowFieldPatch, nowIso: string): LayerUnitDocType {
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
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUnitIds: Set<string>) => Promise<void>;
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

  const scheduleCreatePerfPaintProbe = useCallback((startedAtMs: number, context: Record<string, unknown>) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
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
  }, []);

  const selectUnitPrimary = useCallback((id: string) => {
    setSelectedUnitIds(id ? new Set([id]) : new Set());
    setSelectedTimelineUnit?.(id ? createTimelineUnit(defaultTranscriptionLayerId ?? '', id, 'unit') : null);
  }, [defaultTranscriptionLayerId, setSelectedTimelineUnit, setSelectedUnitIds]);

  const clearSelection = useCallback(() => {
    setSelectedUnitIds(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUnitIds]);

  const resolveUnitById = useCallback(async (db: Awaited<ReturnType<typeof getDb>>, unitId: string) => {
    const local = unitsRef.current.find((item) => item.id === unitId);
    if (local) return local;
    return (await getUnitDocProjectionById(db, unitId)) ?? null;
  }, [unitsRef]);

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

    const rowsExisting = await LinguisticService.getMediaItemsByTextId(textId);
    if (rowsExisting.length === 0) {
      await LinguisticService.ensureDocumentTimeline({ textId });
      const created = await LinguisticService.createPlaceholderMedia({ textId });
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

  const { saveVoiceTranslation, deleteVoiceTranslation, transcribeVoiceTranslation } = useTranscriptionVoiceTranslationActions({
    resolveUnitById,
    setMediaItems,
    setSaveState,
    setTranslations,
    setTranslationDrafts,
  });

  const saveUnitText = useCallback(async (unitId: string, value: string, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    const targetLayer = resolvedLayerId ? layerById.get(resolvedLayerId) : undefined;
    const isDefaultLayer = !targetLayer
      || (targetLayer.layerType === 'transcription'
        && (targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId));

    pushUndo(getUndoLabel(locale, 'editUnitText'));
    const db = await getDb();
    const now = new Date().toISOString();
    const normalizedValue = value.trim();
    let shouldInvalidateEmbeddings = false;

    if (targetLayer) {
      const allTexts = await listUnitTextsByUnit(db, unitId);
      const existing = allTexts
        .filter(
          (item) =>
            item.layerId === targetLayer.id
            && (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await removeUnitTextFromSegmentationV2(db, existing);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
          shouldInvalidateEmbeddings = isDefaultLayer;
        }
      } else if (existing) {
        const didTextChange = (existing.text ?? '').trim() !== normalizedValue;
        const updatedTranslation: LayerUnitContentDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as LayerUnitContentDocType;
        const unit = await resolveUnitById(db, unitId);
        if (unit) {
          await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
        }
        setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
        shouldInvalidateEmbeddings = isDefaultLayer && didTextChange;
      } else {
        const newTranslation: LayerUnitContentDocType = {
          ...withUnitTextLayerId({
            id: newId('utr'),
            unitId,
            modality: 'text',
            text: normalizedValue,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UnitTextWithoutLayerId, { layerId: targetLayer.id }),
        } as LayerUnitContentDocType;
        const unit = await resolveUnitById(db, unitId);
        if (unit) {
          await syncUnitTextToSegmentationV2(db, unit, newTranslation);
        }
        setTranslations((prev) => [...prev, newTranslation]);
        shouldInvalidateEmbeddings = isDefaultLayer;
      }
    }

    if (shouldInvalidateEmbeddings) {
      await invalidateUnitEmbeddings(db, [unitId]);
    }

    if (isDefaultLayer) {
      setUnitDrafts((prev) => ({ ...prev, [unitId]: value }));
    }

    setSaveState({ kind: 'done', message: t(locale, 'transcription.unitAction.done.textUpdated') });
  }, [defaultTranscriptionLayerId, layerById, locale, pushUndo, resolveUnitById, setSaveState, setTranslations, setUnitDrafts]);

  const saveUnitTiming = useCallback(async (unitId: string, startTime: number, endTime: number) => {
    const db = await getDb();
    const current = await getUnitDocProjectionById(db, unitId);
    if (!current) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.updateTimingTargetMissing'),
        i18nKey: 'transcription.error.validation.updateTimingTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const minSpan = 0.05;

    const allUnits = await listUnitDocsFromCanonicalLayerUnits(db);
    const siblings = allUnits
      .filter((item) => item.id !== unitId && item.mediaId === current.mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const proposed = { id: unitId, startTime, endTime };
    const timeline = [...siblings, proposed].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = timeline.findIndex((item) => item.id === unitId);
    const prev = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : undefined;

    const gap = 0.02;
    const lowerBound = allowOverlapInTranscription ? 0 : (prev ? prev.endTime + gap : 0);
    const upperBound = allowOverlapInTranscription ? Number.POSITIVE_INFINITY : (next ? next.startTime - gap : Number.POSITIVE_INFINITY);

    setSnapGuide({ visible: false });

    if (Number.isFinite(upperBound) && upperBound - lowerBound < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.updateTimingNoValidSpan'),
        i18nKey: 'transcription.error.validation.updateTimingNoValidSpan',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      setUnits((prevRows) => [...prevRows]);
      return;
    }

    const boundedStart = Math.max(lowerBound, startTime);
    const maxAllowedStart = Number.isFinite(upperBound) ? upperBound - minSpan : Number.POSITIVE_INFINITY;
    const normalizedStart = Math.max(0, Math.min(boundedStart, maxAllowedStart, endTime - minSpan));
    const boundedEnd = Math.max(normalizedStart + minSpan, endTime);
    const normalizedEnd = Number.isFinite(upperBound) ? Math.min(boundedEnd, upperBound) : boundedEnd;

    const gesture = timingGestureRef.current;
    if (!(gesture.active && gesture.unitId === unitId)) {
      const undoDecision = shouldPushTimingUndo(
        timingUndoRef.current,
        unitId,
        Date.now(),
        500,
      );
      timingUndoRef.current = undoDecision.next;
      if (undoDecision.shouldPush) {
        pushUndo(getUndoLabel(locale, 'updateTiming'));
      }
    }

    const updated: LayerUnitDocType = {
      ...current,
      startTime: Number(normalizedStart.toFixed(3)),
      endTime: Number(normalizedEnd.toFixed(3)),
      updatedAt: new Date().toISOString(),
    };

    await LinguisticService.saveUnit(updated);

    if (updated.startAnchorId && updated.startTime !== current.startTime) {
      await updateAnchorTime(db, updated.startAnchorId, updated.startTime);
    }
    if (updated.endAnchorId && updated.endTime !== current.endTime) {
      await updateAnchorTime(db, updated.endAnchorId, updated.endTime);
    }

    setUnits((prev) => prev.map((item) => (item.id === unitId ? updated : item)));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.timingUpdated', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [allowOverlapInTranscription, locale, pushUndo, setSaveState, setSnapGuide, setUnits, timingGestureRef, timingUndoRef, updateAnchorTime]);

  const saveUnitLayerText = useCallback(async (unitId: string, value: string, layerId: string) => {
    if (!layerId) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.translationLayerRequired'),
        i18nKey: 'transcription.error.validation.translationLayerRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targetLayer = layerById.get(layerId);
    if (!targetLayer || targetLayer.layerType !== 'translation') {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.translationLayerInvalid'),
        i18nKey: 'transcription.error.validation.translationLayerInvalid',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const trimmed = value.trim();

    // 按 unitId 索引查询，避免全表扫描 | Query by unitId index to avoid full table scan
    const allTexts = await listUnitTextsByUnit(db, unitId);
    const candidates = allTexts
      .filter(
        (item) =>
          item.layerId === layerId &&
          (item.modality === 'text' || item.modality === 'mixed'),
      );

    if (!trimmed) {
      const existing = candidates[0];
      if (existing) {
        pushUndo(getUndoLabel(locale, 'clearTranslationText'));
        await removeUnitTextFromSegmentationV2(db, existing);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({ kind: 'done', message: t(locale, 'transcription.unitAction.done.translationCleared') });
      }
      return;
    }

    pushUndo(getUndoLabel(locale, 'editTranslationText'));
    const existing = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const sanitizedExisting = stripSpeakerAssociationFromTranslationText(existing);
      const updatedTranslation: LayerUnitContentDocType = {
        ...sanitizedExisting,
        text: trimmed,
        modality: sanitizedExisting.modality,
        updatedAt: now,
      } as LayerUnitContentDocType;
      const unit = await resolveUnitById(db, unitId);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
      }
      setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
    } else {
      const newTranslation: LayerUnitContentDocType = {
        ...withUnitTextLayerId({
          id: newId('utr'),
          unitId,
          modality: 'text',
          text: trimmed,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UnitTextWithoutLayerId, { layerId }),
      } as LayerUnitContentDocType;
      const unit = await resolveUnitById(db, unitId);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, newTranslation);
      }
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({ kind: 'done', message: t(locale, 'transcription.unitAction.done.translationUpdated') });
  }, [layerById, locale, pushUndo, resolveUnitById, setSaveState, setTranslations]);

  const createAdjacentUnit = useCallback(async (base: LayerUnitDocType, playerDuration: number) => {
    const db = await getDb();
    const fromBaseDoc = base.mediaId
      ? await db.collections.media_items.findOne({ selector: { id: base.mediaId } }).exec()
      : null;
    const fromBase = fromBaseDoc ? fromBaseDoc.toJSON() : undefined;
    let media = selectedUnitMedia ?? fromBase ?? null;
    if (!media) {
      media = await ensureTimelineMediaRowResolved();
    }
    if (!assertTimelineMediaForMutation(media, { locale, setSaveState })) {
      return;
    }
    pushUndo(getUndoLabel(locale, 'createAdjacentUnit'));
    const now = new Date().toISOString();

    const start = base.endTime;
    const fallbackEnd = start + 2;
    const end = playerDuration > 0 ? Math.min(playerDuration, fallbackEnd) : fallbackEnd;
    const finalEnd = end <= start ? start + 0.8 : end;

    const mediaId = base.mediaId ?? '';
    const startAnchor = await createAnchor(db, mediaId, start);
    const endAnchor = await createAnchor(db, mediaId, finalEnd);

    const createdId = newId('utt');
    const newUnit: LayerUnitDocType = {
      id: createdId,
      textId: base.textId,
      ...(base.mediaId ? { mediaId: base.mediaId } : {}),
      startTime: start,
      endTime: finalEnd,
      startAnchorId: startAnchor.id,
      endAnchorId: endAnchor.id,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType;
    await LinguisticService.saveUnit(newUnit);

    setUnits((prev) => [...prev, newUnit]);
    setUnitDrafts((prev) => ({ ...prev, [createdId]: '' }));
    selectUnitPrimary(createdId);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.createNext', {
        start: formatTime(start),
        end: formatTime(finalEnd),
      }),
    });
  }, [createAnchor, ensureTimelineMediaRowResolved, locale, pushUndo, selectUnitPrimary, selectedUnitMedia, setSaveState, setUnitDrafts, setUnits]);

  const createUnitFromSelection = useCallback(async (
    start: number,
    end: number,
    options?: { speakerId?: string; focusedLayerId?: string; selectionBehavior?: 'select-created' | 'keep-current' },
  ) => {
    const perfDebugEnabled = isTranscriptionPerfDebugEnabled();
    const perfStartMs = perfDebugEnabled ? performance.now() : 0;

    const media = await ensureTimelineMediaRowResolved();
    if (!assertTimelineMediaForMutation(media, { locale, setSaveState })) {
      return;
    }

    const minSpan = 0.05;
    const gap = 0.02;
    const rawStart = Math.max(0, Math.min(start, end));
    const rawEnd = Math.max(start, end);

    const siblings = unitsRef.current
      .filter((item) => item.mediaId === media.id)
      .sort((a, b) => a.startTime - b.startTime);

    const insertionIndex = siblings.findIndex((item) => item.startTime > rawStart);
    const prev = insertionIndex < 0
      ? siblings[siblings.length - 1]
      : insertionIndex === 0
        ? undefined
        : siblings[insertionIndex - 1];
    const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];

    const lowerBound = allowOverlapInTranscription ? 0 : Math.max(0, prev ? prev.endTime + gap : 0);
    const mediaDuration = typeof media.duration === 'number' ? media.duration : Number.POSITIVE_INFINITY;
    const upperFromNext = allowOverlapInTranscription
      ? Number.POSITIVE_INFINITY
      : (next ? next.startTime - gap : Number.POSITIVE_INFINITY);
    const upperBound = Math.min(mediaDuration, upperFromNext);

    const boundedStart = Math.max(lowerBound, rawStart);
    const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
    const boundedEnd = Math.min(upperBound, normalizedEnd);

    if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.createFromSelectionOverlap'),
        i18nKey: 'transcription.error.validation.createFromSelectionOverlap',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const beforeUndoMs = perfDebugEnabled ? performance.now() : 0;
    pushUndo(getUndoLabel(locale, 'createFromSelection'));
    const afterUndoMs = perfDebugEnabled ? performance.now() : 0;

    const beforeCreateMs = perfDebugEnabled ? performance.now() : 0;
    const db = await getDb();
    const now = new Date().toISOString();
    const finalStart = Number(boundedStart.toFixed(3));
    const finalEnd = Number(boundedEnd.toFixed(3));

    const startAnchor = await createAnchor(db, media.id, finalStart);
    const endAnchor = await createAnchor(db, media.id, finalEnd);

    const createdId = newId('utt');
    const newUnit: LayerUnitDocType = {
      id: createdId,
      textId: media.textId,
      mediaId: media.id,
      startTime: finalStart,
      endTime: finalEnd,
      startAnchorId: startAnchor.id,
      endAnchorId: endAnchor.id,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
      ...(options?.speakerId ? { speakerId: options.speakerId } : {}),
    } as LayerUnitDocType;
    await LinguisticService.saveUnit(newUnit);

    // 为当前层补内容投影；若当前层是依赖转写层，同时补父独立转写层投影 | Project content for the current layer; if it is a dependent transcription layer, also project to the parent independent transcription layer.
    const projectionLayerIds = resolveProjectionLayerIdsForNewUnit(
      layerById,
      defaultTranscriptionLayerId,
      options?.focusedLayerId,
    );
    const projectedTexts: LayerUnitContentDocType[] = [];
    if (projectionLayerIds.length > 0) {
      for (const projectionLayerId of projectionLayerIds) {
        const emptyText: LayerUnitContentDocType = {
          ...withUnitTextLayerId({
            id: newId('utr'),
            unitId: createdId,
            modality: 'text',
            text: '',
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UnitTextWithoutLayerId, { layerId: projectionLayerId }),
        } as LayerUnitContentDocType;
        await syncUnitTextToSegmentationV2(db, newUnit, emptyText);
        projectedTexts.push(emptyText);
      }
    }

    const afterCreateMs = perfDebugEnabled ? performance.now() : 0;

    // 创建后渲染降为可中断优先级，防止连续创建时累积阻塞 | Mark creation renders as interruptible to prevent cumulative blocking during rapid creation
    startTransition(() => {
      if (projectedTexts.length > 0) {
        setTranslations((prev) => [...prev, ...projectedTexts]);
      }
      setUnits((prev) => [...prev, newUnit]);
      setUnitDrafts((prev) => ({ ...prev, [createdId]: '' }));
      if (options?.selectionBehavior !== 'keep-current') {
        selectUnitPrimary(createdId);
      }
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.createFromSelection', {
          start: formatTime(finalStart),
          end: formatTime(finalEnd),
        }),
      });
    });

    if (perfDebugEnabled) {
      const afterTransitionScheduleMs = performance.now();
      const context = {
        mediaId: media.id,
        createdId,
        projectedTextCount: projectedTexts.length,
        selectionBehavior: options?.selectionBehavior ?? 'select-created',
      } as Record<string, unknown>;
      log.info('Create unit perf breakdown', {
        ...context,
        totalMs: Math.round(afterTransitionScheduleMs - perfStartMs),
        undoMs: Math.round(afterUndoMs - beforeUndoMs),
        createMs: Math.round(afterCreateMs - beforeCreateMs),
        transitionScheduleMs: Math.round(afterTransitionScheduleMs - afterCreateMs),
      });
      scheduleCreatePerfPaintProbe(perfStartMs, context);
    }
  }, [allowOverlapInTranscription, createAnchor, defaultTranscriptionLayerId, ensureTimelineMediaRowResolved, layerById, locale, pushUndo, scheduleCreatePerfPaintProbe, selectUnitPrimary, setSaveState, setTranslations, setUnitDrafts, setUnits, unitsRef]);

  const deleteUnit = useCallback(async (unitId: string) => {
    const target = unitsRef.current.find((u) => u.id === unitId);
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.deleteTargetMissing'),
        i18nKey: 'transcription.error.validation.deleteTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'deleteUnit'));
    await LinguisticService.removeUnit(unitId);

    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setTranslations((prev) => prev.filter((t) => t.unitId !== unitId));
    if (activeUnitId === unitId) clearSelection();

    const db = await getDb();
    await pruneOrphanAnchors(db, new Set([unitId]));

    setSaveState({ kind: 'done', message: t(locale, 'transcription.unitAction.done.deleted') });
  }, [activeUnitId, clearSelection, locale, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUnits, unitsRef]);

  const reassignTranslations = useCallback(async (
    survivorId: string,
    removedId: string,
    db: Awaited<ReturnType<typeof getDb>>,
    now: string,
  ) => {
    const removedTranslations = translations.filter((t) => t.unitId === removedId);
    const survivorTranslations = translations.filter((t) => t.unitId === survivorId);
    const newTranslations: LayerUnitContentDocType[] = [];
    const updatedTranslations: LayerUnitContentDocType[] = [];
    const survivorUnit = await resolveUnitById(db, survivorId);

    for (const rt of removedTranslations) {
      const targetLayerId = rt.layerId;
      const match = survivorTranslations.find(
        (st) => st.layerId === targetLayerId && st.modality === rt.modality,
      );
      if (match && rt.text) {
        const merged: LayerUnitContentDocType = {
          ...match,
          text: (match.text ?? '') + rt.text,
          updatedAt: now,
        } as LayerUnitContentDocType;
        if (survivorUnit) {
          await syncUnitTextToSegmentationV2(db, survivorUnit, merged);
        }
        updatedTranslations.push(merged);
      } else if (!match) {
        const reassigned: LayerUnitContentDocType = {
          ...rt,
          unitId: survivorId,
          updatedAt: now,
        } as LayerUnitContentDocType;
        if (survivorUnit) {
          await syncUnitTextToSegmentationV2(db, survivorUnit, reassigned);
        }
        newTranslations.push(reassigned);
      }
    }

    await LinguisticService.removeUnit(removedId);
    return { newTranslations, updatedTranslations };
  }, [resolveUnitById, translations]);

  const mergeWithPrevious = useCallback(async (unitId: string) => {
    const sorted = unitsRef.current
      .filter((u) => u.mediaId === unitsRef.current.find((t) => t.id === unitId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === unitId);
    if (idx <= 0) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergePreviousUnavailable'),
        i18nKey: 'transcription.error.validation.mergePreviousUnavailable',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const prev = sorted[idx - 1]!;
    const curr = sorted[idx]!;

    pushUndo(getUndoLabel(locale, 'mergeWithPrevious'));
    const db = await getDb();
    const now = new Date().toISOString();
    const mergedCertainty = mergeUnitSelfCertaintyConservative([prev.selfCertainty, curr.selfCertainty]);
    const updated: LayerUnitDocType = {
      ...prev,
      endTime: curr.endTime,
      endAnchorId: curr.endAnchorId ?? prev.endAnchorId,
      updatedAt: now,
    } as LayerUnitDocType;
    if (mergedCertainty === undefined) {
      delete updated.selfCertainty;
    } else {
      updated.selfCertainty = mergedCertainty;
    }
    await LinguisticService.saveUnit(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(prev.id, curr.id, db, now);

    setUnits((p) => p.filter((u) => u.id !== curr.id).map((u) => (u.id === prev.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.unitId !== curr.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUnitPrimary(prev.id);
    await pruneOrphanAnchors(db, new Set([curr.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.mergePrevious', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [locale, pruneOrphanAnchors, pushUndo, reassignTranslations, selectUnitPrimary, setSaveState, setTranslations, setUnits, unitsRef]);

  const mergeWithNext = useCallback(async (unitId: string) => {
    const sorted = unitsRef.current
      .filter((u) => u.mediaId === unitsRef.current.find((t) => t.id === unitId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === unitId);
    if (idx < 0 || idx >= sorted.length - 1) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeNextUnavailable'),
        i18nKey: 'transcription.error.validation.mergeNextUnavailable',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const curr = sorted[idx]!;
    const next = sorted[idx + 1]!;

    pushUndo(getUndoLabel(locale, 'mergeWithNext'));
    const db = await getDb();
    const now = new Date().toISOString();
    const mergedCertaintyNext = mergeUnitSelfCertaintyConservative([curr.selfCertainty, next.selfCertainty]);
    const updated: LayerUnitDocType = {
      ...curr,
      endTime: next.endTime,
      endAnchorId: next.endAnchorId ?? curr.endAnchorId,
      updatedAt: now,
    } as LayerUnitDocType;
    if (mergedCertaintyNext === undefined) {
      delete updated.selfCertainty;
    } else {
      updated.selfCertainty = mergedCertaintyNext;
    }
    await LinguisticService.saveUnit(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(curr.id, next.id, db, now);

    setUnits((p) => p.filter((u) => u.id !== next.id).map((u) => (u.id === curr.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.unitId !== next.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUnitPrimary(curr.id);
    await pruneOrphanAnchors(db, new Set([next.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.mergeNext', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [locale, pruneOrphanAnchors, pushUndo, reassignTranslations, selectUnitPrimary, setSaveState, setTranslations, setUnits, unitsRef]);

  const splitUnit = useCallback(async (unitId: string, splitTime: number) => {
    const target = unitsRef.current.find((u) => u.id === unitId);
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.splitTargetMissing'),
        i18nKey: 'transcription.error.validation.splitTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const minSpan = 0.05;
    if (splitTime - target.startTime < minSpan || target.endTime - splitTime < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.splitPointTooClose'),
        i18nKey: 'transcription.error.validation.splitPointTooClose',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'splitUnit'));
    const db = await getDb();
    const now = new Date().toISOString();
    const text = getUnitTextForLayer(target);
    const splitTimeFixed = Number(splitTime.toFixed(3));
    const splitAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);
    const preservedSelfCertainty = target.selfCertainty;

    const updatedFirst: LayerUnitDocType = {
      ...target,
      endTime: splitTimeFixed,
      endAnchorId: splitAnchor.id,
      updatedAt: now,
    };
    if (preservedSelfCertainty === undefined) {
      delete updatedFirst.selfCertainty;
    } else {
      updatedFirst.selfCertainty = preservedSelfCertainty;
    }
    await LinguisticService.saveUnit(updatedFirst);

    const secondStartAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);
    const secondId = newId('utt');
    const secondHalf: LayerUnitDocType = {
      ...target,
      id: secondId,
      startTime: splitTimeFixed,
      endTime: target.endTime,
      startAnchorId: secondStartAnchor.id,
      endAnchorId: target.endAnchorId,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType;
    if (preservedSelfCertainty === undefined) {
      delete secondHalf.selfCertainty;
    } else {
      secondHalf.selfCertainty = preservedSelfCertainty;
    }
    await LinguisticService.saveUnit(secondHalf);

    const origTranslations = translations.filter((t) => t.unitId === unitId);
    const copiedTranslations: LayerUnitContentDocType[] = [];
    for (const ot of origTranslations) {
      const copy: LayerUnitContentDocType = {
        ...ot,
        id: newId('utr'),
        unitId: secondId,
        createdAt: now,
        updatedAt: now,
      } as LayerUnitContentDocType;
      await syncUnitTextToSegmentationV2(db, secondHalf, copy);
      copiedTranslations.push(copy);
    }

    setUnits((prev) => [
      ...prev.map((u) => (u.id === unitId ? updatedFirst : u)),
      secondHalf,
    ]);
    setTranslations((prev) => [...prev, ...copiedTranslations]);
    setUnitDrafts((prev) => ({ ...prev, [unitId]: text, [secondId]: text }));
    selectUnitPrimary(secondId);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.split', {
        firstRange: `${formatTime(updatedFirst.startTime)}-${formatTime(updatedFirst.endTime)}`,
        secondRange: `${formatTime(secondHalf.startTime)}-${formatTime(secondHalf.endTime)}`,
      }),
    });
  }, [createAnchor, getUnitTextForLayer, locale, pushUndo, selectUnitPrimary, setSaveState, setTranslations, setUnitDrafts, setUnits, translations, unitsRef]);

  const deleteSelectedUnits = useCallback(async (ids: Set<string>) => {
    const targets = unitsRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo(getUndoLabel(locale, 'deleteSelectedUnits'));
    const idsToDelete = targets.map((u) => u.id);
    await LinguisticService.removeUnitsBatch(idsToDelete);

    const idsToDeleteSet = new Set(idsToDelete);
    setUnits((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !(t.unitId && idsToDeleteSet.has(t.unitId))));
    clearSelection();

    const dbInst = await getDb();
    await pruneOrphanAnchors(dbInst, idsToDeleteSet);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.deleteSelection', { count: targets.length }),
    });
  }, [clearSelection, locale, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUnits, unitsRef]);

  const saveUnitLayerFields = useCallback(async (
    unitIds: Iterable<string>,
    patch: PerLayerRowFieldPatch,
  ) => {
    if (
      patch.selfCertainty === undefined
      && patch.status === undefined
      && patch.provenance === undefined
    ) {
      return;
    }

    const idSet = new Set(
      [...unitIds]
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );
    if (idSet.size === 0) return;

    const localTargets = unitsRef.current.filter((u) => idSet.has(u.id));
    const unresolvedIds = [...idSet].filter((id) => !localTargets.some((u) => u.id === id));
    const db = await getDb();
    const persistedTargets = unresolvedIds.length > 0
      ? await db.dexie.transaction(
          'r',
          ...dexieStoresForLayerUnitsTableRead(db),
          async () => (await db.dexie.layer_units.bulkGet(unresolvedIds)).filter((row): row is LayerUnitDocType => Boolean(row)),
        )
      : [];
    const targets = [...localTargets, ...persistedTargets];
    if (targets.length === 0) return;

    const undoKey: 'editSelfCertainty' | 'editPerLayerRowFields' = perLayerPatchTouchesOnlySelfCertainty(patch)
      ? 'editSelfCertainty'
      : 'editPerLayerRowFields';
    pushUndo(getUndoLabel(locale, undoKey));
    const now = new Date().toISOString();
    const updated = targets.map((u) => applyPerLayerRowFieldPatch(u, patch, now));

    const updatedUnits = updated.filter((item) => item.unitType !== 'segment');
    const updatedSegments = updated.filter((item) => item.unitType === 'segment');

    if (updatedUnits.length > 0) {
      await LinguisticService.saveUnitsBatch(updatedUnits);
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
  }, [locale, pushUndo, setSaveState, setUnits, unitsRef]);

  const saveUnitSelfCertainty = useCallback(async (
    unitIds: Iterable<string>,
    value: UnitSelfCertainty | undefined,
  ) => {
    await saveUnitLayerFields(
      unitIds,
      value === undefined ? { selfCertainty: null } : { selfCertainty: value },
    );
  }, [saveUnitLayerFields]);

  const {
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
  } = useMemo(() => createTranscriptionUnitBatchActions({
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
  }), [
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
  ]);

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
