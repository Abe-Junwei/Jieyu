import type { LayerUnitDocType, MediaItemDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { t, tf, type Locale } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { formatTime, newId } from '../utils/transcriptionFormatters';
import { readStoredNewSegmentSelectionBehavior, type NewSegmentSelectionBehavior } from '../utils/transcriptionInteractionPreferences';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { type ParentUnitBounds } from './timelineUnitViewUnitHelpers';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';

export interface CreateUnitOptions {
  speakerId?: string;
  focusedLayerId?: string;
  selectionBehavior?: NewSegmentSelectionBehavior;
}

export interface UseTranscriptionSegmentCreationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  selectedTimelineMedia: MediaItemDocType | null;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  /** Resolve full unit row for create-next / DB writes; must match unified view ids on current media. */
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  findUnitDocContainingRange: (start: number, end: number) => LayerUnitDocType | undefined;
  findOverlappingUnitDoc: (start: number, end: number) => LayerUnitDocType | undefined;
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  reloadSegmentContents: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSaveState: (state: SaveState) => void;
  createAdjacentUnit: (unit: LayerUnitDocType, duration: number) => Promise<void>;
  createUnitFromSelection: (
    start: number,
    end: number,
    options?: CreateUnitOptions,
  ) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

export interface UseTranscriptionSegmentCreationControllerResult {
  createNextSegmentRouted: (targetId: string) => Promise<void>;
  createUnitFromSelectionRouted: (start: number, end: number) => Promise<void>;
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
  const resolveParentUnitForSegment = (segment: {
    parentUnitId?: string;
    startTime: number;
    endTime: number;
  }): ParentUnitBounds | undefined => {
    if (segment.parentUnitId) {
      const byId = input.getUnitDocById(segment.parentUnitId);
      if (byId) return byId;
    }
    return input.findUnitDocContainingRange(segment.startTime, segment.endTime);
  };

  const resolveSegmentUnitsForLayer = (layerId: string): TimelineUnitView[] => (
    input.unitsOnCurrentMedia
      .filter((unit) => unit.kind === 'segment' && unit.layerId === layerId)
      .sort((left, right) => left.startTime - right.startTime)
  );

  const finalizeCreatedSegment = async (
    segment: LayerUnitDocType,
    messageKey: 'transcription.unitAction.done.createFromSelection' | 'transcription.unitAction.done.createNext',
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
    input.recordTimelineEdit?.({ action: 'create', unitId: segment.id, unitKind: 'segment' });
  };

  const createSegmentInRoutedLayer = async (
    segment: LayerUnitDocType,
    routing: SegmentRoutingResult,
    options: {
      doneMessageKey: 'transcription.unitAction.done.createFromSelection' | 'transcription.unitAction.done.createNext';
      parentUnit?: ParentUnitBounds;
    },
  ) => {
    const undoKey = options.doneMessageKey === 'transcription.unitAction.done.createNext'
      ? 'transcription.unitAction.undo.createNext'
      : 'transcription.unitAction.undo.createFromSelection';

    if (routing.editMode === 'time-subdivision') {
      const parentUnit = options.parentUnit;
      if (!parentUnit) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
        return;
      }
      input.pushUndo(t(locale, undoKey));
      await LayerSegmentationV2Service.createSegmentWithParentConstraint(
        segment,
        parentUnit.id,
        parentUnit.startTime,
        parentUnit.endTime,
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
      const siblings = resolveSegmentUnitsForLayer(routing.sourceLayerId);
      const targetSegment = siblings.find((segment) => segment.id === targetId);
      if (!targetSegment) {
        input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: targetId }) });
        return;
      }

      const targetIndex = siblings.findIndex((segment) => segment.id === targetId);
      const nextSegment = targetIndex >= 0 ? siblings[targetIndex + 1] : undefined;
      const startTime = Number((targetSegment.endTime + gap).toFixed(3));
      const mediaDuration = typeof input.selectedTimelineMedia.duration === 'number'
        ? input.selectedTimelineMedia.duration
        : Number.POSITIVE_INFINITY;

      let upperBound = Math.min(mediaDuration, nextSegment ? nextSegment.startTime - gap : Number.POSITIVE_INFINITY);
      let parentUnit: ParentUnitBounds | undefined;
      if (routing.editMode === 'time-subdivision') {
        parentUnit = resolveParentUnitForSegment(targetSegment);
        if (!parentUnit) {
          input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
          return;
        }
        upperBound = Math.min(upperBound, parentUnit.endTime);
      }

      const fallbackEnd = startTime + 2;
      const endTime = Number(Math.min(upperBound, fallbackEnd).toFixed(3));
      if (!Number.isFinite(endTime) || endTime - startTime < minSpan) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.createFromSelectionOverlap') });
        return;
      }

      const now = new Date().toISOString();
      const newSeg: LayerUnitDocType = {
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

      if (parentUnit) {
        newSeg.unitId = parentUnit.id;
        if (!newSeg.speakerId && parentUnit.speakerId) {
          newSeg.speakerId = parentUnit.speakerId;
        }
      }

      await createSegmentInRoutedLayer(newSeg, routing, {
        doneMessageKey: 'transcription.unitAction.done.createNext',
        ...(parentUnit ? { parentUnit } : {}),
      });
      return;
    }

    const targetUnit = input.getUnitDocById(targetId);
    if (!targetUnit) {
      input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: targetId }) });
      return;
    }
    const mediaDuration = typeof input.selectedTimelineMedia?.duration === 'number'
      ? input.selectedTimelineMedia.duration
      : targetUnit.endTime + 2;
    await input.createAdjacentUnit(targetUnit, mediaDuration);
  };

  const createUnitFromSelectionRouted = async (start: number, end: number) => {
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
      const siblings = resolveSegmentUnitsForLayer(routing.sourceLayerId);
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
      const newSeg: LayerUnitDocType = {
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
        const parentUtt = input.findUnitDocContainingRange(finalStart, finalEnd);
        if (!parentUtt) {
          input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
          return;
        }
        newSeg.unitId = parentUtt.id;
        if (!newSeg.speakerId && parentUtt.speakerId) {
          newSeg.speakerId = parentUtt.speakerId;
        }
        await createSegmentInRoutedLayer(newSeg, routing, {
          doneMessageKey: 'transcription.unitAction.done.createFromSelection',
          parentUnit: parentUtt,
        });
      } else {
        const overlappingUtt = input.findOverlappingUnitDoc(finalStart, finalEnd);
        if (overlappingUtt) {
          newSeg.unitId = overlappingUtt.id;
          if (!newSeg.speakerId && overlappingUtt.speakerId) {
            newSeg.speakerId = overlappingUtt.speakerId;
          }
        }
        await createSegmentInRoutedLayer(newSeg, routing, {
          doneMessageKey: 'transcription.unitAction.done.createFromSelection',
        });
      }
      return;
    }
    await input.createUnitFromSelection(start, end, {
      ...(input.activeLayerIdForEdits ? { focusedLayerId: input.activeLayerIdForEdits } : {}),
      selectionBehavior: readStoredNewSegmentSelectionBehavior(),
    });
  };

  return { createNextSegmentRouted, createUnitFromSelectionRouted };
}
