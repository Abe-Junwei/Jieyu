import { useMemo } from 'react';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import {
  computeEffectiveTimelineShellLayersCount,
  resolveTimelineShellMode,
  timelineShellModeResultToAcousticState,
} from '../utils/timelineShellMode';
import { resolveTimelineExtentSec } from '../utils/timelineExtent';

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
  timeline: {
    extentSec: number;
  };
  acoustic: {
    shell: 'waveform' | 'text-only' | 'empty';
    /**
     * 宿主 / tier 与 `resolveTimelineShellMode` 合同一致（含纵向对读下对 `playableAcoustic` 的短路），供声学条 chrome 等消费。
     */
    state: TimelineReadModelAcousticState;
    /**
     * 媒体 URL + 解码器就绪事实，**不**应用纵向宿主短路；供工具栏、编排 `playableAcoustic`、顶栏轴状态等消费。
     */
    globalState: TimelineReadModelAcousticState;
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
  /** 与编排 `layersCount`（通常 `layers.length`）一致，用于与 timeline content VM 的壳层计数对齐。 */
  orchestratorLayersCount?: number;
}

export function buildTimelineReadModel(input: BuildTimelineReadModelInput): TimelineReadModel {
  const timelineShellLayersCount = computeEffectiveTimelineShellLayersCount({
    orchestratorLayersCount: input.orchestratorLayersCount ?? 0,
    transcriptionLayerCount: input.transcriptionLayerIds.length,
    translationLayerCount: input.translationLayerIds.length,
  });
  const contractShellMode = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: timelineShellLayersCount,
    ...(input.verticalViewEnabled !== undefined ? { verticalViewEnabled: input.verticalViewEnabled } : {}),
  });
  /** 与合同壳一致，但忽略纵向视图开关，避免把「宿主不挂波形轨」误读成「全页媒体不可播」。 */
  const globalShellMode = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: timelineShellLayersCount,
  });
  const timelineExtentSec = resolveTimelineExtentSec({
    selectedMediaUrl: input.selectedMediaUrl ?? null,
    globalPlaybackReady: globalShellMode.playableAcoustic,
    playerDuration: input.playerDuration,
    ...(input.logicalTimelineDurationSec !== undefined
      ? { logicalTimelineDurationSec: input.logicalTimelineDurationSec }
      : {}),
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
    timeline: {
      extentSec: timelineExtentSec,
    },
    acoustic: {
      shell: contractShellMode.shell,
      state: timelineShellModeResultToAcousticState(contractShellMode),
      globalState: timelineShellModeResultToAcousticState(globalShellMode),
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
      input.orchestratorLayersCount,
    ],
  );
}
