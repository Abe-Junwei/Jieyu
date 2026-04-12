import { useCallback } from 'react';
import {
  legacyDeleteSegment,
  legacyDeleteSegments,
  legacyMergeAdjacentSegments,
  legacySplitSegment,
} from '../app/index';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
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
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  setSaveState: (state: SaveState) => void;
  splitUtterance: (id: string, splitTime: number) => Promise<void>;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
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
    selectTimelineUnit, segmentsByLayer, utterancesOnCurrentMedia, setSaveState, splitUtterance,
    mergeSelectedUtterances, mergeWithPrevious, mergeWithNext, deleteUtterance, deleteSelectedUtterances,
  } = input;
  const createSegmentTarget = (unitId: string, layerIdOverride?: string) => resolveTranscriptionUnitTarget({ layerId: layerIdOverride ?? activeLayerIdForEdits, unitId, preferredKind: 'segment' });
  const mergeSelectedSegmentsRouted = useTranscriptionSegmentBatchMerge({
    activeLayerIdForEdits, resolveSegmentRoutingForLayer, pushUndo, reloadSegments, refreshSegmentUndoSnapshot,
    selectTimelineUnit, createSegmentTarget, segmentsByLayer, utterancesOnCurrentMedia, setSaveState, mergeSelectedUtterances,
  });
  const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        pushUndo(t(locale, 'transcription.utteranceAction.undo.split'));
        try {
          const splitResult = await legacySplitSegment(id, splitTime);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(splitResult.second.id, targetLayerId));
          recordSegmentMutationLatency('split', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.split'), 'transcription.error.action.segmentSplitFailed', error);
          recordSegmentMutationLatency('split', 'error', startedAtMs);
        }
        return;
      }
      case 'utterance': {
        try {
          await splitUtterance(id, splitTime);
          recordSegmentMutationLatency('split', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('split', 'error', startedAtMs);
          throw error;
        }
        return;
      }
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, splitUtterance]);

  const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (!routing.segmentSourceLayer) return;
        const segments = segmentsByLayer.get(routing.sourceLayerId);
        if (!segments) return;
        const index = segments.findIndex((segment) => segment.id === id);
        if (index <= 0) return;
        const prevSeg = segments[index - 1]!;
        const curSeg = segments[index]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= curSeg.startTime + 0.01 && utterance.endTime >= curSeg.endTime - 0.01,
          );
          if (parentUtt && (prevSeg.startTime < parentUtt.startTime - 0.001 || curSeg.endTime > parentUtt.endTime + 0.001)) {
            setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergePrevious'));
        try {
          await legacyMergeAdjacentSegments(prevSeg.id, id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(prevSeg.id, targetLayerId));
          recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergePrevious'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
        }
        return;
      }
      case 'utterance': {
        try {
          await mergeWithPrevious(id);
          recordSegmentMutationLatency('merge_previous', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('merge_previous', 'error', startedAtMs);
          throw error;
        }
        return;
      }
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithPrevious, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);

  const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const targetLayerId = layerIdOverride ?? input.activeLayerIdForEdits;
    const routing = input.resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (!routing.segmentSourceLayer) return;
        const segments = input.segmentsByLayer.get(routing.sourceLayerId);
        if (!segments) return;
        const index = segments.findIndex((segment) => segment.id === id);
        if (index < 0 || index >= segments.length - 1) return;
        const curSeg = segments[index]!;
        const nextSeg = segments[index + 1]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = input.utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= curSeg.startTime + 0.01 && utterance.endTime >= curSeg.endTime - 0.01,
          );
          if (parentUtt && (curSeg.startTime < parentUtt.startTime - 0.001 || nextSeg.endTime > parentUtt.endTime + 0.001)) {
            input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange') });
            recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergeNext'));
        try {
          await legacyMergeAdjacentSegments(id, nextSeg.id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(id, targetLayerId));
          recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergeNext'), 'transcription.error.action.segmentMergeFailed', error);
          recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
        }
        return;
      }
      case 'utterance': {
        try {
          await mergeWithNext(id);
          recordSegmentMutationLatency('merge_next', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('merge_next', 'error', startedAtMs);
          throw error;
        }
        return;
      }
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithNext, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);
  const deleteUtteranceRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision':
        pushUndo(t(locale, 'transcription.utteranceAction.undo.delete'));
        try {
          await legacyDeleteSegment(id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
          recordSegmentMutationLatency('delete', 'success', startedAtMs);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.delete'), 'transcription.error.action.segmentDeleteFailed', error);
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
        }
        return;
      case 'utterance': {
        try {
          await deleteUtterance(id);
          recordSegmentMutationLatency('delete', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('delete', 'error', startedAtMs);
          throw error;
        }
        return;
      }
    }
  }, [activeLayerIdForEdits, deleteUtterance, locale, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (ids.size === 0) return;
        try {
          pushUndo(t(locale, 'transcription.utteranceAction.undo.deleteSelection'));
          await legacyDeleteSegments([...ids]);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
          recordSegmentMutationLatency('delete_selection', 'success', startedAtMs);
        } catch (error) {
          await reloadSegments();
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.deleteSelection'), 'transcription.error.action.segmentBatchDeleteFailed', error);
          recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
        }
        return;
      }
      case 'utterance': {
        try {
          await deleteSelectedUtterances(ids);
          recordSegmentMutationLatency('delete_selection', 'success', startedAtMs);
        } catch (error) {
          recordSegmentMutationLatency('delete_selection', 'error', startedAtMs);
          throw error;
        }
        return;
      }
    }
  }, [activeLayerIdForEdits, deleteSelectedUtterances, locale, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState]);

  return {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUtteranceRouted,
    deleteSelectedUtterancesRouted,
  };
}
