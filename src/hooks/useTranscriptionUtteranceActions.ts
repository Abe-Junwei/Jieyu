import { startTransition, useCallback, useMemo } from 'react';
import { getDb } from '../db';
import type {
  AnchorDocType,
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { shouldPushTimingUndo, type TimingUndoState } from '../utils/selectionUtils';
import { reportValidationError } from '../utils/validationErrorReporter';
import { createTimelineUnit, type SaveState, type SnapGuide, type TimelineUnit } from './transcriptionTypes';
import { invalidateUtteranceEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import { useTranscriptionVoiceTranslationActions } from './useTranscriptionVoiceTranslationActions';
import {
  listUtteranceTextsByUtterance,
  removeUtteranceTextFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from '../services/LayerSegmentationTextService';
import {
  type UtteranceTextWithoutLayerId,
  withUtteranceTextLayerId,
} from '../services/LayerIdBridgeService';
import { t, tf, useLocale } from '../i18n';
import {
  getUndoLabel,
  resolveProjectionLayerIdsForNewUtterance,
  stripSpeakerAssociationFromTranslationText,
} from './useTranscriptionUtteranceActions.helpers';
import { createTranscriptionUtteranceBatchActions } from './useTranscriptionUtteranceActions.batchActions';
import { createLogger } from '../observability/logger';
import { isTranscriptionPerfDebugEnabled } from '../utils/transcriptionPerfDebug';

const log = createLogger('useTranscriptionUtteranceActions');

export type TranscriptionUtteranceActionsParams = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  activeUtteranceUnitId: string;
  translations: UtteranceTextDocType[];
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  timingGestureRef: React.MutableRefObject<{ active: boolean; utteranceId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUtteranceIds: Set<string>) => Promise<void>;
  setSaveState: (s: SaveState) => void;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  allowOverlapInTranscription?: boolean;
};

export function useTranscriptionUtteranceActions({
  defaultTranscriptionLayerId,
  layerById,
  selectedUtteranceMedia,
  activeUtteranceUnitId,
  translations,
  utterancesRef,
  utterancesOnCurrentMediaRef,
  getUtteranceTextForLayer,
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
  setUtterances,
  setUtteranceDrafts,
  setSelectedUtteranceIds,
  setSelectedTimelineUnit,
  allowOverlapInTranscription = false,
}: TranscriptionUtteranceActionsParams) {
  const locale = useLocale();

  const scheduleCreatePerfPaintProbe = useCallback((startedAtMs: number, context: Record<string, unknown>) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    window.requestAnimationFrame(() => {
      const firstPaintMs = Math.round(performance.now() - startedAtMs);
      window.requestAnimationFrame(() => {
        const settledPaintMs = Math.round(performance.now() - startedAtMs);
        log.info('Create utterance perf paint probe', {
          ...context,
          firstPaintMs,
          settledPaintMs,
        });
      });
    });
  }, []);

  const selectUtterancePrimary = useCallback((id: string) => {
    setSelectedUtteranceIds(id ? new Set([id]) : new Set());
    setSelectedTimelineUnit?.(id ? createTimelineUnit(defaultTranscriptionLayerId ?? '', id, 'utterance') : null);
  }, [defaultTranscriptionLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const clearSelection = useCallback(() => {
    setSelectedUtteranceIds(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const resolveUtteranceById = useCallback(async (db: Awaited<ReturnType<typeof getDb>>, utteranceId: string) => {
    const local = utterancesRef.current.find((item) => item.id === utteranceId);
    if (local) return local;
    const row = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    return (row?.toJSON() as UtteranceDocType | undefined) ?? null;
  }, [utterancesRef]);

  const { saveVoiceTranslation, deleteVoiceTranslation } = useTranscriptionVoiceTranslationActions({
    resolveUtteranceById,
    setMediaItems,
    setSaveState,
    setTranslations,
  });

  const saveUtteranceText = useCallback(async (utteranceId: string, value: string, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    const targetLayer = resolvedLayerId ? layerById.get(resolvedLayerId) : undefined;
    const isDefaultLayer = !targetLayer
      || (targetLayer.layerType === 'transcription'
        && (targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId));

    pushUndo(getUndoLabel(locale, 'editUtteranceText'));
    const db = await getDb();
    const now = new Date().toISOString();
    const normalizedValue = value.trim();
    let shouldInvalidateEmbeddings = false;

    if (targetLayer) {
      const allTexts = await listUtteranceTextsByUtterance(db, utteranceId);
      const existing = allTexts
        .filter(
          (item) =>
            item.layerId === targetLayer.id
            && (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await removeUtteranceTextFromSegmentationV2(db, existing);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
          shouldInvalidateEmbeddings = isDefaultLayer;
        }
      } else if (existing) {
        const didTextChange = (existing.text ?? '').trim() !== normalizedValue;
        const updatedTranslation: UtteranceTextDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as UtteranceTextDocType;
        const utterance = await resolveUtteranceById(db, utteranceId);
        if (utterance) {
          await syncUtteranceTextToSegmentationV2(db, utterance, updatedTranslation);
        }
        setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
        shouldInvalidateEmbeddings = isDefaultLayer && didTextChange;
      } else {
        const newTranslation: UtteranceTextDocType = {
          ...withUtteranceTextLayerId({
            id: newId('utr'),
            utteranceId,
            modality: 'text',
            text: normalizedValue,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UtteranceTextWithoutLayerId, { layerId: targetLayer.id }),
        } as UtteranceTextDocType;
        const utterance = await resolveUtteranceById(db, utteranceId);
        if (utterance) {
          await syncUtteranceTextToSegmentationV2(db, utterance, newTranslation);
        }
        setTranslations((prev) => [...prev, newTranslation]);
        shouldInvalidateEmbeddings = isDefaultLayer;
      }
    }

    if (shouldInvalidateEmbeddings) {
      await invalidateUtteranceEmbeddings(db, [utteranceId]);
    }

    if (isDefaultLayer) {
      setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: value }));
    }

    setSaveState({ kind: 'done', message: t(locale, 'transcription.utteranceAction.done.textUpdated') });
  }, [defaultTranscriptionLayerId, layerById, locale, pushUndo, resolveUtteranceById, setSaveState, setTranslations, setUtteranceDrafts]);

  const saveUtteranceTiming = useCallback(async (utteranceId: string, startTime: number, endTime: number) => {
    const db = await getDb();
    const target = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.updateTimingTargetMissing'),
        i18nKey: 'transcription.error.validation.updateTimingTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const current = target.toJSON() as unknown as UtteranceDocType;
    const minSpan = 0.05;

    const allDocs = await db.collections.utterances.find().exec();
    const siblings = allDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceDocType)
      .filter((item) => item.id !== utteranceId && item.mediaId === current.mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const proposed = { id: utteranceId, startTime, endTime };
    const timeline = [...siblings, proposed].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = timeline.findIndex((item) => item.id === utteranceId);
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
      setUtterances((prevRows) => [...prevRows]);
      return;
    }

    const boundedStart = Math.max(lowerBound, startTime);
    const maxAllowedStart = Number.isFinite(upperBound) ? upperBound - minSpan : Number.POSITIVE_INFINITY;
    const normalizedStart = Math.max(0, Math.min(boundedStart, maxAllowedStart, endTime - minSpan));
    const boundedEnd = Math.max(normalizedStart + minSpan, endTime);
    const normalizedEnd = Number.isFinite(upperBound) ? Math.min(boundedEnd, upperBound) : boundedEnd;

    const gesture = timingGestureRef.current;
    if (!(gesture.active && gesture.utteranceId === utteranceId)) {
      const undoDecision = shouldPushTimingUndo(
        timingUndoRef.current,
        utteranceId,
        Date.now(),
        500,
      );
      timingUndoRef.current = undoDecision.next;
      if (undoDecision.shouldPush) {
        pushUndo(getUndoLabel(locale, 'updateTiming'));
      }
    }

    const updated: UtteranceDocType = {
      ...current,
      startTime: Number(normalizedStart.toFixed(3)),
      endTime: Number(normalizedEnd.toFixed(3)),
      updatedAt: new Date().toISOString(),
    };

    await LinguisticService.saveUtterance(updated);

    if (updated.startAnchorId && updated.startTime !== current.startTime) {
      await updateAnchorTime(db, updated.startAnchorId, updated.startTime);
    }
    if (updated.endAnchorId && updated.endTime !== current.endTime) {
      await updateAnchorTime(db, updated.endAnchorId, updated.endTime);
    }

    setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.timingUpdated', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [allowOverlapInTranscription, locale, pushUndo, setSaveState, setSnapGuide, setUtterances, timingGestureRef, timingUndoRef, updateAnchorTime]);

  const saveTextTranslationForUtterance = useCallback(async (utteranceId: string, value: string, layerId: string) => {
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

    // 按 utteranceId 索引查询，避免全表扫描 | Query by utteranceId index to avoid full table scan
    const allTexts = await listUtteranceTextsByUtterance(db, utteranceId);
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
        await removeUtteranceTextFromSegmentationV2(db, existing);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({ kind: 'done', message: t(locale, 'transcription.utteranceAction.done.translationCleared') });
      }
      return;
    }

    pushUndo(getUndoLabel(locale, 'editTranslationText'));
    const existing = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const sanitizedExisting = stripSpeakerAssociationFromTranslationText(existing);
      const updatedTranslation: UtteranceTextDocType = {
        ...sanitizedExisting,
        text: trimmed,
        modality: sanitizedExisting.modality,
        updatedAt: now,
      } as UtteranceTextDocType;
      const utterance = await resolveUtteranceById(db, utteranceId);
      if (utterance) {
        await syncUtteranceTextToSegmentationV2(db, utterance, updatedTranslation);
      }
      setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
    } else {
      const newTranslation: UtteranceTextDocType = {
        ...withUtteranceTextLayerId({
          id: newId('utr'),
          utteranceId,
          modality: 'text',
          text: trimmed,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UtteranceTextWithoutLayerId, { layerId }),
      } as UtteranceTextDocType;
      const utterance = await resolveUtteranceById(db, utteranceId);
      if (utterance) {
        await syncUtteranceTextToSegmentationV2(db, utterance, newTranslation);
      }
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({ kind: 'done', message: t(locale, 'transcription.utteranceAction.done.translationUpdated') });
  }, [layerById, locale, pushUndo, resolveUtteranceById, setSaveState, setTranslations]);

  const createNextUtterance = useCallback(async (base: UtteranceDocType, playerDuration: number) => {
    pushUndo(getUndoLabel(locale, 'createNextUtterance'));
    const db = await getDb();
    const now = new Date().toISOString();

    const start = base.endTime;
    const fallbackEnd = start + 2;
    const end = playerDuration > 0 ? Math.min(playerDuration, fallbackEnd) : fallbackEnd;
    const finalEnd = end <= start ? start + 0.8 : end;

    const mediaId = base.mediaId ?? '';
    const startAnchor = await createAnchor(db, mediaId, start);
    const endAnchor = await createAnchor(db, mediaId, finalEnd);

    const createdId = newId('utt');
    const newUtterance: UtteranceDocType = {
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
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(newUtterance);

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    selectUtterancePrimary(createdId);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.createNext', {
        start: formatTime(start),
        end: formatTime(finalEnd),
      }),
    });
  }, [createAnchor, locale, pushUndo, selectUtterancePrimary, setSaveState, setUtteranceDrafts, setUtterances]);

  const createUtteranceFromSelection = useCallback(async (
    start: number,
    end: number,
    options?: { speakerId?: string; focusedLayerId?: string; selectionBehavior?: 'select-created' | 'keep-current' },
  ) => {
    const perfDebugEnabled = isTranscriptionPerfDebugEnabled();
    const perfStartMs = perfDebugEnabled ? performance.now() : 0;

    const media = selectedUtteranceMedia;
    if (!media) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mediaRequired'),
        i18nKey: 'transcription.error.validation.mediaRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const minSpan = 0.05;
    const gap = 0.02;
    const rawStart = Math.max(0, Math.min(start, end));
    const rawEnd = Math.max(start, end);

    const siblings = utterancesRef.current
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
    const newUtterance: UtteranceDocType = {
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
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(newUtterance);

    // 为当前层补内容投影；若当前层是依赖转写层，同时补父独立转写层投影 | Project content for the current layer; if it is a dependent transcription layer, also project to the parent independent transcription layer.
    const projectionLayerIds = resolveProjectionLayerIdsForNewUtterance(
      layerById,
      defaultTranscriptionLayerId,
      options?.focusedLayerId,
    );
    const projectedTexts: UtteranceTextDocType[] = [];
    if (projectionLayerIds.length > 0) {
      for (const projectionLayerId of projectionLayerIds) {
        const emptyText: UtteranceTextDocType = {
          ...withUtteranceTextLayerId({
            id: newId('utr'),
            utteranceId: createdId,
            modality: 'text',
            text: '',
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UtteranceTextWithoutLayerId, { layerId: projectionLayerId }),
        } as UtteranceTextDocType;
        await syncUtteranceTextToSegmentationV2(db, newUtterance, emptyText);
        projectedTexts.push(emptyText);
      }
    }

    const afterCreateMs = perfDebugEnabled ? performance.now() : 0;

    // 创建后渲染降为可中断优先级，防止连续创建时累积阻塞 | Mark creation renders as interruptible to prevent cumulative blocking during rapid creation
    startTransition(() => {
      if (projectedTexts.length > 0) {
        setTranslations((prev) => [...prev, ...projectedTexts]);
      }
      setUtterances((prev) => [...prev, newUtterance]);
      setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
      if (options?.selectionBehavior !== 'keep-current') {
        selectUtterancePrimary(createdId);
      }
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.utteranceAction.done.createFromSelection', {
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
      log.info('Create utterance perf breakdown', {
        ...context,
        totalMs: Math.round(afterTransitionScheduleMs - perfStartMs),
        undoMs: Math.round(afterUndoMs - beforeUndoMs),
        createMs: Math.round(afterCreateMs - beforeCreateMs),
        transitionScheduleMs: Math.round(afterTransitionScheduleMs - afterCreateMs),
      });
      scheduleCreatePerfPaintProbe(perfStartMs, context);
    }
  }, [allowOverlapInTranscription, createAnchor, defaultTranscriptionLayerId, locale, pushUndo, scheduleCreatePerfPaintProbe, selectedUtteranceMedia, selectUtterancePrimary, setSaveState, setTranslations, setUtteranceDrafts, setUtterances, utterancesRef]);

  const deleteUtterance = useCallback(async (utteranceId: string) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
    if (!target) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.deleteTargetMissing'),
        i18nKey: 'transcription.error.validation.deleteTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'deleteUtterance'));
    await LinguisticService.removeUtterance(utteranceId);

    setUtterances((prev) => prev.filter((u) => u.id !== utteranceId));
    setTranslations((prev) => prev.filter((t) => t.utteranceId !== utteranceId));
    if (activeUtteranceUnitId === utteranceId) clearSelection();

    const db = await getDb();
    await pruneOrphanAnchors(db, new Set([utteranceId]));

    setSaveState({ kind: 'done', message: t(locale, 'transcription.utteranceAction.done.deleted') });
  }, [activeUtteranceUnitId, clearSelection, locale, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const reassignTranslations = useCallback(async (
    survivorId: string,
    removedId: string,
    db: Awaited<ReturnType<typeof getDb>>,
    now: string,
  ) => {
    const removedTranslations = translations.filter((t) => t.utteranceId === removedId);
    const survivorTranslations = translations.filter((t) => t.utteranceId === survivorId);
    const newTranslations: UtteranceTextDocType[] = [];
    const updatedTranslations: UtteranceTextDocType[] = [];
    const survivorUtterance = await resolveUtteranceById(db, survivorId);

    for (const rt of removedTranslations) {
      const targetLayerId = rt.layerId;
      const match = survivorTranslations.find(
        (st) => st.layerId === targetLayerId && st.modality === rt.modality,
      );
      if (match && rt.text) {
        const merged: UtteranceTextDocType = {
          ...match,
          text: (match.text ?? '') + rt.text,
          updatedAt: now,
        } as UtteranceTextDocType;
        if (survivorUtterance) {
          await syncUtteranceTextToSegmentationV2(db, survivorUtterance, merged);
        }
        updatedTranslations.push(merged);
      } else if (!match) {
        const reassigned: UtteranceTextDocType = {
          ...rt,
          utteranceId: survivorId,
          updatedAt: now,
        } as UtteranceTextDocType;
        if (survivorUtterance) {
          await syncUtteranceTextToSegmentationV2(db, survivorUtterance, reassigned);
        }
        newTranslations.push(reassigned);
      }
    }

    await LinguisticService.removeUtterance(removedId);
    return { newTranslations, updatedTranslations };
  }, [resolveUtteranceById, translations]);

  const mergeWithPrevious = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
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
    const updated: UtteranceDocType = {
      ...prev,
      endTime: curr.endTime,
      endAnchorId: curr.endAnchorId ?? prev.endAnchorId,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(prev.id, curr.id, db, now);

    setUtterances((p) => p.filter((u) => u.id !== curr.id).map((u) => (u.id === prev.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.utteranceId !== curr.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUtterancePrimary(prev.id);
    await pruneOrphanAnchors(db, new Set([curr.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.mergePrevious', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [locale, pruneOrphanAnchors, pushUndo, reassignTranslations, selectUtterancePrimary, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const mergeWithNext = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
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
    const updated: UtteranceDocType = {
      ...curr,
      endTime: next.endTime,
      endAnchorId: next.endAnchorId ?? curr.endAnchorId,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(curr.id, next.id, db, now);

    setUtterances((p) => p.filter((u) => u.id !== next.id).map((u) => (u.id === curr.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.utteranceId !== next.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUtterancePrimary(curr.id);
    await pruneOrphanAnchors(db, new Set([next.id]));
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.mergeNext', {
        start: formatTime(updated.startTime),
        end: formatTime(updated.endTime),
      }),
    });
  }, [locale, pruneOrphanAnchors, pushUndo, reassignTranslations, selectUtterancePrimary, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const splitUtterance = useCallback(async (utteranceId: string, splitTime: number) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
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

    pushUndo(getUndoLabel(locale, 'splitUtterance'));
    const db = await getDb();
    const now = new Date().toISOString();
    const text = getUtteranceTextForLayer(target);
    const splitTimeFixed = Number(splitTime.toFixed(3));
    const splitAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);

    const updatedFirst: UtteranceDocType = {
      ...target,
      endTime: splitTimeFixed,
      endAnchorId: splitAnchor.id,
      updatedAt: now,
    };
    await LinguisticService.saveUtterance(updatedFirst);

    const secondStartAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);
    const secondId = newId('utt');
    const secondHalf: UtteranceDocType = {
      ...target,
      id: secondId,
      startTime: splitTimeFixed,
      endTime: target.endTime,
      startAnchorId: secondStartAnchor.id,
      endAnchorId: target.endAnchorId,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(secondHalf);

    const origTranslations = translations.filter((t) => t.utteranceId === utteranceId);
    const copiedTranslations: UtteranceTextDocType[] = [];
    for (const ot of origTranslations) {
      const copy: UtteranceTextDocType = {
        ...ot,
        id: newId('utr'),
        utteranceId: secondId,
        createdAt: now,
        updatedAt: now,
      } as UtteranceTextDocType;
      await syncUtteranceTextToSegmentationV2(db, secondHalf, copy);
      copiedTranslations.push(copy);
    }

    setUtterances((prev) => [
      ...prev.map((u) => (u.id === utteranceId ? updatedFirst : u)),
      secondHalf,
    ]);
    setTranslations((prev) => [...prev, ...copiedTranslations]);
    setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: text, [secondId]: text }));
    selectUtterancePrimary(secondId);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.split', {
        firstRange: `${formatTime(updatedFirst.startTime)}-${formatTime(updatedFirst.endTime)}`,
        secondRange: `${formatTime(secondHalf.startTime)}-${formatTime(secondHalf.endTime)}`,
      }),
    });
  }, [createAnchor, getUtteranceTextForLayer, locale, pushUndo, selectUtterancePrimary, setSaveState, setTranslations, setUtteranceDrafts, setUtterances, translations, utterancesRef]);

  const deleteSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const targets = utterancesRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo(getUndoLabel(locale, 'deleteSelectedUtterances'));
    const idsToDelete = targets.map((u) => u.id);
    await LinguisticService.removeUtterancesBatch(idsToDelete);

    const idsToDeleteSet = new Set(idsToDelete);
    setUtterances((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !idsToDeleteSet.has(t.utteranceId)));
    clearSelection();

    const dbInst = await getDb();
    await pruneOrphanAnchors(dbInst, idsToDeleteSet);
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.utteranceAction.done.deleteSelection', { count: targets.length }),
    });
  }, [clearSelection, locale, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const {
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
  } = useMemo(() => createTranscriptionUtteranceBatchActions({
    allowOverlapInTranscription,
    locale,
    translations,
    utterancesOnCurrentMediaRef,
    pushUndo,
    ...(rollbackUndo ? { rollbackUndo } : {}),
    createAnchor,
    updateAnchorTime,
    pruneOrphanAnchors,
    getUtteranceTextForLayer,
    reassignTranslations,
    selectUtterancePrimary,
    setSaveState,
    setTranslations,
    setUtterances,
    setUtteranceDrafts,
  }), [
    allowOverlapInTranscription,
    locale,
    translations,
    utterancesOnCurrentMediaRef,
    pushUndo,
    rollbackUndo,
    createAnchor,
    updateAnchorTime,
    pruneOrphanAnchors,
    getUtteranceTextForLayer,
    reassignTranslations,
    selectUtterancePrimary,
    setSaveState,
    setTranslations,
    setUtterances,
    setUtteranceDrafts,
  ]);

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
  };
}
