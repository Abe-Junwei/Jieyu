import { useCallback } from 'react';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';

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
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
}

interface UseTranscriptionSegmentMutationControllerResult {
  splitRouted: (id: string, splitTime: number, layerIdOverride?: string) => Promise<void>;
  mergeWithPreviousRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithNextRouted: (id: string, layerIdOverride?: string) => Promise<void>;
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
  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    segmentsByLayer,
    utterancesOnCurrentMedia,
    setSaveState,
    splitUtterance,
    mergeWithPrevious,
    mergeWithNext,
    deleteUtterance,
    deleteSelectedUtterances,
  } = input;
  const createSegmentTarget = (unitId: string, layerIdOverride?: string) => resolveTranscriptionUnitTarget({
    layerId: layerIdOverride ?? activeLayerIdForEdits,
    unitId,
    preferredKind: 'segment',
  });

  const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        pushUndo('拆分句段');
        try {
          const splitResult = await LayerSegmentationV2Service.splitSegment(id, splitTime);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(splitResult.second.id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, '拆分句段', 'transcription.error.action.segmentSplitFailed', error);
        }
        return;
      }
      case 'utterance':
        await splitUtterance(id, splitTime);
        return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState, splitUtterance]);

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
          if (parentUtt) {
            const mergedStart = prevSeg.startTime;
            const mergedEnd = curSeg.endTime;
            if (mergedStart < parentUtt.startTime - 0.001 || mergedEnd > parentUtt.endTime + 0.001) {
              setSaveState({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
              return;
            }
          }
        }
        pushUndo('向前合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(prevSeg.id, id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(prevSeg.id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, '向前合并句段', 'transcription.error.action.segmentMergeFailed', error);
        }
        return;
      }
      case 'utterance':
        await mergeWithPrevious(id);
        return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, mergeWithPrevious, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);

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
          if (parentUtt) {
            const mergedStart = curSeg.startTime;
            const mergedEnd = nextSeg.endTime;
            if (mergedStart < parentUtt.startTime - 0.001 || mergedEnd > parentUtt.endTime + 0.001) {
              input.setSaveState({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
              return;
            }
          }
        }
        pushUndo('向后合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(id, nextSeg.id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(id, targetLayerId));
        } catch (error) {
          setSegmentMutationActionError(setSaveState, '向后合并句段', 'transcription.error.action.segmentMergeFailed', error);
        }
        return;
      }
      case 'utterance':
        await mergeWithNext(id);
        return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, mergeWithNext, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);

  const deleteUtteranceRouted = useCallback(async (id: string, layerIdOverride?: string) => {
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision':
        pushUndo('删除句段');
        try {
          await LayerSegmentationV2Service.deleteSegment(id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          setSegmentMutationActionError(setSaveState, '删除句段', 'transcription.error.action.segmentDeleteFailed', error);
        }
        return;
      case 'utterance':
        await deleteUtterance(id);
        return;
    }
  }, [activeLayerIdForEdits, deleteUtterance, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const routing = resolveSegmentRoutingForLayer(layerIdOverride ?? activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (ids.size === 0) return;
        try {
          pushUndo(`删除 ${ids.size} 个句段`);
          for (const id of ids) {
            await LayerSegmentationV2Service.deleteSegment(id);
          }
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          await reloadSegments();
          setSegmentMutationActionError(setSaveState, '批量删除句段', 'transcription.error.action.segmentBatchDeleteFailed', error);
        }
        return;
      }
      case 'utterance':
        await deleteSelectedUtterances(ids);
        return;
    }
  }, [activeLayerIdForEdits, deleteSelectedUtterances, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, selectTimelineUnit, setSaveState]);

  return {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    deleteUtteranceRouted,
    deleteSelectedUtterancesRouted,
  };
}