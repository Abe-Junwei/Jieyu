import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { OrthographyDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type WaveSurfer from 'wavesurfer.js';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

let lastTimelineSeekTelemetryMs = 0;
const TIMELINE_SEEK_TELEMETRY_INTERVAL_MS = 280;

function recordTimelineSeekTelemetryThrottled(): void {
  const now = Date.now();
  if (now - lastTimelineSeekTelemetryMs < TIMELINE_SEEK_TELEMETRY_INTERVAL_MS) return;
  lastTimelineSeekTelemetryMs = now;
  recordTranscriptionKeyboardAction('timelineSeek');
}

interface CreateTranscriptionTimelineTopPropsInput {
  player: {
    duration: number;
    seekTo: (time: number) => void;
    isReady: boolean;
    instanceRef: RefObject<WaveSurfer | null>;
    isPlaying: boolean;
    stop: () => void;
  };
  unitsOnCurrentMedia: LayerUnitDocType[];
  rulerView: { start: number; end: number } | null;
  zoomPxPerSec: number;
  isTimelineLaneHeaderCollapsed: boolean;
  toggleTimelineLaneHeader: () => void;
  waveCanvasRef: RefObject<HTMLDivElement | null>;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  showSearch: boolean;
  searchableItems: TranscriptionPageTimelineTopProps['searchProps']['items'];
  orthographies: OrthographyDocType[];
  activeLayerIdForEdits: string;
  activeTimelineUnitId: string;
  searchOverlayRequest: AppShellOpenSearchDetail | null;
  manualSelectTsRef: MutableRefObject<number>;
  selectUnit: (id: string) => void;
  handleSearchReplace: (unitId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  setShowSearch: (value: boolean) => void;
  setSearchOverlayRequest: Dispatch<SetStateAction<AppShellOpenSearchDetail | null>>;
}

export function createTranscriptionTimelineTopProps(
  input: CreateTranscriptionTimelineTopPropsInput,
): TranscriptionPageTimelineTopProps {
  return {
    headerProps: {
      duration: input.player.duration,
      units: input.unitsOnCurrentMedia,
      rulerView: input.rulerView,
      onSeek: (time) => {
        recordTimelineSeekTelemetryThrottled();
        input.player.seekTo(time);
      },
      isReady: input.player.isReady,
      zoomPxPerSec: input.zoomPxPerSec,
      isLaneHeaderCollapsed: input.isTimelineLaneHeaderCollapsed,
      onToggleLaneHeader: () => {
        recordTranscriptionKeyboardAction('timelineLaneHeaderToggle');
        input.toggleTimelineLaneHeader();
      },
      instanceRef: input.player.instanceRef,
      waveCanvasRef: input.waveCanvasRef,
      tierContainerRef: input.tierContainerRef,
    },
    showSearch: input.showSearch,
    searchProps: {
      items: input.searchableItems,
      orthographies: input.orthographies,
      currentLayerId: input.activeLayerIdForEdits || undefined,
      currentUnitId: input.activeTimelineUnitId || undefined,
      ...(input.searchOverlayRequest?.query !== undefined && { initialQuery: input.searchOverlayRequest.query }),
      ...(input.searchOverlayRequest?.scope !== undefined && { initialScope: input.searchOverlayRequest.scope }),
      ...(input.searchOverlayRequest?.layerKinds !== undefined && { initialLayerKinds: input.searchOverlayRequest.layerKinds }),
      onNavigate: (id) => {
        recordTranscriptionKeyboardAction('timelineSearchNavigateToUnit');
        input.manualSelectTsRef.current = Date.now();
        if (input.player.isPlaying) input.player.stop();
        input.selectUnit(id);
      },
      onReplace: (unitId, layerId, oldText, newText) => {
        recordTranscriptionKeyboardAction('timelineSearchReplace');
        input.handleSearchReplace(unitId, layerId, oldText, newText);
      },
      onClose: () => {
        recordTranscriptionKeyboardAction('timelineSearchClose');
        input.setShowSearch(false);
        input.setSearchOverlayRequest(null);
      },
    },
  };
}