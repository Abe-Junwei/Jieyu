import { useMemo } from 'react';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { resolveTimelineShellMode } from '../utils/timelineShellMode';

export type TimelineReadModelAcousticState = 'no_media' | 'pending_decode' | 'playable';

export interface TimelineReadModel {
  epoch: number;
  unitIndex: TimelineUnitViewIndexWithEpoch;
  layers: {
    transcriptionLayerIds: string[];
    translationLayerIds: string[];
    activeTextTimelineMode?: 'document' | 'media' | null;
  };
  selection: {
    selectedTimelineUnit: TimelineUnit | null;
    selectedUnitIds: string[];
    activeLayerIdForEdits?: string;
  };
  zoom: {
    zoomPxPerSec?: number;
    fitPxPerSec?: number;
    waveformScrollLeft?: number;
    logicalTimelineDurationSec?: number;
  };
  acoustic: {
    shell: 'waveform' | 'text-only' | 'empty';
    state: TimelineReadModelAcousticState;
    selectedMediaId?: string;
    selectedMediaUrl?: string | null;
    playerIsReady: boolean;
    playerDuration: number;
  };
}

export interface BuildTimelineReadModelInput {
  unitIndex: TimelineUnitViewIndexWithEpoch;
  transcriptionLayerIds: string[];
  translationLayerIds: string[];
  selectedTimelineUnit: TimelineUnit | null;
  selectedUnitIds: string[];
  activeLayerIdForEdits?: string;
  activeTextTimelineMode?: 'document' | 'media' | null;
  logicalTimelineDurationSec?: number;
  zoomPxPerSec?: number;
  fitPxPerSec?: number;
  waveformScrollLeft?: number;
  selectedMediaId?: string;
  selectedMediaUrl?: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  verticalViewEnabled?: boolean;
}

function resolveAcousticState(input: {
  shell: 'waveform' | 'text-only' | 'empty';
  playableAcoustic: boolean;
  acousticPending: boolean;
}): TimelineReadModelAcousticState {
  if (input.playableAcoustic) return 'playable';
  if (input.acousticPending) return 'pending_decode';
  return 'no_media';
}

export function buildTimelineReadModel(input: BuildTimelineReadModelInput): TimelineReadModel {
  const shellMode = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: input.unitIndex.totalCount,
    ...(input.verticalViewEnabled !== undefined ? { verticalViewEnabled: input.verticalViewEnabled } : {}),
  });

  return {
    epoch: input.unitIndex.epoch,
    unitIndex: input.unitIndex,
    layers: {
      transcriptionLayerIds: input.transcriptionLayerIds,
      translationLayerIds: input.translationLayerIds,
      ...(input.activeTextTimelineMode !== undefined ? { activeTextTimelineMode: input.activeTextTimelineMode } : {}),
    },
    selection: {
      selectedTimelineUnit: input.selectedTimelineUnit,
      selectedUnitIds: input.selectedUnitIds,
      ...(input.activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
    },
    zoom: {
      ...(input.zoomPxPerSec !== undefined ? { zoomPxPerSec: input.zoomPxPerSec } : {}),
      ...(input.fitPxPerSec !== undefined ? { fitPxPerSec: input.fitPxPerSec } : {}),
      ...(input.waveformScrollLeft !== undefined ? { waveformScrollLeft: input.waveformScrollLeft } : {}),
      ...(input.logicalTimelineDurationSec !== undefined ? { logicalTimelineDurationSec: input.logicalTimelineDurationSec } : {}),
    },
    acoustic: {
      shell: shellMode.shell,
      state: resolveAcousticState(shellMode),
      ...(input.selectedMediaId !== undefined ? { selectedMediaId: input.selectedMediaId } : {}),
      ...(input.selectedMediaUrl !== undefined ? { selectedMediaUrl: input.selectedMediaUrl } : {}),
      playerIsReady: input.playerIsReady,
      playerDuration: input.playerDuration,
    },
  };
}

export function useTimelineReadModel(input: BuildTimelineReadModelInput): TimelineReadModel {
  return useMemo(
    () => buildTimelineReadModel(input),
    [
      input.unitIndex,
      input.transcriptionLayerIds,
      input.translationLayerIds,
      input.selectedTimelineUnit,
      input.selectedUnitIds,
      input.activeLayerIdForEdits,
      input.activeTextTimelineMode,
      input.logicalTimelineDurationSec,
      input.zoomPxPerSec,
      input.fitPxPerSec,
      input.waveformScrollLeft,
      input.selectedMediaId,
      input.selectedMediaUrl,
      input.playerIsReady,
      input.playerDuration,
      input.verticalViewEnabled,
    ],
  );
}
