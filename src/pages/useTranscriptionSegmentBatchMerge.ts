import { useCallback, type MutableRefObject } from 'react';
import { getTranscriptionAppService } from '../app/index';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { t, useLocale } from '../i18n';
import { reportActionError } from '../utils/actionErrorReporter';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import { createMetricTags, recordDurationMetric } from '../observability/metrics';

interface UseTranscriptionSegmentBatchMergeInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  createSegmentTarget: (unitId: string, layerIdOverride?: string) => TimelineUnit | null;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  getUtteranceDocById: (id: string) => { id: string; startTime: number; endTime: number } | undefined;
  findUtteranceDocContainingRange: (start: number, end: number) => { id: string; startTime: number; endTime: number } | undefined;
  setSaveState: (state: SaveState) => void;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
  /** When concurrent segment mutations overlap, skip post-reload selection after stale reloads. */
  segmentMutationReloadGenRef: MutableRefObject<number>;
}

function setSegmentBatchMergeError(
  setSaveState: (state: SaveState) => void,
  actionLabel: string,
  error: unknown,
): void {
  const { message, meta } = reportActionError({ actionLabel, error, i18nKey: 'transcription.error.action.segmentMergeFailed' });
  setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) });
}

function recordBatchMergeLatency(status: 'success' | 'error', startedAtMs: number): void {
  try {
    recordDurationMetric(
      'business.transcription.segment_action_latency_ms',
      startedAtMs,
      createMetricTags('transcription', { action: 'merge_selection', status }),
    );
  } catch {
    // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
  }
}

export function useTranscriptionSegmentBatchMerge({
  activeLayerIdForEdits,
  resolveSegmentRoutingForLayer,
  pushUndo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  selectTimelineUnit,
  createSegmentTarget,
  unitsOnCurrentMedia,
  getUtteranceDocById,
  findUtteranceDocContainingRange,
  setSaveState,
  mergeSelectedUtterances,
  recordTimelineEdit,
  segmentMutationReloadGenRef,
}: UseTranscriptionSegmentBatchMergeInput): (ids: Set<string>, layerIdOverride?: string) => Promise<void> {
  const locale = useLocale();

  return useCallback(async (ids: Set<string>, layerIdOverride?: string) => {
    const startedAtMs = performance.now();
    if (ids.size > 0 && Array.from(ids).every((id) => unitsOnCurrentMedia.find((unit) => unit.id === id)?.kind === 'utterance')) {
      try {
        await mergeSelectedUtterances(ids);
        const firstId = [...ids][0];
        if (firstId) {
          recordTimelineEdit?.({
            action: 'merge',
            unitId: firstId,
            unitKind: 'utterance',
            ...(ids.size > 1 ? { detail: `batch=${ids.size}` } : {}),
          });
        }
        recordBatchMergeLatency('success', startedAtMs);
      } catch (error) {
        recordBatchMergeLatency('error', startedAtMs);
        throw error;
      }
      return;
    }
    const targetLayerId = layerIdOverride ?? activeLayerIdForEdits;
    const routing = resolveSegmentRoutingForLayer(targetLayerId);
    switch (routing.editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (!routing.segmentSourceLayer) return;
        const segments = unitsOnCurrentMedia
          .filter((unit) => unit.kind === 'segment' && unit.layerId === routing.sourceLayerId)
          .sort((left, right) => left.startTime - right.startTime);
        const selectedIndexes = segments
          .map((segment, index) => (ids.has(segment.id) ? index : -1))
          .filter((index) => index >= 0);
        if (selectedIndexes.length < 2) {
          const message = t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo');
          setSaveState({ kind: 'error', message });
          recordBatchMergeLatency('error', startedAtMs);
          throw new Error(message);
        }
        const hasGap = selectedIndexes.some((index, currentIndex) => currentIndex > 0 && index !== selectedIndexes[currentIndex - 1]! + 1);
        if (hasGap) {
          const message = t(locale, 'transcription.error.validation.segmentMergeRequireAdjacentSelection');
          setSaveState({ kind: 'error', message });
          recordBatchMergeLatency('error', startedAtMs);
          throw new Error(message);
        }

        const orderedSegments = selectedIndexes.map((index) => segments[index]!);
        const firstSegment = orderedSegments[0]!;
        const lastSegment = orderedSegments[orderedSegments.length - 1]!;
        if (routing.editMode === 'time-subdivision') {
          const parentUtt = (firstSegment.parentUtteranceId && firstSegment.parentUtteranceId === lastSegment.parentUtteranceId)
            ? getUtteranceDocById(firstSegment.parentUtteranceId)
            : findUtteranceDocContainingRange(firstSegment.startTime, lastSegment.endTime);
          if (!parentUtt) {
            const message = t(locale, 'transcription.error.validation.segmentMergeOutOfParentRange');
            setSaveState({ kind: 'error', message });
            recordBatchMergeLatency('error', startedAtMs);
            throw new Error(message);
          }
        }

        pushUndo(t(locale, 'transcription.utteranceAction.undo.mergeSelection'));
        try {
          segmentMutationReloadGenRef.current += 1;
          const postReloadToken = segmentMutationReloadGenRef.current;
          const appService = getTranscriptionAppService();
          for (let index = 1; index < orderedSegments.length; index += 1) {
            await appService.mergeAdjacentSegments(firstSegment.id, orderedSegments[index]!.id);
          }
          await reloadSegments();
          if (segmentMutationReloadGenRef.current !== postReloadToken) {
            recordBatchMergeLatency('success', startedAtMs);
            return;
          }
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(createSegmentTarget(firstSegment.id, targetLayerId));
          recordTimelineEdit?.({
            action: 'merge',
            unitId: firstSegment.id,
            unitKind: 'segment',
            ...(orderedSegments.length > 2 ? { detail: `merged=${orderedSegments.length}` } : {}),
          });
          recordBatchMergeLatency('success', startedAtMs);
        } catch (error) {
          setSegmentBatchMergeError(setSaveState, t(locale, 'transcription.utteranceAction.undo.mergeSelection'), error);
          recordBatchMergeLatency('error', startedAtMs);
          throw error instanceof Error ? error : new Error(String(error));
        }
        return;
      }
      case 'utterance': {
        break;
      }
    }

    try {
      await mergeSelectedUtterances(ids);
      recordBatchMergeLatency('success', startedAtMs);
    } catch (error) {
      recordBatchMergeLatency('error', startedAtMs);
      throw error;
    }
    return;
  }, [activeLayerIdForEdits, createSegmentTarget, findUtteranceDocContainingRange, getUtteranceDocById, locale, mergeSelectedUtterances, pushUndo, recordTimelineEdit, refreshSegmentUndoSnapshot, reloadSegments, resolveSegmentRoutingForLayer, segmentMutationReloadGenRef, selectTimelineUnit, setSaveState, unitsOnCurrentMedia]);
}