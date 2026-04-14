import type {
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, tf, type Locale } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { formatTime, newId } from '../utils/transcriptionFormatters';
import { readStoredNewSegmentSelectionBehavior, type NewSegmentSelectionBehavior } from '../utils/transcriptionInteractionPreferences';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';

export interface CreateUtteranceOptions {
  speakerId?: string;
  focusedLayerId?: string;
  selectionBehavior?: NewSegmentSelectionBehavior;
}

export interface UseTranscriptionSegmentCreationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  selectedTimelineMedia: MediaItemDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  reloadSegmentContents: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSaveState: (state: SaveState) => void;
  createNextUtterance: (utterance: UtteranceDocType, duration: number) => Promise<void>;
  createUtteranceFromSelection: (
    start: number,
    end: number,
    options?: CreateUtteranceOptions,
  ) => Promise<void>;
}

export interface UseTranscriptionSegmentCreationControllerResult {
  createNextSegmentRouted: (targetId: string) => Promise<void>;
  createUtteranceFromSelectionRouted: (start: number, end: number) => Promise<void>;
}

function createSegmentTarget(activeLayerIdForEdits: string, unitId: string) {
  return resolveTranscriptionUnitTarget({
    layerId: activeLayerIdForEdits,
    unitId,
    preferredKind: 'segment',
  });
}

export function createTranscriptionSegmentCreationActions(
  input: UseTranscriptionSegmentCreationControllerInput,
  locale: Locale,
): UseTranscriptionSegmentCreationControllerResult {
  const finalizeCreatedSegment = async (
    segment: LayerSegmentDocType,
    messageKey: 'transcription.utteranceAction.done.createFromSelection' | 'transcription.utteranceAction.done.createNext',
  ) => {
    await input.reloadSegments();
    await input.refreshSegmentUndoSnapshot();
    await input.reloadSegmentContents();
    if (readStoredNewSegmentSelectionBehavior() === 'select-created') {
      input.selectTimelineUnit(createSegmentTarget(input.activeLayerIdForEdits, segment.id));
    }
    input.setSaveState({
      kind: 'done',
      message: tf(locale, messageKey, {
        start: formatTime(segment.startTime),
        end: formatTime(segment.endTime),
      }),
    });
  };

  const createSegmentInRoutedLayer = async (
    segment: LayerSegmentDocType,
    routing: SegmentRoutingResult,
    options: {
      doneMessageKey: 'transcription.utteranceAction.done.createFromSelection' | 'transcription.utteranceAction.done.createNext';
      parentUtterance?: UtteranceDocType;
    },
  ) => {
    const undoKey = options.doneMessageKey === 'transcription.utteranceAction.done.createNext'
      ? 'transcription.utteranceAction.undo.createNext'
      : 'transcription.utteranceAction.undo.createFromSelection';

    if (routing.editMode === 'time-subdivision') {
      const parentUtterance = options.parentUtterance;
      if (!parentUtterance) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
        return;
      }
      input.pushUndo(t(locale, undoKey));
      await LayerSegmentationV2Service.createSegmentWithParentConstraint(
        segment,
        parentUtterance.id,
        parentUtterance.startTime,
        parentUtterance.endTime,
      );
      await finalizeCreatedSegment(segment, options.doneMessageKey);
      return;
    }

    input.pushUndo(t(locale, undoKey));
    await LayerSegmentationV2Service.createSegment(segment);
    await finalizeCreatedSegment(segment, options.doneMessageKey);
  };

  const createNextSegmentRouted = async (targetId: string) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
      if (!input.selectedTimelineMedia) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.mediaRequired') });
        return;
      }
      if (!routing.layer || !routing.segmentSourceLayer) {
        console.error('Missing target transcription layer');
        return;
      }

      const gap = 0.02;
      const minSpan = 0.05;
      const siblings = [...(input.segmentsByLayer.get(routing.sourceLayerId) ?? [])].sort((left, right) => left.startTime - right.startTime);
      const targetSegment = siblings.find((segment) => segment.id === targetId);
      if (!targetSegment) {
        input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: targetId }) });
        return;
      }

      const targetIndex = siblings.findIndex((segment) => segment.id === targetId);
      const nextSegment = targetIndex >= 0 ? siblings[targetIndex + 1] : undefined;
      const startTime = Number((targetSegment.endTime + gap).toFixed(3));
      const mediaDuration = typeof input.selectedTimelineMedia.duration === 'number'
        ? input.selectedTimelineMedia.duration
        : Number.POSITIVE_INFINITY;

      let upperBound = Math.min(mediaDuration, nextSegment ? nextSegment.startTime - gap : Number.POSITIVE_INFINITY);
      let parentUtterance: UtteranceDocType | undefined;
      if (routing.editMode === 'time-subdivision') {
        parentUtterance = targetSegment.utteranceId
          ? input.utterancesOnCurrentMedia.find((utterance) => utterance.id === targetSegment.utteranceId)
          : input.utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= targetSegment.startTime + 0.01 && utterance.endTime >= targetSegment.endTime - 0.01,
          );
        if (!parentUtterance) {
          input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
          return;
        }
        upperBound = Math.min(upperBound, parentUtterance.endTime);
      }

      const fallbackEnd = startTime + 2;
      const endTime = Number(Math.min(upperBound, fallbackEnd).toFixed(3));
      if (!Number.isFinite(endTime) || endTime - startTime < minSpan) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.createFromSelectionOverlap') });
        return;
      }

      const now = new Date().toISOString();
      const newSeg: LayerSegmentDocType = {
        id: newId('seg'),
        textId: input.selectedTimelineMedia.textId,
        mediaId: input.selectedTimelineMedia.id,
        layerId: routing.sourceLayerId,
        startTime,
        endTime,
        ...(targetSegment.speakerId ? { speakerId: targetSegment.speakerId } : {}),
        createdAt: now,
        updatedAt: now,
      };

      if (parentUtterance) {
        newSeg.utteranceId = parentUtterance.id;
        if (!newSeg.speakerId && parentUtterance.speakerId) {
          newSeg.speakerId = parentUtterance.speakerId;
        }
      }

      await createSegmentInRoutedLayer(newSeg, routing, {
        doneMessageKey: 'transcription.utteranceAction.done.createNext',
        ...(parentUtterance ? { parentUtterance } : {}),
      });
      return;
    }

    const targetUtterance = input.utterancesOnCurrentMedia.find((utterance) => utterance.id === targetId);
    if (!targetUtterance) {
      input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: targetId }) });
      return;
    }
    const mediaDuration = typeof input.selectedTimelineMedia?.duration === 'number'
      ? input.selectedTimelineMedia.duration
      : targetUtterance.endTime + 2;
    await input.createNextUtterance(targetUtterance, mediaDuration);
  };

  const createUtteranceFromSelectionRouted = async (start: number, end: number) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
      if (!input.selectedTimelineMedia) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.mediaRequired') });
        return;
      }
      const minSpan = 0.05;
      const gap = 0.02;
      const rawStart = Math.max(0, Math.min(start, end));
      const rawEnd = Math.max(start, end);
      if (!routing.layer || !routing.segmentSourceLayer) {
        console.error('Missing target transcription layer');
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
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.createFromSelectionOverlap') });
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
        createdAt: now,
        updatedAt: now,
      };
      if (routing.editMode === 'time-subdivision') {
        const parentUtt = input.utterancesOnCurrentMedia.find(
          (utterance) => utterance.startTime <= finalStart + 0.01 && utterance.endTime >= finalEnd - 0.01,
        );
        if (!parentUtt) {
          input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
          return;
        }
        newSeg.utteranceId = parentUtt.id;
        if (!newSeg.speakerId && parentUtt.speakerId) {
          newSeg.speakerId = parentUtt.speakerId;
        }
        await createSegmentInRoutedLayer(newSeg, routing, {
          doneMessageKey: 'transcription.utteranceAction.done.createFromSelection',
          parentUtterance: parentUtt,
        });
      } else {
        const overlappingUtt = input.utterancesOnCurrentMedia.find(
          (utterance) => utterance.startTime <= finalEnd - 0.01 && utterance.endTime >= finalStart + 0.01,
        );
        if (overlappingUtt) {
          newSeg.utteranceId = overlappingUtt.id;
          if (!newSeg.speakerId && overlappingUtt.speakerId) {
            newSeg.speakerId = overlappingUtt.speakerId;
          }
        }
        await createSegmentInRoutedLayer(newSeg, routing, {
          doneMessageKey: 'transcription.utteranceAction.done.createFromSelection',
        });
      }
      return;
    }
    await input.createUtteranceFromSelection(start, end, {
      ...(input.activeLayerIdForEdits ? { focusedLayerId: input.activeLayerIdForEdits } : {}),
      selectionBehavior: readStoredNewSegmentSelectionBehavior(),
    });
  };

  return { createNextSegmentRouted, createUtteranceFromSelectionRouted };
}
