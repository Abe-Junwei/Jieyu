import { useCallback } from 'react';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { t, useLocale } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';

interface UseTranscriptionSegmentBatchMergeInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  createSegmentTarget: (unitId: string, layerIdOverride?: string) => TimelineUnit | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  setSaveState: (state: SaveState) => void;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
}

function setSegmentBatchMergeError(
  setSaveState: (state: SaveState) => void,
  actionLabel: string,
  error: unknown,
): void {
  const { message, meta } = reportActionError({ actionLabel, error, i18nKey: 'transcription.error.action.segmentMergeFailed' });
  setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) });
}

export function useTranscriptionSegmentBatchMerge({
  activeLayerIdForEdits,
  resolveSegmentRoutingForLayer,
  pushUndo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  selectTimelineUnit,
  createSegmentTarget,
  segmentsByLayer,
  utterancesOnCurrentMedia,
  setSaveState,
  mergeSelectedUtterances,
}: UseTranscriptionSegmentBatchMergeInput): (ids: Set<string>, layerIdOverride?: string) => Promise<void> {
  const locale = useLocale();

  return useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (!routing.segmentSourceLayer) return;
        const segments = segmentsByLayer.get(routing.sourceLayerId) ?? [];
        const selectedIndexes = segments
          .map((segment, index) => (ids.has(segment.id) ? index : -1))
          .filter((index) => index >= 0);
        if (selectedIndexes.length < 2) {
          const message = t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo');
          setSaveState({ kind: 'error', message });
          throw new Error(message);
        }
        const hasGap = selectedIndexes.some((index, currentIndex) => currentIndex > 0 && index !== selectedIndexes[currentIndex - 1]! + 1);
        if (hasGap) {
          const message = t(locale, 'transcription.error.validation.segmentMergeRequireAdjacentSelection');
          setSaveState({ kind: 'error', message });
          throw new Error(message);
        }

        const orderedSegments = selectedIndexes.map((index) => segments[index]!);
        const firstSegment = orderedSegments[0]!;
        const lastSegment = orderedSegments[orderedSegments.length - 1]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= firstSegment.startTime + 0.01 && utterance.endTime >= lastSegment.endTime - 0.01,
          );
          if (!parentUtt) {
            const message = t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange');
            setSaveState({ kind: 'error', message });
            throw new Error(message);
          }
        }

        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergeSelection'));
        try {
          for (let index = 1; index < orderedSegments.length; index += 1) {
            await LayerSegmentationV2Service.mergeAdjacentSegments(firstSegment.id, orderedSegments[index]!.id);
          }
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(firstSegment.id, targetLayerId));
        } catch (error) {
          setSegmentBatchMergeError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergeSelection'), error);
          throw error instanceof Error ? error : new Error(String(error));
        }
        return;
      }
      case 'utterance':
        await mergeSelectedUtterances(ids);
        return;
    }
  }, [activeLayerIdForEdits, createSegmentTarget, locale, mergeSelectedUtterances, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentsByLayer, selectTimelineUnit, setSaveState, utterancesOnCurrentMedia]);
}