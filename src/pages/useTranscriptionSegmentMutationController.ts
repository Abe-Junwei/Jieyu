import { useCallback } from 'react';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, useLocale } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import { useTranscriptionSegmentBatchMerge } from './useTranscriptionSegmentBatchMerge';

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
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        pushUndo(t(locale, 'transcription.utteranceAction.undo.split'));
        try {
          const splitResult = await LayerSegmentationV2Service.splitSegment(id, splitTime);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(splitResult.second.id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.split'), 'transcription.error.action.segmentSplitFailed', error);
        }
        return;
      }
      case 'utterance': await splitUtterance(id, splitTime); return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, splitUtterance]);

  const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {
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
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergePrevious'));
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(prevSeg.id, id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(prevSeg.id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergePrevious'), 'transcription.error.action.segmentMergeFailed', error);
        }
        return;
      }
      case 'utterance': await mergeWithPrevious(id); return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithPrevious, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);

  const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {
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
            return;
          }
        }
        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergeNext'));
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(id, nextSeg.id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergeNext'), 'transcription.error.action.segmentMergeFailed', error);
        }
        return;
      }
      case 'utterance': await mergeWithNext(id); return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeWithNext, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);
  const deleteUtteranceRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision':
        pushUndo(t(locale, 'transcription.utteranceAction.undo.delete'));
        try {
          await LayerSegmentationV2Service.deleteSegment(id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.delete'), 'transcription.error.action.segmentDeleteFailed', error);
        }
        return;
      case 'utterance': await deleteUtterance(id); return;
    }
  }, [activeLayerIdForEdits, deleteUtterance, locale, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (ids.size === 0) return;
        try {
          pushUndo(t(locale, 'transcription.utteranceAction.undo.deleteSelection'));
          for (const id of ids) {
            await LayerSegmentationV2Service.deleteSegment(id);
          }
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          await reloadSegments();
          setSegmentMutationActionError(setSaveState, t(locale, 'transcription.utteranceAction.undo.deleteSelection'), 'transcription.error.action.segmentBatchDeleteFailed', error);
        }
        return;
      }
      case 'utterance': await deleteSelectedUtterances(ids); return;
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
