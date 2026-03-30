import { useCallback } from 'react';
import type {
  LayerDocType,
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { createTimelineUnit } from '../hooks/transcriptionTypes';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { formatTime, newId } from '../utils/transcriptionFormatters';

type SegmentEditMode = 'utterance' | 'independent-segment' | 'time-subdivision';

interface SegmentRoutingResult {
  layer: LayerDocType | undefined;
  segmentSourceLayer: LayerDocType | undefined;
  sourceLayerId: string;
  editMode: SegmentEditMode;
}

interface CreateUtteranceOptions {
  speakerId?: string;
  focusedLayerId?: string;
}

interface UseTranscriptionSegmentCreationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  selectedTimelineMedia: MediaItemDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  speakerFocusTargetKey: string | null;
  utterancesOnCurrentMedia: UtteranceDocType[];
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  reloadSegmentContents: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSaveState: (state: SaveState) => void;
  createUtteranceFromSelection: (
    start: number,
    end: number,
    options?: CreateUtteranceOptions,
  ) => Promise<void>;
}

interface UseTranscriptionSegmentCreationControllerResult {
  createUtteranceFromSelectionRouted: (start: number, end: number) => Promise<void>;
}

export function useTranscriptionSegmentCreationController(
  input: UseTranscriptionSegmentCreationControllerInput,
): UseTranscriptionSegmentCreationControllerResult {
  const createUtteranceFromSelectionRouted = useCallback(async (start: number, end: number) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
      if (!input.selectedTimelineMedia) {
        input.setSaveState({ kind: 'error', message: '请先导入并选择音频。' });
        return;
      }
      const minSpan = 0.05;
      const gap = 0.02;
      const rawStart = Math.max(0, Math.min(start, end));
      const rawEnd = Math.max(start, end);
      if (!routing.layer || !routing.segmentSourceLayer) {
        console.error('未找到目标转写层');
        return;
      }
      const layerSegments = input.segmentsByLayer.get(routing.sourceLayerId);
      const siblings = [...(layerSegments ?? [])].sort((left, right) => left.startTime - right.startTime);
      const insertionIndex = siblings.findIndex((item) => item.startTime > rawStart);
      const prev = insertionIndex < 0
        ? siblings[siblings.length - 1]
        : insertionIndex === 0
          ? undefined
          : siblings[insertionIndex - 1];
      const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];
      const lowerBound = Math.max(0, prev ? prev.endTime + gap : 0);
      const mediaDuration = typeof input.selectedTimelineMedia.duration === 'number'
        ? input.selectedTimelineMedia.duration
        : Number.POSITIVE_INFINITY;
      const upperBound = Math.min(mediaDuration, next ? next.startTime - gap : Number.POSITIVE_INFINITY);
      const boundedStart = Math.max(lowerBound, rawStart);
      const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
      const boundedEnd = Math.min(upperBound, normalizedEnd);
      if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
        input.setSaveState({ kind: 'error', message: '选区与现有句段重叠，无法创建。请在空白区重新拖拽。' });
        return;
      }
      const finalStart = Number(boundedStart.toFixed(3));
      const finalEnd = Number(boundedEnd.toFixed(3));
      const now = new Date().toISOString();
      const newSeg: LayerSegmentDocType = {
        id: newId('seg'),
        textId: input.selectedTimelineMedia.textId,
        mediaId: input.selectedTimelineMedia.id,
        layerId: routing.sourceLayerId,
        startTime: finalStart,
        endTime: finalEnd,
        ...(input.speakerFocusTargetKey ? { speakerId: input.speakerFocusTargetKey } : {}),
        createdAt: now,
        updatedAt: now,
      };
      if (routing.editMode === 'time-subdivision') {
        // 时间细分：查找父 utterance 并裁剪 | Time subdivision: find parent utterance and clip
        const parentUtt = input.utterancesOnCurrentMedia.find(
          (utterance) => utterance.startTime <= finalStart + 0.01 && utterance.endTime >= finalEnd - 0.01,
        );
        if (!parentUtt) {
          input.setSaveState({ kind: 'error', message: '所选区间未落在任何句段范围内，无法在时间细分层创建。' });
          return;
        }
        newSeg.utteranceId = parentUtt.id;
        if (!newSeg.speakerId && parentUtt.speakerId) {
          newSeg.speakerId = parentUtt.speakerId;
        }
        input.pushUndo('新建句段');
        await LayerSegmentationV2Service.createSegmentWithParentConstraint(
          newSeg,
          parentUtt.id,
          parentUtt.startTime,
          parentUtt.endTime,
        );
      } else {
        // 独立层：查找重叠的 utterance 并关联，使说话人指派等功能可正常工作
        // Independent layer: find overlapping utterance and link it so speaker assignment etc. works
        const overlappingUtt = input.utterancesOnCurrentMedia.find(
          (utterance) => utterance.startTime <= finalEnd - 0.01 && utterance.endTime >= finalStart + 0.01,
        );
        if (overlappingUtt) {
          newSeg.utteranceId = overlappingUtt.id;
          if (!newSeg.speakerId && overlappingUtt.speakerId) {
            newSeg.speakerId = overlappingUtt.speakerId;
          }
        }
        input.pushUndo('新建句段');
        await LayerSegmentationV2Service.createSegment(newSeg);
      }
      await input.reloadSegments();
      await input.refreshSegmentUndoSnapshot();
      await input.reloadSegmentContents();
      input.selectTimelineUnit(createTimelineUnit(input.activeLayerIdForEdits, newSeg.id, 'segment'));
      input.setSaveState({
        kind: 'done',
        message: `已在当前层新建独立段 ${formatTime(finalStart)} - ${formatTime(finalEnd)}`,
      });
      return;
    }
    const resolvedLayerId = input.activeLayerIdForEdits;
    await input.createUtteranceFromSelection(start, end, {
      ...(input.speakerFocusTargetKey ? { speakerId: input.speakerFocusTargetKey } : {}),
      ...(resolvedLayerId ? { focusedLayerId: resolvedLayerId } : {}),
    });
  }, [input]);

  return { createUtteranceFromSelectionRouted };
}