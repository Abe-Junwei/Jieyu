import type { MediaItemDocType } from '../types/jieyuDbDocTypes';

import type { BuildReadyWorkspaceAssistantBridgeInput } from './transcriptionReadyWorkspaceAssistantBridgeInput';
import { buildReadyWorkspaceAssistantBridgeInput } from './transcriptionReadyWorkspaceAssistantBridgeInput';

export type ReadyWorkspaceAssistantBridgeNoteLike = { category?: string | null };

export function summarizeReadyWorkspaceNoteCategoriesByKey(
  currentNotes: readonly ReadyWorkspaceAssistantBridgeNoteLike[],
): Record<string, number> {
  return currentNotes.reduce<Record<string, number>>((acc, note) => {
    const category = (note.category ?? 'comment').trim();
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});
}

export function buildLaneLockEntriesForAiFromEffectiveMap(
  effectiveLaneLockMap: Readonly<Record<string, unknown>>,
): Array<{ speakerId: string; laneIndex: number }> {
  return Object.entries(effectiveLaneLockMap)
    .filter(([, laneIndex]) => typeof laneIndex === 'number' && Number.isFinite(laneIndex))
    .slice(0, 16)
    .map(([speakerId, laneIndex]) => ({ speakerId, laneIndex: Math.floor(laneIndex as number) }));
}

export type ReadyWorkspaceAssistantBridgeTimelineViewportProjectionLike = {
  documentSpanSec: number;
  zoomPercent?: number;
  maxZoomPercent?: number;
  zoomPxPerSec?: number;
  fitPxPerSec?: number;
  rulerView?: { start: number; end: number } | null;
  waveformScrollLeft?: number;
};

export function buildReadyWorkspaceAssistantBridgeInputForOrchestrator(input: {
  bridge: Omit<BuildReadyWorkspaceAssistantBridgeInput, 'noteSummary' | 'visibleTimelineState'>;
  currentNotes: readonly ReadyWorkspaceAssistantBridgeNoteLike[];
  focusedLayerRowId?: string | null;
  notePopover: { uttId?: string } | null | undefined;
  selectedTimelineMedia?: MediaItemDocType | null | undefined;
  selectedLayerId?: string;
  selectedUnitIds: Set<string>;
  verticalViewActive: boolean;
  transcriptionTrackMode: string;
  timelineViewportProjection: ReadyWorkspaceAssistantBridgeTimelineViewportProjectionLike;
  effectiveLaneLockMap: Readonly<Record<string, unknown>>;
  selectedSpeakerIdsForTrackLock: readonly string[];
  activeSpeakerFilterKey: string;
}): ReturnType<typeof buildReadyWorkspaceAssistantBridgeInput> {
  const {
    bridge,
    currentNotes,
    focusedLayerRowId,
    notePopover,
    selectedTimelineMedia,
    selectedLayerId,
    selectedUnitIds,
    verticalViewActive,
    transcriptionTrackMode,
    timelineViewportProjection,
    effectiveLaneLockMap,
    selectedSpeakerIdsForTrackLock,
    activeSpeakerFilterKey,
  } = input;

  const noteCategorySummary = summarizeReadyWorkspaceNoteCategoriesByKey(currentNotes);
  const laneLockEntriesForAi = buildLaneLockEntriesForAiFromEffectiveMap(effectiveLaneLockMap);

  return buildReadyWorkspaceAssistantBridgeInput({
    ...bridge,
    noteSummary: {
      count: currentNotes.length,
      byCategory: noteCategorySummary,
      ...(focusedLayerRowId ? { focusedLayerId: focusedLayerRowId } : {}),
      ...(notePopover?.uttId ? { currentTargetUnitId: notePopover.uttId } : {}),
    },
    visibleTimelineState: {
      ...(selectedTimelineMedia?.id ? { currentMediaId: selectedTimelineMedia.id } : {}),
      ...(selectedTimelineMedia?.filename
        ? { currentMediaFilename: selectedTimelineMedia.filename }
        : {}),
      ...(focusedLayerRowId ? { focusedLayerId: focusedLayerRowId } : {}),
      ...(selectedLayerId ? { selectedLayerId } : {}),
      selectedUnitCount: selectedUnitIds.size,
      verticalViewActive,
      transcriptionTrackMode,
      ...(timelineViewportProjection.documentSpanSec > 0
        ? { documentSpanSec: timelineViewportProjection.documentSpanSec }
        : {}),
      ...(typeof timelineViewportProjection.zoomPercent === 'number' &&
      Number.isFinite(timelineViewportProjection.zoomPercent)
        ? { zoomPercent: timelineViewportProjection.zoomPercent }
        : {}),
      ...(typeof timelineViewportProjection.maxZoomPercent === 'number' &&
      Number.isFinite(timelineViewportProjection.maxZoomPercent)
        ? { maxZoomPercent: timelineViewportProjection.maxZoomPercent }
        : {}),
      ...(typeof timelineViewportProjection.zoomPxPerSec === 'number' &&
      Number.isFinite(timelineViewportProjection.zoomPxPerSec)
        ? { zoomPxPerSec: timelineViewportProjection.zoomPxPerSec }
        : {}),
      ...(typeof timelineViewportProjection.fitPxPerSec === 'number' &&
      Number.isFinite(timelineViewportProjection.fitPxPerSec)
        ? { fitPxPerSec: timelineViewportProjection.fitPxPerSec }
        : {}),
      ...(timelineViewportProjection.rulerView
        ? {
            rulerVisibleStartSec: timelineViewportProjection.rulerView.start,
            rulerVisibleEndSec: timelineViewportProjection.rulerView.end,
          }
        : {}),
      ...(typeof timelineViewportProjection.waveformScrollLeft === 'number' &&
      Number.isFinite(timelineViewportProjection.waveformScrollLeft)
        ? { waveformScrollLeftPx: timelineViewportProjection.waveformScrollLeft }
        : {}),
      ...(laneLockEntriesForAi.length > 0
        ? {
            laneLockSpeakerCount: Object.keys(effectiveLaneLockMap).length,
            laneLocks: laneLockEntriesForAi,
          }
        : {}),
      ...(selectedSpeakerIdsForTrackLock.length > 0
        ? { trackLockSpeakerIds: [...selectedSpeakerIdsForTrackLock] }
        : {}),
      activeSpeakerFilterKey,
    },
  });
}
