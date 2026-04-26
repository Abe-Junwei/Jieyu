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
import { assertTimelineMediaForMutation } from '../utils/assertTimelineMediaForMutation';
import { clampIndependentSegmentInsertionRange } from '../utils/independentSegmentInsertionRange';
import {
  independentSegmentInsertionUpperBoundSec,
  mediaDurationSecForTimeBounds,
} from '../utils/timelineMediaDurationForBounds';

export interface CreateUnitOptions {
  speakerId?: string;
  focusedLayerId?: string;
  selectionBehavior?: NewSegmentSelectionBehavior;
}

export interface UseTranscriptionSegmentCreationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  selectedTimelineMedia: MediaItemDocType | null;
  /** 与波形桥 `documentSpanSec` 一致；用于独立语段钳制上界 ≥ 文献轴跨度 */
  documentSpanSec?: number;
  /** 与桥内每帧计算一致时优先，避免页首 hook 在波形桥之前无法读到解码后文献秒 */
  getDocumentSpanSec?: () => number | undefined;
  ensureTimelineMediaRowResolved?: () => Promise<MediaItemDocType | null>;
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
  createAdjacentUnit: (unit: LayerUnitDocType, duration: number) => Promise<string | void>;
  createUnitFromSelection: (
    start: number,
    end: number,
    options?: CreateUnitOptions,
  ) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

export interface UseTranscriptionSegmentCreationControllerResult {
  createNextSegmentRouted: (targetId: string) => Promise<string | undefined>;
  createUnitFromSelectionRouted: (start: number, end: number) => Promise<void>;
}

function createSegmentTarget(activeLayerIdForEdits: string, unitId: string) {
  return resolveTranscriptionUnitTarget({
    layerId: activeLayerIdForEdits,
    unitId,
    preferredKind: 'segment',
  });
}

function resolveDocumentSpanInputSec(
  input: UseTranscriptionSegmentCreationControllerInput,
): number | undefined {
  if (typeof input.getDocumentSpanSec === 'function') {
    const v = input.getDocumentSpanSec();
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return v;
    }
  }
  if (typeof input.documentSpanSec === 'number'
    && Number.isFinite(input.documentSpanSec)
    && input.documentSpanSec > 0) {
    return input.documentSpanSec;
  }
  return undefined;
}

export function createTranscriptionSegmentCreationActions(
  input: UseTranscriptionSegmentCreationControllerInput,
  locale: Locale,
): UseTranscriptionSegmentCreationControllerResult {
  const resolveTimelineMediaForMutation = async (): Promise<MediaItemDocType | null> => {
    if (input.selectedTimelineMedia) return input.selectedTimelineMedia;
    if (!input.ensureTimelineMediaRowResolved) return null;
    return input.ensureTimelineMediaRowResolved();
  };

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

  const createNextSegmentRouted = async (targetId: string): Promise<string | undefined> => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
      const selectedMedia = await resolveTimelineMediaForMutation();
      if (!assertTimelineMediaForMutation(selectedMedia, { locale, setSaveState: input.setSaveState })) {
        return undefined;
      }
      if (!routing.layer || !routing.segmentSourceLayer) {
        console.error('Missing target transcription layer');
        return undefined;
      }

      const gap = 0.02;
      const minSpan = 0.05;
      const siblings = resolveSegmentUnitsForLayer(routing.sourceLayerId);
      const targetSegment = siblings.find((segment) => segment.id === targetId);
      if (!targetSegment) {
        input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: targetId }) });
        return undefined;
      }

      const targetIndex = siblings.findIndex((segment) => segment.id === targetId);
      const nextSegment = targetIndex >= 0 ? siblings[targetIndex + 1] : undefined;
      const startTime = Number((targetSegment.endTime + gap).toFixed(3));
      const mediaDuration = independentSegmentInsertionUpperBoundSec(
        selectedMedia,
        resolveDocumentSpanInputSec(input),
      );

      let upperBound = Math.min(mediaDuration, nextSegment ? nextSegment.startTime - gap : Number.POSITIVE_INFINITY);
      let parentUnit: ParentUnitBounds | undefined;
      if (routing.editMode === 'time-subdivision') {
        parentUnit = resolveParentUnitForSegment(targetSegment);
        if (!parentUnit) {
          input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.segmentCreateNoParentSubdivision') });
          return undefined;
        }
        upperBound = Math.min(upperBound, parentUnit.endTime);
      }

      const fallbackEnd = startTime + 2;
      const endTime = Number(Math.min(upperBound, fallbackEnd).toFixed(3));
      if (!Number.isFinite(endTime) || endTime - startTime < minSpan) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.createFromSelectionOverlap') });
        return undefined;
      }

      const now = new Date().toISOString();
      const newSeg: LayerUnitDocType = {
        id: newId('seg'),
        textId: selectedMedia.textId,
        mediaId: selectedMedia.id,
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
      return newSeg.id;
    }

    const targetUnit = input.getUnitDocById(targetId);
    if (!targetUnit) {
      input.setSaveState({ kind: 'error', message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: targetId }) });
      return undefined;
    }
    const cap = mediaDurationSecForTimeBounds(input.selectedTimelineMedia);
    const mediaDuration = cap === Number.POSITIVE_INFINITY ? targetUnit.endTime + 2 : cap;
    const createdUnitId = await input.createAdjacentUnit(targetUnit, mediaDuration);
    return typeof createdUnitId === 'string' && createdUnitId.length > 0 ? createdUnitId : undefined;
  };

  const createUnitFromSelectionRouted = async (start: number, end: number) => {
    const routing = input.resolveSegmentRoutingForLayer(input.activeLayerIdForEdits);
    if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
      const selectedMedia = await resolveTimelineMediaForMutation();
      if (!assertTimelineMediaForMutation(selectedMedia, { locale, setSaveState: input.setSaveState })) {
        return;
      }
      const rawStart = Math.max(0, Math.min(start, end));
      const rawEnd = Math.max(start, end);
      if (!routing.layer || !routing.segmentSourceLayer) {
        console.error('Missing target transcription layer');
        return;
      }
      const siblings = resolveSegmentUnitsForLayer(routing.sourceLayerId);
      const mediaDuration = independentSegmentInsertionUpperBoundSec(
        selectedMedia,
        resolveDocumentSpanInputSec(input),
      );
      const clamped = clampIndependentSegmentInsertionRange(
        rawStart,
        rawEnd,
        siblings.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
        mediaDuration,
      );
      if (!clamped.ok) {
        input.setSaveState({ kind: 'error', message: t(locale, 'transcription.error.validation.createFromSelectionOverlap') });
        return;
      }
      const { start: finalStart, end: finalEnd } = clamped;
      const now = new Date().toISOString();
      const newSeg: LayerUnitDocType = {
        id: newId('seg'),
        textId: selectedMedia.textId,
        mediaId: selectedMedia.id,
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
          // 独立边界 segment 不写宿主 unitId：否则多条 segment 在 `buildTimelineUnitViewIndex` 中共用 parent 语义键被覆盖，钳制只看到一条而误报重叠。
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
