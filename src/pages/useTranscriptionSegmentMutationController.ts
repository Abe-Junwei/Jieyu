import { useCallback, useMemo, useRef } from 'react';
import { getTranscriptionAppService } from '../app/index';
import type { LayerUnitDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { t, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { dispatchTimelineUnitMutation, dispatchTimelineUnitSelectionMutation } from './timelineUnitMutationDispatch';
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
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  findUnitDocContainingRange: (start: number, end: number) => LayerUnitDocType | undefined;
  setSaveState: (state: SaveState) => void;
  splitUnit: (id: string, splitTime: number) => Promise<void>;
  mergeSelectedUnits: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

interface UseTranscriptionSegmentMutationControllerResult {
  splitRouted: (id: string, splitTime: number, layerIdOverride?: string) => Promise<void>;
  mergeWithPreviousRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithNextRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeSelectedSegmentsRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
  deleteUnitRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  deleteSelectedUnitsRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
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
  const transcriptionAppService = getTranscriptionAppService();
  const locale = useLocale();
  const {
    activeLayerIdForEdits, resolveSegmentRoutingForLayer, pushUndo, reloadSegments, refreshSegmentUndoSnapshot,
    selectTimelineUnit, unitsOnCurrentMedia, getUnitDocById, findUnitDocContainingRange, setSaveState, splitUnit,
    mergeSelectedUnits, mergeWithPrevious, mergeWithNext, deleteUnit, deleteSelectedUnits,
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
    selectTimelineUnit, createSegmentTarget, unitsOnCurrentMedia, getUnitDocById, findUnitDocContainingRange,
    setSaveState, mergeSelectedUnits: mergeSelectedUnits, segmentMutationReloadGenRef,
    ...(recordTimelineEdit ? { recordTimelineEdit } : {}),
  });
  const resolveParentUnitForSegment = useCallback((segment: {
    parentUnitId?: string;
    startTime: number;
    endTime: number;
  }) => {
    if (segment.parentUnitId) {
      const byId = getUnitDocById(segment.parentUnitId);
      if (byId) return byId;
    }
    return findUnitDocContainingRange(segment.startTime, segment.endTime);
  }, [findUnitDocContainingRange, getUnitDocById]);
  const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUnitDoc: async () => {
        try {
          await splitUnit(id, splitTime);
          recordTimelineEdit?.({ action: 'split', unitId: id, unitKind: 'unit' });
          recordSegmentMutationLatency('split', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('split', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        pushUndo(t(locale, 'transcription.unitAction.undo.split'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          const splitResult = await transcriptionAppService.splitSegment(id, splitTime);
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
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.unitAction.undo.split'), 'transcription.error.action.segmentSplitFailed', error);
          recordSegmentMutationLatency('split', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, splitUnit, transcriptionAppService, unitById]);

  const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUnitDoc: async () => {
        try {
          await mergeWithPrevious(id);
          recordTimelineEdit?.({ action: 'merge', unitId: id, unitKind: 'unit', detail: 'with_previous' });
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
          const parentUtt = resolveParentUnitForSegment(curSeg);
          const prevParentUtt = resolveParentUnitForSegment(prevSeg);
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
        pushUndo(t(locale, 'transcription.unitAction.undo.mergePrevious'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await transcriptionAppService.mergeAdjacentSegments(prevSeg.id, id);
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
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.unitAction.undo.mergePrevious'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithPrevious, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveParentUnitForSegment, resolveSegmentRoutingForLayer, resolveSegmentUnitsForLayer, selectTimelineUnit, setSaveState, transcriptionAppService, unitById]);

  const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUnitDoc: async () => {
        try {
          await mergeWithNext(id);
          recordTimelineEdit?.({ action: 'merge', unitId: id, unitKind: 'unit', detail: 'with_next' });
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
          const parentUtt = resolveParentUnitForSegment(curSeg);
          const nextParentUtt = resolveParentUnitForSegment(nextSeg);
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
        pushUndo(t(locale, 'transcription.unitAction.undo.mergeNext'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await transcriptionAppService.mergeAdjacentSegments(id, nextSeg.id);
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
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.unitAction.undo.mergeNext'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithNext, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveParentUnitForSegment, resolveSegmentRoutingForLayer, resolveSegmentUnitsForLayer, selectTimelineUnit, setSaveState, transcriptionAppService, unitById]);
  const deleteUnitRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    await dispatchTimelineUnitMutation({
      unit: unitById.get(id),
      routing,
      onUnitDoc: async () => {
        try {
          await deleteUnit(id);
          recordTimelineEdit?.({ action: 'delete', unitId: id, unitKind: 'unit' });
          recordSegmentMutationLatency('delete', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
          throw error;
        }
      },
      onSegmentLayer: async () => {
        pushUndo(t(locale, 'transcription.unitAction.undo.delete'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await transcriptionAppService.deleteSegment(id);
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
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.unitAction.undo.delete'), 'transcription.error.action.segmentDeleteFailed', error);
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, deleteUnit, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, transcriptionAppService, unitById]);

  const deleteSelectedUnitsRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    await dispatchTimelineUnitSelectionMutation({
      ids,
      unitById,
      routing,
      onUnitDoc: async () => {
        try {
          await deleteSelectedUnits(ids);
          const head = [...ids][0];
          if (head) {
            recordTimelineEdit?.({
              action: 'delete',
              unitId: head,
              unitKind: 'unit',
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
          pushUndo(t(locale, 'transcription.unitAction.undo.deleteSelection'));
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          await transcriptionAppService.deleteSegments([...ids]);
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
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.unitAction.undo.deleteSelection'), 'transcription.error.action.segmentBatchDeleteFailed', error);
          recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
        }
      },
    });
  }, [activeLayerIdForEdits, deleteSelectedUnits, locale, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, transcriptionAppService, unitById]);

  return {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUnitRouted: deleteUnitRouted,
    deleteSelectedUnitsRouted: deleteSelectedUnitsRouted,
  };
}
