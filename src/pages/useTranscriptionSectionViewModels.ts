import { useMemo, type RefObject } from 'react';
import type { UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { UttOpsMenuState } from './TranscriptionPage.UIState';
import type { TranscriptionPageTimelineContentProps } from './TranscriptionPage.TimelineContent';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import {
  useTranscriptionSidebarSectionsViewModel,
  type UseTranscriptionSidebarSectionsViewModelInput,
} from './useTranscriptionSidebarSectionsViewModel';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type WaveSurfer from 'wavesurfer.js';

interface UseTranscriptionSectionViewModelsInput {
  locale: string;
  selectedTimelineMediaFilename: string | null;
  player: {
    isReady: boolean;
    isPlaying: boolean;
    stop: () => void;
    playbackRate: number;
    setPlaybackRate: (rate: number) => void;
    volume: number;
    setVolume: (volume: number) => void;
    seekBySeconds: (delta: number) => void;
    seekTo: (time: number) => void;
    currentTime: number;
    duration: number;
    instanceRef: RefObject<WaveSurfer | null>;
  };
  globalLoopPlayback: boolean;
  setGlobalLoopPlayback: (loop: boolean) => void;
  handleGlobalPlayPauseAction: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  hasSelectedTimelineMedia: boolean;
  hasActiveTextId: boolean;
  selectedTimelineUnit: TimelineUnit | null;
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  loadSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setShowProjectSetup: (value: boolean) => void;
  setShowAudioImport: (value: boolean) => void;
  handleDeleteCurrentAudio: () => void;
  handleDeleteCurrentProject: () => void;
  toggleNotes: () => void;
  setUttOpsMenu: (state: UttOpsMenuState | null) => void;
  lowConfidenceCount: number;
  selectedMediaUrl: string | null;
  handleAutoSegment: () => void;
  autoSegmentBusy: boolean;
  setShowExportMenu: React.Dispatch<React.SetStateAction<boolean>>;
  handleExportEaf: () => void;
  handleExportTextGrid: () => void;
  handleExportTrs: () => void;
  handleExportFlextext: () => void;
  handleExportToolbox: () => void;
  handleExportJyt: () => Promise<void>;
  handleExportJym: () => Promise<void>;
  handleImportFile: (file: File) => Promise<void>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  rulerView: { start: number; end: number } | null;
  zoomPxPerSec: number;
  isTimelineLaneHeaderCollapsed: boolean;
  toggleTimelineLaneHeader: () => void;
  waveCanvasRef: RefObject<HTMLDivElement | null>;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  showSearch: boolean;
  searchableItems: TranscriptionPageTimelineTopProps['searchProps']['items'];
  activeLayerIdForEdits: string;
  selectedTimelineUtteranceId: string;
  searchOverlayRequest: AppShellOpenSearchDetail | null;
  manualSelectTsRef: React.MutableRefObject<number>;
  selectUtterance: (id: string) => void;
  handleSearchReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  setShowSearch: (value: boolean) => void;
  setSearchOverlayRequest: React.Dispatch<React.SetStateAction<AppShellOpenSearchDetail | null>>;
  timelineContentProps: TranscriptionPageTimelineContentProps;
  sidebarSectionsInput: UseTranscriptionSidebarSectionsViewModelInput;
}

interface UseTranscriptionSectionViewModelsResult {
  toolbarProps: TranscriptionPageToolbarProps;
  timelineTopProps: TranscriptionPageTimelineTopProps;
  timelineContentProps: TranscriptionPageTimelineContentProps;
  aiSidebarProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['aiSidebarProps'];
  dialogsProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['dialogsProps'];
}

export function useTranscriptionSectionViewModels(
  input: UseTranscriptionSectionViewModelsInput,
): UseTranscriptionSectionViewModelsResult {
  const toolbarProps = useMemo<TranscriptionPageToolbarProps>(() => ({
    filename: input.selectedTimelineMediaFilename ?? (input.locale === 'zh-CN' ? '未绑定媒体' : 'Unbound media'),
    isReady: input.player.isReady,
    isPlaying: input.player.isPlaying,
    playbackRate: input.player.playbackRate,
    onPlaybackRateChange: input.player.setPlaybackRate,
    volume: input.player.volume,
    onVolumeChange: input.player.setVolume,
    loop: input.globalLoopPlayback,
    onLoopChange: input.setGlobalLoopPlayback,
    onTogglePlayback: input.handleGlobalPlayPauseAction,
    onSeek: input.player.seekBySeconds,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    undoLabel: input.undoLabel,
    canDeleteAudio: input.hasSelectedTimelineMedia,
    canDeleteProject: input.hasActiveTextId,
    canToggleNotes: Boolean((input.selectedTimelineUnit?.kind === 'utterance' && input.selectedTimelineUnit.unitId) || input.notePopoverOpen),
    canOpenUttOpsMenu: Boolean(input.selectedTimelineUnit?.unitId),
    notePopoverOpen: input.notePopoverOpen,
    showExportMenu: input.showExportMenu,
    importFileRef: input.importFileRef,
    exportMenuRef: input.exportMenuRef,
    onRefresh: () => { void input.loadSnapshot(); },
    onUndo: () => { void input.undo(); },
    onRedo: () => { void input.redo(); },
    onOpenProjectSetup: () => input.setShowProjectSetup(true),
    onOpenAudioImport: () => input.setShowAudioImport(true),
    onDeleteCurrentAudio: input.handleDeleteCurrentAudio,
    onDeleteCurrentProject: input.handleDeleteCurrentProject,
    exportCallbacks: {
      onToggleExportMenu: () => input.setShowExportMenu((value) => !value),
      onExportEaf: input.handleExportEaf,
      onExportTextGrid: input.handleExportTextGrid,
      onExportTrs: input.handleExportTrs,
      onExportFlextext: input.handleExportFlextext,
      onExportToolbox: input.handleExportToolbox,
      onExportJyt: input.handleExportJyt,
      onExportJym: input.handleExportJym,
      onImportFile: (file) => { void input.handleImportFile(file); },
    },
    onToggleNotes: input.toggleNotes,
    onOpenUttOpsMenu: (x, y) => input.setUttOpsMenu({ x, y }),
    lowConfidenceCount: input.lowConfidenceCount,
    ...(input.selectedMediaUrl ? { onAutoSegment: input.handleAutoSegment } : {}),
    autoSegmentBusy: input.autoSegmentBusy,
  }), [input]);

  const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => ({
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
      currentLayerId: input.activeLayerIdForEdits || undefined,
      currentUtteranceId: input.selectedTimelineUtteranceId || undefined,
      ...(input.searchOverlayRequest?.query !== undefined ? { initialQuery: input.searchOverlayRequest.query } : {}),
      ...(input.searchOverlayRequest?.scope !== undefined ? { initialScope: input.searchOverlayRequest.scope } : {}),
      ...(input.searchOverlayRequest?.layerKinds !== undefined ? { initialLayerKinds: input.searchOverlayRequest.layerKinds } : {}),
      onNavigate: (id) => {
        input.manualSelectTsRef.current = Date.now();
        if (input.player.isPlaying) {
          input.player.stop();
        }
        input.selectUtterance(id);
      },
      onReplace: input.handleSearchReplace,
      onClose: () => {
        input.setShowSearch(false);
        input.setSearchOverlayRequest(null);
      },
    },
  }), [input]);

  const timelineContentProps = useMemo<TranscriptionPageTimelineContentProps>(() => input.timelineContentProps, [input.timelineContentProps]);
  const { aiSidebarProps, dialogsProps } = useTranscriptionSidebarSectionsViewModel(input.sidebarSectionsInput);

  return {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  };
}