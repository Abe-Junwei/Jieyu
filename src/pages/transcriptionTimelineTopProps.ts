import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { OrthographyDocType, UtteranceDocType } from '../db';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type WaveSurfer from 'wavesurfer.js';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';

interface CreateTranscriptionTimelineTopPropsInput {
  player: {
    duration: number;
    seekTo: (time: number) => void;
    isReady: boolean;
    currentTime: number;
    instanceRef: RefObject<WaveSurfer | null>;
    isPlaying: boolean;
    stop: () => void;
  };
  utterancesOnCurrentMedia: UtteranceDocType[];
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
  handleSearchReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  setShowSearch: (value: boolean) => void;
  setSearchOverlayRequest: Dispatch<SetStateAction<AppShellOpenSearchDetail | null>>;
}

export function createTranscriptionTimelineTopProps(
  input: CreateTranscriptionTimelineTopPropsInput,
): TranscriptionPageTimelineTopProps {
  return {
    headerProps: {
      duration: input.player.duration,
      utterances: input.utterancesOnCurrentMedia,
      rulerView: input.rulerView,
      onSeek: input.player.seekTo,
      isReady: input.player.isReady,
      currentTime: input.player.currentTime,
      zoomPxPerSec: input.zoomPxPerSec,
      isLaneHeaderCollapsed: input.isTimelineLaneHeaderCollapsed,
      onToggleLaneHeader: input.toggleTimelineLaneHeader,
      instanceRef: input.player.instanceRef,
      waveCanvasRef: input.waveCanvasRef,
      tierContainerRef: input.tierContainerRef,
    },
    showSearch: input.showSearch,
    searchProps: {
      items: input.searchableItems,
      orthographies: input.orthographies,
      currentLayerId: input.activeLayerIdForEdits || undefined,
      currentUtteranceId: input.activeTimelineUnitId || undefined,
      ...(input.searchOverlayRequest?.query !== undefined && { initialQuery: input.searchOverlayRequest.query }),
      ...(input.searchOverlayRequest?.scope !== undefined && { initialScope: input.searchOverlayRequest.scope }),
      ...(input.searchOverlayRequest?.layerKinds !== undefined && { initialLayerKinds: input.searchOverlayRequest.layerKinds }),
      onNavigate: (id) => {
        input.manualSelectTsRef.current = Date.now();
        if (input.player.isPlaying) input.player.stop();
        input.selectUnit(id);
      },
      onReplace: input.handleSearchReplace,
      onClose: () => {
        input.setShowSearch(false);
        input.setSearchOverlayRequest(null);
      },
    },
  };
}