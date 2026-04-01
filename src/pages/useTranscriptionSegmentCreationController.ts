import { useCallback } from 'react';
import type {
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { formatTime, newId } from '../utils/transcriptionFormatters';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';

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
  const locale = useLocale();

  const createSegmentTarget = (unitId: string) => resolveTranscriptionUnitTarget({
    layerId: input.activeLayerIdForEdits,
    unitId,
    preferredKind: 'segment',
  });

  const createUtteranceFromSelectionRouted = useCallback(async (start: number, end: number) => {
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
        ...(input.speakerFocusTargetKey ? { speakerId: input.speakerFocusTargetKey } : {}),
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
        input.pushUndo(t(locale, 'transcription.utteranceAction.undo.createFromSelection'));
        await LayerSegmentationV2Service.createSegmentWithParentConstraint(
          newSeg,
          parentUtt.id,
          parentUtt.startTime,
          parentUtt.endTime,
        );
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
        input.pushUndo(t(locale, 'transcription.utteranceAction.undo.createFromSelection'));
        await LayerSegmentationV2Service.createSegment(newSeg);
      }
      await input.reloadSegments();
      await input.refreshSegmentUndoSnapshot();
      await input.reloadSegmentContents();
      input.selectTimelineUnit(createSegmentTarget(newSeg.id));
      input.setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.utteranceAction.done.createFromSelection', {
          start: formatTime(finalStart),
          end: formatTime(finalEnd),
        }),
      });
      return;
    }
    await input.createUtteranceFromSelection(start, end, {
      ...(input.speakerFocusTargetKey ? { speakerId: input.speakerFocusTargetKey } : {}),
      ...(input.activeLayerIdForEdits ? { focusedLayerId: input.activeLayerIdForEdits } : {}),
    });
  }, [input, locale]);

  return { createUtteranceFromSelectionRouted };
}
