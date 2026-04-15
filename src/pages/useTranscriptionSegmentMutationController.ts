import { useCallback, useMemo, useRef } from 'react';
import {
  legacyDeleteSegment,
  legacyDeleteSegments,
  legacyMergeAdjacentSegments,
  legacySplitSegment,
} from '../app/index';
import type { UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { t, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import {
  dispatchTimelineUnitMutation,
  dispatchTimelineUnitSelectionMutation,
} from './timelineUnitMutationDispatch';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import { useTranscriptionSegmentBatchMerge } from './useTranscriptionSegmentBatchMerge';
import { createMetricTags, recordDurationMetric } from '../observability/metrics';

interface UseTranscriptionSegmentMutationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
  findUtteranceDocContainingRange: (start: number, end: number) => UtteranceDocType | undefined;
  setSaveState: (state: SaveState) => void;
  splitUtterance: (id: string, splitTime: number) => Promise<void>;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

interface UseTranscriptionSegmentMutationControllerResult {
  splitRouted: (id: string, splitTime: number, layerIdOverride?: string) => Promise<void>;
  mergeWithPreviousRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithNextRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeSelectedSegmentsRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
  deleteUtteranceRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  deleteSelectedUtterancesRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
}

function setSegmentMutationActionError(
  setSaveState: (state: SaveState) => void,
  actionLabel: string,
  i18nKey: string,
  error: unknown,
): void {
  const { message, meta } = reportActionError({ actionLabel, error, i18nKey: i18nKey });
  setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) });
}

function recordSegmentMutationLatency(action: string, status: 'success' | 'error', startedAtMs: number): void {
  try {
    recordDurationMetric(
      'business.transcription.segment_action_latency_ms',
      startedAtMs,
      createMetricTags('transcription', { action, status }),
    );
  } catch {
    // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
  }
}

export function useTranscriptionSegmentMutationController(
  input: UseTranscriptionSegmentMutationControllerInput,
): UseTranscriptionSegmentMutationControllerResult {
  const locale = useLocale();
  const {
    activeLayerIdForEdits, resolveSegmentRoutingForLayer, pushUndo, reloadSegments, refreshSegmentUndoSnapshot,
    selectTimelineUnit, unitsOnCurrentMedia, getUtteranceDocById, findUtteranceDocContainingRange, setSaveState, splitUtterance,
    mergeSelectedUtterances, mergeWithPrevious, mergeWithNext, deleteUtterance, deleteSelectedUtterances,
    recordTimelineEdit,
  } = input;
  const segmentMutationReloadGenRef = useRef(0);
  const unitById = useMemo(
    () => new Map(unitsOnCurrentMedia.map((unit) => [unit.id, unit] as const)),
    [unitsOnCurrentMedia],
  );
  const resolveSegmentUnitsForLayer = useCallback((layerId: string): TimelineUnitView[] => (
    unitsOnCurrentMedia
      .filter((unit) => unit.kind === 'segment' && unit.layerId === layerId)
      .sort((left, right) => left.startTime - right.startTime)
  ), [unitsOnCurrentMedia]);
  const createSegmentTarget = (unitId: string, layerIdOverride?: string) => resolveTranscriptionUnitTarget({ layerId: layerIdOverride ?? activeLayerIdForEdits, unitId, preferredKind: 'segment' });
  const mergeSelectedSegmentsRouted = useTranscriptionSegmentBatchMerge({
    activeLayerIdForEdits, resolveSegmentRoutingForLayer, pushUndo, reloadSegments, refreshSegmentUndoSnapshot,
    selectTimelineUnit, createSegmentTarget, unitsOnCurrentMedia, getUtteranceDocById, findUtteranceDocContainingRange,
    setSaveState, mergeSelectedUtterances, segmentMutationReloadGenRef,
    ...(recordTimelineEdit ? { recordTimelineEdit } : {}),
  });
  const resolveParentUtteranceForSegment = useCallback((segment: {
    parentUtteranceId?: string;
    startTime: number;
    endTime: number;
  }) => {
    if (segment.parentUtteranceId) {
      const byId = getUtteranceDocById(segment.parentUtteranceId);
      if (byId) return byId;
    }
    return findUtteranceDocContainingRange(segment.startTime, segment.endTime);
  }, [findUtteranceDocContainingRange, getUtteranceDocById]);
  const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUtteranceDoc: async () => {
        try {
          await splitUtterance(id, splitTime);
          recordTimelineEdit?.({ action: 'split', unitId: id, unitKind: 'utterance' });
          recordSegmentMutationLatency('split', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('split', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        pushUndo(t(locale, 'transcription.utteranceAction.undo.split'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          const splitResult = await legacySplitSegment(id, splitTime);
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordSegmentMutationLatency('split', 'success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(splitResult.second.id, targetLayerId));
          recordTimelineEdit?.({
            action: 'split',
            unitId: id,
            unitKind: 'segment',
            detail: `newSegment=${splitResult.second.id}`,
          });
          recordSegmentMutationLatency('split', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.split'), 'transcription.error.action.segmentSplitFailed', error);
          recordSegmentMutationLatency('split', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, splitUtterance, unitById]);

  const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUtteranceDoc: async () => {
        try {
          await mergeWithPrevious(id);
          recordTimelineEdit?.({ action: 'merge', unitId: id, unitKind: 'utterance', detail: 'with_previous' });
          recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        if (!routing.segmentSourceLayer) return;
        const segments = resolveSegmentUnitsForLayer(routing.sourceLayerId);
        const index = segments.findIndex((segment) => segment.id === id);
        if (index <= 0) return;
        const prevSeg = segments[index - 1]!;
        const curSeg = segments[index]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = resolveParentUtteranceForSegment(curSeg);
          const prevParentUtt = resolveParentUtteranceForSegment(prevSeg);
          if (!parentUtt || !prevParentUtt || parentUtt.id !== prevParentUtt.id) {
            setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
            return;
          }
          if (prevSeg.startTime < parentUtt.startTime - 0.001 || curSeg.endTime > parentUtt.endTime + 0.001) {
            setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergePrevious'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await legacyMergeAdjacentSegments(prevSeg.id, id);
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(prevSeg.id, targetLayerId));
          recordTimelineEdit?.({ action: 'merge', unitId: prevSeg.id, unitKind: 'segment', detail: `consumed=${curSeg.id}` });
          recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergePrevious'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithPrevious, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveParentUtteranceForSegment, resolveSegmentRoutingForLayer, resolveSegmentUnitsForLayer, selectTimelineUnit, setSaveState, unitById]);

  const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUtteranceDoc: async () => {
        try {
          await mergeWithNext(id);
          recordTimelineEdit?.({ action: 'merge', unitId: id, unitKind: 'utterance', detail: 'with_next' });
          recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        if (!routing.segmentSourceLayer) return;
        const segments = resolveSegmentUnitsForLayer(routing.sourceLayerId);
        const index = segments.findIndex((segment) => segment.id === id);
        if (index < 0 || index >= segments.length - 1) return;
        const curSeg = segments[index]!;
        const nextSeg = segments[index + 1]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = resolveParentUtteranceForSegment(curSeg);
          const nextParentUtt = resolveParentUtteranceForSegment(nextSeg);
          if (!parentUtt || !nextParentUtt || parentUtt.id !== nextParentUtt.id) {
            setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
            return;
          }
          if (curSeg.startTime < parentUtt.startTime - 0.001 || nextSeg.endTime > parentUtt.endTime + 0.001) {
            setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergeNext'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await legacyMergeAdjacentSegments(id, nextSeg.id);
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(id, targetLayerId));
          recordTimelineEdit?.({ action: 'merge', unitId: id, unitKind: 'segment', detail: `consumed=${nextSeg.id}` });
          recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergeNext'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithNext, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveParentUtteranceForSegment, resolveSegmentRoutingForLayer, resolveSegmentUnitsForLayer, selectTimelineUnit, setSaveState, unitById]);
  const deleteUtteranceRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUtteranceDoc: async () => {
        try {
          await deleteUtterance(id);
          recordTimelineEdit?.({ action: 'delete', unitId: id, unitKind: 'utterance' });
          recordSegmentMutationLatency('delete', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        pushUndo(t(locale, 'transcription.utteranceAction.undo.delete'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await legacyDeleteSegment(id);
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordSegmentMutationLatency('delete', 'success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
          recordTimelineEdit?.({ action: 'delete', unitId: id, unitKind: 'segment' });
          recordSegmentMutationLatency('delete', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.delete'), 'transcription.error.action.segmentDeleteFailed', error);
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, deleteUtterance, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, unitById]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    await dispatchTimelineUnitSelectionMutation({
      ids,
      unitById,
      routing,
      onUtteranceDoc: async () => {
        try {
          await deleteSelectedUtterances(ids);
          const head = [...ids][0];
          if (head) {
            recordTimelineEdit?.({
              action: 'delete',
              unitId: head,
              unitKind: 'utterance',
              ...(ids.size > 1 ? { detail: `batch=${ids.size}` } : {}),
            });
          }
          recordSegmentMutationLatency('delete_selection', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        if (ids.size === 0) return;
        try {
          pushUndo(t(locale, 'transcription.utteranceAction.undo.deleteSelection'));
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await legacyDeleteSegments([...ids]);
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordSegmentMutationLatency('delete_selection', 'success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
          const headSeg = [...ids][0];
          if (headSeg) {
            recordTimelineEdit?.({
              action: 'delete',
              unitId: headSeg,
              unitKind: 'segment',
              ...(ids.size > 1 ? { detail: `batch=${ids.size}` } : {}),
            });
          }
          recordSegmentMutationLatency('delete_selection', 'success', startedAtMs);
        } catch (error) {
          await reloadSegments();
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.deleteSelection'), 'transcription.error.action.segmentBatchDeleteFailed', error);
          recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, deleteSelectedUtterances, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, unitById]);

  return {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUtteranceRouted,
    deleteSelectedUtterancesRouted,
  };
}
