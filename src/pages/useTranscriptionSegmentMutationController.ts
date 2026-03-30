import { useCallback } from 'react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { createTimelineUnit } from '../hooks/transcriptionTypes';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';

type SegmentEditMode = 'utterance' | 'independent-segment' | 'time-subdivision';

interface SegmentRoutingResult {
  layer: LayerDocType | undefined;
  segmentSourceLayer: LayerDocType | undefined;
  sourceLayerId: string;
  editMode: SegmentEditMode;
}

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
  splitRouted: (id: string, splitTime: number) => Promise<void>;
  mergeWithPreviousRouted: (id: string) => Promise<void>;
  mergeWithNextRouted: (id: string) => Promise<void>;
  deleteUtteranceRouted: (id: string) => Promise<void>;
  deleteSelectedUtterancesRouted: (ids: Set<string>) => Promise<void>;
}

export function useTranscriptionSegmentMutationController(
  input: UseTranscriptionSegmentMutationControllerInput,
): UseTranscriptionSegmentMutationControllerResult {
  const splitRouted = useCallback(async (id: string, splitTime: number) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        input.pushUndo('拆分句段');
        const splitResult = await LayerSegmentationV2Service.splitSegment(id, splitTime);
        await input.reloadSegments();
        await input.refreshSegmentUndoSnapshot();
        input.selectTimelineUnit(createTimelineUnit(input.activeLayerIdForEdits, splitResult.second.id, 'segment'));
        return;
      }
      case 'utterance':
        await input.splitUtterance(id, splitTime);
        return;
    }
  }, [input]);

  const mergeWithPreviousRouted = useCallback(async (id: string) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (!routing.segmentSourceLayer) return;
        const segments = input.segmentsByLayer.get(routing.sourceLayerId);
        if (!segments) return;
        const index = segments.findIndex((segment) => segment.id === id);
        if (index <= 0) return;
        const prevSeg = segments[index - 1]!;
        const curSeg = segments[index]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = input.utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= curSeg.startTime + 0.01 && utterance.endTime >= curSeg.endTime - 0.01,
          );
          if (parentUtt) {
            const mergedStart = prevSeg.startTime;
            const mergedEnd = curSeg.endTime;
            if (mergedStart < parentUtt.startTime - 0.001 || mergedEnd > parentUtt.endTime + 0.001) {
              input.setSaveState({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
              return;
            }
          }
        }
        input.pushUndo('向前合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(prevSeg.id, id);
          await input.reloadSegments();
          await input.refreshSegmentUndoSnapshot();
          input.selectTimelineUnit(createTimelineUnit(input.activeLayerIdForEdits, prevSeg.id, 'segment'));
        } catch (error) {
          input.setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '合并句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await input.mergeWithPrevious(id);
        return;
    }
  }, [input]);

  const mergeWithNextRouted = useCallback(async (id: string) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
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
        input.pushUndo('向后合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(id, nextSeg.id);
          await input.reloadSegments();
          await input.refreshSegmentUndoSnapshot();
          input.selectTimelineUnit(createTimelineUnit(input.activeLayerIdForEdits, id, 'segment'));
        } catch (error) {
          input.setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '合并句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await input.mergeWithNext(id);
        return;
    }
  }, [input]);

  const deleteUtteranceRouted = useCallback(async (id: string) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision':
        input.pushUndo('删除句段');
        try {
          await LayerSegmentationV2Service.deleteSegment(id);
          await input.reloadSegments();
          await input.refreshSegmentUndoSnapshot();
          input.selectTimelineUnit(null);
        } catch (error) {
          input.setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '删除句段失败，请稍后重试。',
          });
        }
        return;
      case 'utterance':
        await input.deleteUtterance(id);
        return;
    }
  }, [input]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (ids.size === 0) return;
        try {
          input.pushUndo(`删除 ${ids.size} 个句段`);
          for (const id of ids) {
            await LayerSegmentationV2Service.deleteSegment(id);
          }
          await input.reloadSegments();
          await input.refreshSegmentUndoSnapshot();
          input.selectTimelineUnit(null);
        } catch (error) {
          await input.reloadSegments();
          input.setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '批量删除句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await input.deleteSelectedUtterances(ids);
        return;
    }
  }, [input]);

  return {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    deleteUtteranceRouted,
    deleteSelectedUtterancesRouted,
  };
}