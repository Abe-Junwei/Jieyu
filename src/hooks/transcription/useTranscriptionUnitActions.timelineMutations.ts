import { startTransition } from 'react';
import type {
  AnchorDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
  MediaItemDocType,
  ProvenanceEnvelope,
} from '../../db/types';
import {
  readTranscriptionMediaById,
  readTranscriptionUnitById,
  readTranscriptionUnitsForMedia,
  syncTranscriptionUnitText,
} from '../../db/storagePortTranscriptionUnits';
import { LinguisticService } from '../../services/LinguisticService';
import { newId, formatTime } from '../../utils/transcriptionFormatters';
import { shouldPushTimingUndo, type TimingUndoState } from '../../utils/selectionUtils';
import { reportValidationError } from '../../utils/validationErrorReporter';
import { assertTimelineMediaForMutation } from '../../utils/assertTimelineMediaForMutation';
import { mediaDurationSecForTimeBounds } from '../../utils/timelineMediaDurationForBounds';
import { t, tf, type Locale } from '../../i18n';
import {
  getUndoLabel,
  resolveProjectionLayerIdsForNewUnit,
} from './useTranscriptionUnitActions.helpers';
import type { SaveState } from './transcriptionTypes';
import {
  withUnitTextLayerId,
  type UnitTextWithoutLayerId,
} from '../../services/LayerIdBridgeService';
import { mergeUnitSelfCertaintyConservative } from '../../utils/unitSelfCertainty';
import { isTranscriptionPerfDebugEnabled } from '../../utils/transcriptionPerfDebug';
import { createLogger } from '../../observability/logger';

const log = createLogger('useTranscriptionUnitActions.timelineMutations');

export interface TimelineMutationDeps {
  locale: Locale;
  pushUndo: (label: string) => void;
  setSaveState: (s: SaveState) => void;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  activeUnitId: string;
  allowOverlapInTranscription: boolean;
  timingGestureRef: React.MutableRefObject<{ active: boolean; unitId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  updateAnchorTime: (anchorId: string, newTime: number) => Promise<void>;
  createAnchor: (mediaId: string, time: number) => Promise<AnchorDocType>;
  pruneOrphanAnchors: (removedUnitIds: Set<string>) => Promise<void>;
  selectUnitPrimary: (id: string) => void;
  clearSelection: () => void;
  ensureTimelineMediaRowResolved: () => Promise<MediaItemDocType | null>;
  selectedUnitMedia: MediaItemDocType | undefined;
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  resolveUnitById: (unitId: string) => Promise<LayerUnitDocType | null>;
  translations: LayerUnitContentDocType[];
  scheduleCreatePerfPaintProbe: (startedAtMs: number, context: Record<string, unknown>) => void;
}

export function createSaveUnitTiming(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'timingGestureRef'
    | 'timingUndoRef'
    | 'updateAnchorTime'
    | 'allowOverlapInTranscription'
  >,
) {
  const {
    locale,
    pushUndo,
    setSaveState,
    setUnits,
    timingGestureRef,
    timingUndoRef,
    updateAnchorTime,
    allowOverlapInTranscription,
  } = deps;

  return async (unitId: string, startTime: number, endTime: number) => {
    const current = await readTranscriptionUnitById(unitId);
    if (!current) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.updateTimingTargetMissing'),
        i18nKey: 'transcription.error.validation.updateTimingTargetMissing',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const minSpan = 0.05;

    // 只取同一媒体上的 unit（JY-15，原先每次拖动都扫全库）| Same-media units only (JY-15)
    const mediaId = current.mediaId?.trim() ?? '';
    const sameMediaUnits = mediaId.length > 0 ? await readTranscriptionUnitsForMedia(mediaId) : [];
    const siblings = sameMediaUnits
      .filter((item) => item.id !== unitId && item.mediaId === current.mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const proposed = { id: unitId, startTime, endTime };
    const timeline = [...siblings, proposed].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = timeline.findIndex((item) => item.id === unitId);
    const prev = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
    const next =
      currentIndex >= 0 && currentIndex < timeline.length - 1
        ? timeline[currentIndex + 1]
        : undefined;

    const gap = 0.02;
    const lowerBound = allowOverlapInTranscription ? 0 : prev ? prev.endTime + gap : 0;
    const upperBound = allowOverlapInTranscription
      ? Number.POSITIVE_INFINITY
      : next
        ? next.startTime - gap
        : Number.POSITIVE_INFINITY;

    if (Number.isFinite(upperBound) && upperBound - lowerBound < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.updateTimingNoValidSpan'),
        i18nKey: 'transcription.error.validation.updateTimingNoValidSpan',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      setUnits((prevRows) => [...prevRows]);
      return;
    }

    const boundedStart = Math.max(lowerBound, startTime);
    const maxAllowedStart = Number.isFinite(upperBound)
      ? upperBound - minSpan
      : Number.POSITIVE_INFINITY;
    const normalizedStart = Math.max(0, Math.min(boundedStart, maxAllowedStart, endTime - minSpan));
    const boundedEnd = Math.max(normalizedStart + minSpan, endTime);
    const normalizedEnd = Number.isFinite(upperBound)
      ? Math.min(boundedEnd, upperBound)
      : boundedEnd;

    const gesture = timingGestureRef.current;
    if (!(gesture.active && gesture.unitId === unitId)) {
      const undoDecision = shouldPushTimingUndo(timingUndoRef.current, unitId, Date.now(), 500);
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

    await LinguisticService.units.save(updated);

    const startAnchorId = updated.startAnchorId ?? '';
    const endAnchorId = updated.endAnchorId ?? '';
    if (startAnchorId.length > 0 && updated.startTime !== current.startTime) {
      await updateAnchorTime(startAnchorId, updated.startTime);
    }
    if (endAnchorId.length > 0 && updated.endTime !== current.endTime) {
      await updateAnchorTime(endAnchorId, updated.endTime);
    }

    setUnits((prev) => prev.map((item) => (item.id === unitId ? updated : item)));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.timingUpdated', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  };
}

export function createCreateAdjacentUnit(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setUnitDrafts'
    | 'selectUnitPrimary'
    | 'selectedUnitMedia'
    | 'ensureTimelineMediaRowResolved'
    | 'createAnchor'
  >,
) {
  const {
    locale,
    pushUndo,
    setSaveState,
    setUnits,
    setUnitDrafts,
    selectUnitPrimary,
    selectedUnitMedia,
    ensureTimelineMediaRowResolved,
    createAnchor,
  } = deps;

  return async (base: LayerUnitDocType, playerDuration: number) => {
    const baseMediaId = base.mediaId?.trim() ?? '';
    const fromBase =
      baseMediaId.length > 0 ? await readTranscriptionMediaById(baseMediaId) : undefined;
    let media = selectedUnitMedia ?? fromBase ?? null;
    if (!media) {
      media = await ensureTimelineMediaRowResolved();
    }
    if (!assertTimelineMediaForMutation(media, { locale, setSaveState })) {
      return undefined;
    }
    pushUndo(getUndoLabel(locale, 'createAdjacentUnit'));
    const now = new Date().toISOString();

    const start = base.endTime;
    const fallbackEnd = start + 2;
    const end = playerDuration > 0 ? Math.min(playerDuration, fallbackEnd) : fallbackEnd;
    const finalEnd = end <= start ? start + 0.8 : end;

    const mediaId = base.mediaId ?? '';
    const startAnchor = await createAnchor(mediaId, start);
    const endAnchor = await createAnchor(mediaId, finalEnd);

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
    await LinguisticService.units.save(newUnit);

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
    return createdId;
  };
}

export function createCreateUnitFromSelection(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setUnitDrafts'
    | 'setTranslations'
    | 'selectUnitPrimary'
    | 'ensureTimelineMediaRowResolved'
    | 'createAnchor'
    | 'allowOverlapInTranscription'
    | 'unitsRef'
    | 'defaultTranscriptionLayerId'
    | 'layerById'
    | 'scheduleCreatePerfPaintProbe'
  >,
) {
  const {
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
  } = deps;

  return async (
    start: number,
    end: number,
    options?: {
      speakerId?: string;
      focusedLayerId?: string;
      selectionBehavior?: 'select-created' | 'keep-current';
      /** 机器生成时的来源记录（如自动切分）| Provenance for machine-created rows (e.g. auto segmentation) */
      provenance?: ProvenanceEnvelope;
    },
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
    const prev =
      insertionIndex < 0
        ? siblings[siblings.length - 1]
        : insertionIndex === 0
          ? undefined
          : siblings[insertionIndex - 1];
    const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];

    const lowerBound = allowOverlapInTranscription ? 0 : Math.max(0, prev ? prev.endTime + gap : 0);
    const mediaDuration = mediaDurationSecForTimeBounds(media);
    const upperFromNext = allowOverlapInTranscription
      ? Number.POSITIVE_INFINITY
      : next
        ? next.startTime - gap
        : Number.POSITIVE_INFINITY;
    const upperBound = Math.min(mediaDuration, upperFromNext);

    const boundedStart = Math.max(lowerBound, rawStart);
    const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
    const boundedEnd = Math.min(upperBound, normalizedEnd);

    if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.createFromSelectionOverlap'),
        i18nKey: 'transcription.error.validation.createFromSelectionOverlap',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const beforeUndoMs = perfDebugEnabled ? performance.now() : 0;
    pushUndo(getUndoLabel(locale, 'createFromSelection'));
    const afterUndoMs = perfDebugEnabled ? performance.now() : 0;

    const beforeCreateMs = perfDebugEnabled ? performance.now() : 0;
    const now = new Date().toISOString();
    const finalStart = Number(boundedStart.toFixed(3));
    const finalEnd = Number(boundedEnd.toFixed(3));

    const startAnchor = await createAnchor(media.id, finalStart);
    const endAnchor = await createAnchor(media.id, finalEnd);

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
      ...(options?.provenance ? { provenance: options.provenance } : {}),
    } as LayerUnitDocType;
    await LinguisticService.units.save(newUnit);

    const projectionLayerIds = resolveProjectionLayerIdsForNewUnit(
      layerById,
      defaultTranscriptionLayerId,
      options?.focusedLayerId,
    );
    const projectedTexts: LayerUnitContentDocType[] = [];
    if (projectionLayerIds.length > 0) {
      for (const projectionLayerId of projectionLayerIds) {
        const emptyText: LayerUnitContentDocType = {
          ...withUnitTextLayerId(
            {
              id: newId('utr'),
              unitId: createdId,
              modality: 'text',
              text: '',
              sourceType: 'human',
              createdAt: now,
              updatedAt: now,
            } as UnitTextWithoutLayerId,
            { layerId: projectionLayerId },
          ),
        } as LayerUnitContentDocType;
        await syncTranscriptionUnitText(newUnit, emptyText);
        projectedTexts.push(emptyText);
      }
    }

    const afterCreateMs = perfDebugEnabled ? performance.now() : 0;

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
  };
}

export function createReassignTranslations(
  deps: Pick<TimelineMutationDeps, 'resolveUnitById' | 'translations'>,
) {
  const { resolveUnitById, translations } = deps;

  return async (survivorId: string, removedId: string, now: string) => {
    const removedTranslations = translations.filter((t) => t.unitId === removedId);
    const survivorTranslations = translations.filter((t) => t.unitId === survivorId);
    const newTranslations: LayerUnitContentDocType[] = [];
    const updatedTranslations: LayerUnitContentDocType[] = [];
    const survivorUnit = await resolveUnitById(survivorId);

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
          await syncTranscriptionUnitText(survivorUnit, merged);
        }
        updatedTranslations.push(merged);
      } else if (!match) {
        const reassigned: LayerUnitContentDocType = {
          ...rt,
          unitId: survivorId,
          updatedAt: now,
        } as LayerUnitContentDocType;
        if (survivorUnit) {
          await syncTranscriptionUnitText(survivorUnit, reassigned);
        }
        newTranslations.push(reassigned);
      }
    }

    await LinguisticService.cleanup.removeUnit(removedId);
    return { newTranslations, updatedTranslations };
  };
}

export function createMergeWithPrevious(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setTranslations'
    | 'selectUnitPrimary'
    | 'pruneOrphanAnchors'
    | 'unitsRef'
    | 'resolveUnitById'
    | 'translations'
  >,
) {
  const {
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
  } = deps;

  return async (unitId: string) => {
    const sorted = unitsRef.current
      .filter((u) => u.mediaId === unitsRef.current.find((t) => t.id === unitId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === unitId);
    if (idx <= 0) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergePreviousUnavailable'),
        i18nKey: 'transcription.error.validation.mergePreviousUnavailable',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const prev = sorted[idx - 1]!;
    const curr = sorted[idx]!;

    pushUndo(getUndoLabel(locale, 'mergeWithPrevious'));
    const now = new Date().toISOString();
    const mergedCertainty = mergeUnitSelfCertaintyConservative([
      prev.selfCertainty,
      curr.selfCertainty,
    ]);
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
    await LinguisticService.units.save(updated);

    const { newTranslations, updatedTranslations } = await createReassignTranslations({
      resolveUnitById,
      translations,
    })(prev.id, curr.id, now);

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
    await pruneOrphanAnchors(new Set([curr.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.mergePrevious', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  };
}

export function createMergeWithNext(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setTranslations'
    | 'selectUnitPrimary'
    | 'pruneOrphanAnchors'
    | 'unitsRef'
    | 'resolveUnitById'
    | 'translations'
  >,
) {
  const {
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
  } = deps;

  return async (unitId: string) => {
    const sorted = unitsRef.current
      .filter((u) => u.mediaId === unitsRef.current.find((t) => t.id === unitId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === unitId);
    if (idx < 0 || idx >= sorted.length - 1) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeNextUnavailable'),
        i18nKey: 'transcription.error.validation.mergeNextUnavailable',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const curr = sorted[idx]!;
    const next = sorted[idx + 1]!;

    pushUndo(getUndoLabel(locale, 'mergeWithNext'));
    const now = new Date().toISOString();
    const mergedCertaintyNext = mergeUnitSelfCertaintyConservative([
      curr.selfCertainty,
      next.selfCertainty,
    ]);
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
    await LinguisticService.units.save(updated);

    const { newTranslations, updatedTranslations } = await createReassignTranslations({
      resolveUnitById,
      translations,
    })(curr.id, next.id, now);

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
    await pruneOrphanAnchors(new Set([next.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.mergeNext', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  };
}

export function createSplitUnit(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setTranslations'
    | 'setUnitDrafts'
    | 'selectUnitPrimary'
    | 'createAnchor'
    | 'getUnitTextForLayer'
    | 'unitsRef'
    | 'translations'
  >,
) {
  const {
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
  } = deps;

  return async (unitId: string, splitTime: number) => {
    const target = unitsRef.current.find((u) => u.id === unitId);
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.splitTargetMissing'),
        i18nKey: 'transcription.error.validation.splitTargetMissing',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const minSpan = 0.05;
    if (splitTime - target.startTime < minSpan || target.endTime - splitTime < minSpan) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.splitPointTooClose'),
        i18nKey: 'transcription.error.validation.splitPointTooClose',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'splitUnit'));
    const now = new Date().toISOString();
    const text = getUnitTextForLayer(target);
    const splitTimeFixed = Number(splitTime.toFixed(3));
    const splitAnchor = await createAnchor(target.mediaId ?? '', splitTimeFixed);
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
    await LinguisticService.units.save(updatedFirst);

    const secondStartAnchor = await createAnchor(target.mediaId ?? '', splitTimeFixed);
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
    await LinguisticService.units.save(secondHalf);

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
      await syncTranscriptionUnitText(secondHalf, copy);
      copiedTranslations.push(copy);
    }

    setUnits((prev) => [...prev.map((u) => (u.id === unitId ? updatedFirst : u)), secondHalf]);
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
  };
}

export function createDeleteUnit(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setTranslations'
    | 'clearSelection'
    | 'pruneOrphanAnchors'
    | 'activeUnitId'
    | 'unitsRef'
  >,
) {
  const {
    locale,
    pushUndo,
    setSaveState,
    setUnits,
    setTranslations,
    clearSelection,
    pruneOrphanAnchors,
    activeUnitId,
    unitsRef,
  } = deps;

  return async (unitId: string) => {
    const target = unitsRef.current.find((u) => u.id === unitId);
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.deleteTargetMissing'),
        i18nKey: 'transcription.error.validation.deleteTargetMissing',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'deleteUnit'));
    await LinguisticService.cleanup.removeUnit(unitId);

    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setTranslations((prev) => prev.filter((t) => t.unitId !== unitId));
    if (activeUnitId === unitId) clearSelection();

    await pruneOrphanAnchors(new Set([unitId]));

    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.deleted', {}),
    });
  };
}

export function createDeleteSelectedUnits(
  deps: Pick<
    TimelineMutationDeps,
    | 'locale'
    | 'pushUndo'
    | 'setSaveState'
    | 'setUnits'
    | 'setTranslations'
    | 'clearSelection'
    | 'pruneOrphanAnchors'
    | 'unitsRef'
  >,
) {
  const {
    locale,
    pushUndo,
    setSaveState,
    setUnits,
    setTranslations,
    clearSelection,
    pruneOrphanAnchors,
    unitsRef,
  } = deps;

  return async (ids: Set<string>) => {
    const targets = unitsRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo(getUndoLabel(locale, 'deleteSelectedUnits'));
    const idsToDelete = targets.map((u) => u.id);
    await LinguisticService.cleanup.removeUnitsBatch(idsToDelete);

    const idsToDeleteSet = new Set(idsToDelete);
    setUnits((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !(t.unitId && idsToDeleteSet.has(t.unitId))));
    clearSelection();

    await pruneOrphanAnchors(idsToDeleteSet);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.unitAction.done.deleteSelection', {
        count: targets.length,
      }),
    });
  };
}
