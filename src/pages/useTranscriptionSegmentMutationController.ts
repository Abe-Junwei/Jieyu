import { useCallback, useMemo, useRef } from 'react';
import { getTranscriptionAppService } from '../app/index';
import { t, useLocale } from '../i18n';
import {
  dispatchTimelineUnitMutation,
  dispatchTimelineUnitSelectionMutation,
} from './timelineUnitMutationDispatch';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import { useTranscriptionSegmentBatchMerge } from './useTranscriptionSegmentBatchMerge';
import { LayerUnitService } from '../app/transcriptionServicesPageAccess';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';
import type { AiSegmentSplitRollbackToken } from '../hooks/ai/useAiToolCallHandler.types';
import type {
  UseTranscriptionSegmentMutationControllerInput,
  UseTranscriptionSegmentMutationControllerResult,
} from './useTranscriptionSegmentMutationController.types';
import {
  recordSegmentMutationLatency,
  setSegmentMutationActionError,
} from './useTranscriptionSegmentMutationController.utils';

export type {
  UseTranscriptionSegmentMutationControllerInput,
  UseTranscriptionSegmentMutationControllerResult,
} from './useTranscriptionSegmentMutationController.types';

export function useTranscriptionSegmentMutationController(
  input: UseTranscriptionSegmentMutationControllerInput,
): UseTranscriptionSegmentMutationControllerResult {
  const transcriptionAppService = getTranscriptionAppService();
  const locale = useLocale();
  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    unitsOnCurrentMedia,
    getUnitDocById,
    findUnitDocContainingRange,
    setSaveState,
    splitUnit,
    mergeSelectedUnits,
    mergeWithPrevious,
    mergeWithNext,
    deleteUnit,
    deleteSelectedUnits,
    recordTimelineEdit,
  } = input;
  const segmentMutationReloadGenRef = useRef(0);
  const unitById = useMemo(
    () => new Map(unitsOnCurrentMedia.map((unit) => [unit.id, unit] as const)),
    [unitsOnCurrentMedia],
  );
  const resolveSegmentUnitsForLayer = useCallback(
    (layerId: string): TimelineUnitView[] =>
      unitsOnCurrentMedia
        .filter((unit) => unit.kind === 'segment' && unit.layerId === layerId)
        .sort((left, right) => left.startTime - right.startTime),
    [unitsOnCurrentMedia],
  );
  const createSegmentTarget = useCallback(
    (unitId: string, layerIdOverride?: string) =>
      resolveTranscriptionUnitTarget({
        layerId: layerIdOverride ?? activeLayerIdForEdits,
        unitId,
        preferredKind: 'segment',
      }),
    [activeLayerIdForEdits],
  );
  const mergeSelectedSegmentsRouted = useTranscriptionSegmentBatchMerge({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    createSegmentTarget,
    unitsOnCurrentMedia,
    getUnitDocById,
    findUnitDocContainingRange,
    setSaveState,
    mergeSelectedUnits: mergeSelectedUnits,
    segmentMutationReloadGenRef,
    ...(recordTimelineEdit ? { recordTimelineEdit } : {}),
  });
  const resolveParentUnitForSegment = useCallback(
    (segment: { parentUnitId?: string; startTime: number; endTime: number }) => {
      if (segment.parentUnitId) {
        const byId = getUnitDocById(segment.parentUnitId);
        if (byId) return byId;
      }
      return findUnitDocContainingRange(segment.startTime, segment.endTime);
    },
    [findUnitDocContainingRange, getUnitDocById],
  );
  const mergeAdjacentSegmentsForAiRollback = async (keepId: string, removeId: string) => {
    segmentMutationReloadGenRef.current += 1;
    const postReloadToken = segmentMutationReloadGenRef.current;
    await transcriptionAppService.mergeAdjacentSegments(keepId, removeId);
    await reloadSegments();
    if (segmentMutationReloadGenRef.current !== postReloadToken) {
      return;
    }
    await refreshSegmentUndoSnapshot();
  };

  const splitRouted = useCallback(
    async (id: string, splitTime: number, layerIdOverride?: string) => {
      const startedAtMs = performance.now();
      const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
      const routing = resolveSegmentRoutingForLayer(targetLayerId);
      return dispatchTimelineUnitMutation<AiSegmentSplitRollbackToken | undefined>({
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
          return undefined;
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
              return undefined;
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
            return {
              keepSegmentId: splitResult.first.id,
              removeSegmentId: splitResult.second.id,
            };
          } catch (error) {
            setSegmentMutationActionError(
              setSaveState,
              t(locale, 'transcription.unitAction.undo.split'),
              'transcription.error.action.segmentSplitFailed',
              error,
            );
            recordSegmentMutationLatency('split', 'error', startedAtMs);
            return undefined;
          }
        },
      });
    },
    [
      activeLayerIdForEdits,
      createSegmentTarget,
      locale,
      pushUndo,
      recordTimelineEdit,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      resolveSegmentRoutingForLayer,
      selectTimelineUnit,
      setSaveState,
      splitUnit,
      transcriptionAppService,
      unitById,
    ],
  );

  const mergeWithPreviousRouted = useCallback(
    async (id: string, layerIdOverride?: string) => {
      const startedAtMs = performance.now();
      const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
      const routing = resolveSegmentRoutingForLayer(targetLayerId);
      await dispatchTimelineUnitMutation({
        unit: unitById.get(id),
        routing,
        onUnitDoc: async () => {
          try {
            await mergeWithPrevious(id);
            recordTimelineEdit?.({
              action: 'merge',
              unitId: id,
              unitKind: 'unit',
              detail: 'with_previous',
            });
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
              setSaveState({
                kind: 'error',
                message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange'),
              });
              recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
              return;
            }
            if (
              prevSeg.startTime < parentUtt.startTime - 0.001 ||
              curSeg.endTime > parentUtt.endTime + 0.001
            ) {
              setSaveState({
                kind: 'error',
                message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange'),
              });
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
            recordTimelineEdit?.({
              action: 'merge',
              unitId: prevSeg.id,
              unitKind: 'segment',
              detail: `consumed=${curSeg.id}`,
            });
            recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
          } catch (error) {
            setSegmentMutationActionError(
              setSaveState,
              t(locale, 'transcription.unitAction.undo.mergePrevious'),
              'transcription.error.action.segmentMergeFailed',
              error,
            );
            recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
          }
        },
      });
    },
    [
      activeLayerIdForEdits,
      createSegmentTarget,
      locale,
      mergeWithPrevious,
      pushUndo,
      recordTimelineEdit,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      resolveParentUnitForSegment,
      resolveSegmentRoutingForLayer,
      resolveSegmentUnitsForLayer,
      selectTimelineUnit,
      setSaveState,
      transcriptionAppService,
      unitById,
    ],
  );

  const mergeWithNextRouted = useCallback(
    async (id: string, layerIdOverride?: string) => {
      const startedAtMs = performance.now();
      const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
      const routing = resolveSegmentRoutingForLayer(targetLayerId);
      await dispatchTimelineUnitMutation({
        unit: unitById.get(id),
        routing,
        onUnitDoc: async () => {
          try {
            await mergeWithNext(id);
            recordTimelineEdit?.({
              action: 'merge',
              unitId: id,
              unitKind: 'unit',
              detail: 'with_next',
            });
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
              setSaveState({
                kind: 'error',
                message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange'),
              });
              recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
              return;
            }
            if (
              curSeg.startTime < parentUtt.startTime - 0.001 ||
              nextSeg.endTime > parentUtt.endTime + 0.001
            ) {
              setSaveState({
                kind: 'error',
                message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange'),
              });
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
            recordTimelineEdit?.({
              action: 'merge',
              unitId: id,
              unitKind: 'segment',
              detail: `consumed=${nextSeg.id}`,
            });
            recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
          } catch (error) {
            setSegmentMutationActionError(
              setSaveState,
              t(locale, 'transcription.unitAction.undo.mergeNext'),
              'transcription.error.action.segmentMergeFailed',
              error,
            );
            recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
          }
        },
      });
    },
    [
      activeLayerIdForEdits,
      createSegmentTarget,
      locale,
      mergeWithNext,
      pushUndo,
      recordTimelineEdit,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      resolveParentUnitForSegment,
      resolveSegmentRoutingForLayer,
      resolveSegmentUnitsForLayer,
      selectTimelineUnit,
      setSaveState,
      transcriptionAppService,
      unitById,
    ],
  );
  const deleteUnitRouted = useCallback(
    async (id: string, layerIdOverride?: string) => {
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
            setSegmentMutationActionError(
              setSaveState,
              t(locale, 'transcription.unitAction.undo.delete'),
              'transcription.error.action.segmentDeleteFailed',
              error,
            );
            recordSegmentMutationLatency('delete', 'error', startedAtMs);
          }
        },
      });
    },
    [
      activeLayerIdForEdits,
      deleteUnit,
      locale,
      pushUndo,
      recordTimelineEdit,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      resolveSegmentRoutingForLayer,
      selectTimelineUnit,
      setSaveState,
      transcriptionAppService,
      unitById,
    ],
  );

  const deleteSelectedUnitsRouted = useCallback(
    async (ids: Set<string>, layerIdOverride?: string) => {
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
            setSegmentMutationActionError(
              setSaveState,
              t(locale, 'transcription.unitAction.undo.deleteSelection'),
              'transcription.error.action.segmentBatchDeleteFailed',
              error,
            );
            recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
          }
        },
      });
    },
    [
      activeLayerIdForEdits,
      deleteSelectedUnits,
      locale,
      pushUndo,
      recordTimelineEdit,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      resolveSegmentRoutingForLayer,
      selectTimelineUnit,
      setSaveState,
      transcriptionAppService,
      unitById,
    ],
  );

  const toggleSkipProcessingRouted = useCallback(
    async (id: string, layerIdOverride?: string) => {
      const startedAtMs = performance.now();
      const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
      const selectedUnitView = unitById.get(id);
      const currentTags = { ...(selectedUnitView?.tags ?? {}) };
      const nextSkipProcessing = currentTags.skipProcessing !== true;
      if (nextSkipProcessing) currentTags.skipProcessing = true;
      else delete currentTags.skipProcessing;
      const nextTags = Object.keys(currentTags).length > 0 ? currentTags : undefined;
      const actionLabel = nextSkipProcessing
        ? t(locale, 'transcription.unitAction.undo.markSkipProcessing')
        : t(locale, 'transcription.unitAction.undo.clearSkipProcessing');
      const successMessage = nextSkipProcessing
        ? t(locale, 'transcription.action.skipProcessingMarked')
        : t(locale, 'transcription.action.skipProcessingCleared');

      pushUndo(actionLabel);
      try {
        await LayerUnitService.updateUnit(id, {
          ...(nextTags !== undefined ? { tags: nextTags } : { tags: undefined }),
          updatedAt: new Date().toISOString(),
        });
        await reloadSegments();
        await refreshSegmentUndoSnapshot();
        selectTimelineUnit(
          selectedUnitView?.kind === 'unit'
            ? { layerId: selectedUnitView.layerId, unitId: id, kind: 'unit' }
            : createSegmentTarget(id, targetLayerId),
        );
        setSaveState({ kind: 'done', message: successMessage });
        recordSegmentMutationLatency('toggle_skip_processing', 'success', startedAtMs);
      } catch (error) {
        setSegmentMutationActionError(
          setSaveState,
          actionLabel,
          'transcription.error.action.segmentSkipProcessingFailed',
          error,
        );
        recordSegmentMutationLatency('toggle_skip_processing', 'error', startedAtMs);
      }
    },
    [
      activeLayerIdForEdits,
      createSegmentTarget,
      locale,
      pushUndo,
      refreshSegmentUndoSnapshot,
      reloadSegments,
      selectTimelineUnit,
      setSaveState,
      unitById,
    ],
  );

  return {
    splitRouted,
    mergeAdjacentSegmentsForAiRollback,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUnitRouted,
    deleteSelectedUnitsRouted,
    toggleSkipProcessingRouted,
  };
}
