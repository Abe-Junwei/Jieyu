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
  const {
    locale,
    selectedTimelineMediaFilename,
    player,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    handleGlobalPlayPauseAction,
    canUndo,
    canRedo,
    undoLabel,
    hasSelectedTimelineMedia,
    hasActiveTextId,
    selectedTimelineUnit,
    notePopoverOpen,
    showExportMenu,
    importFileRef,
    exportMenuRef,
    loadSnapshot,
    undo,
    redo,
    setShowProjectSetup,
    setShowAudioImport,
    handleDeleteCurrentAudio,
    handleDeleteCurrentProject,
    toggleNotes,
    setUttOpsMenu,
    selectedMediaUrl,
    handleAutoSegment,
    autoSegmentBusy,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    handleImportFile,
    utterancesOnCurrentMedia,
    rulerView,
    zoomPxPerSec,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    tierContainerRef,
    showSearch,
    searchableItems,
    activeLayerIdForEdits,
    selectedTimelineUtteranceId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUtterance,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    timelineContentProps,
    sidebarSectionsInput,
  } = input;

  const toolbarProps = useMemo<TranscriptionPageToolbarProps>(() => {
    const lowConfidenceCount = utterancesOnCurrentMedia.filter(
      (utterance) => typeof utterance.ai_metadata?.confidence === 'number' && utterance.ai_metadata.confidence < 0.75,
    ).length;

    return {
      filename: selectedTimelineMediaFilename ?? (locale === 'zh-CN' ? '未绑定媒体' : 'Unbound media'),
      isReady: player.isReady,
      isPlaying: player.isPlaying,
      playbackRate: player.playbackRate,
      onPlaybackRateChange: player.setPlaybackRate,
      volume: player.volume,
      onVolumeChange: player.setVolume,
      loop: globalLoopPlayback,
      onLoopChange: setGlobalLoopPlayback,
      onTogglePlayback: handleGlobalPlayPauseAction,
      onSeek: player.seekBySeconds,
      canUndo,
      canRedo,
      undoLabel,
      canDeleteAudio: hasSelectedTimelineMedia,
      canDeleteProject: hasActiveTextId,
      canToggleNotes: Boolean((selectedTimelineUnit?.kind === 'utterance' && selectedTimelineUnit.unitId) || notePopoverOpen),
      canOpenUttOpsMenu: Boolean(selectedTimelineUnit?.unitId),
      notePopoverOpen,
      showExportMenu,
      importFileRef,
      exportMenuRef,
      onRefresh: () => { void loadSnapshot(); },
      onUndo: () => { void undo(); },
      onRedo: () => { void redo(); },
      onOpenProjectSetup: () => setShowProjectSetup(true),
      onOpenAudioImport: () => setShowAudioImport(true),
      onDeleteCurrentAudio: handleDeleteCurrentAudio,
      onDeleteCurrentProject: handleDeleteCurrentProject,
      exportCallbacks: {
        onToggleExportMenu: () => setShowExportMenu((value) => !value),
        onExportEaf: handleExportEaf,
        onExportTextGrid: handleExportTextGrid,
        onExportTrs: handleExportTrs,
        onExportFlextext: handleExportFlextext,
        onExportToolbox: handleExportToolbox,
        onExportJyt: handleExportJyt,
        onExportJym: handleExportJym,
        onImportFile: (file) => { void handleImportFile(file); },
      },
      onToggleNotes: toggleNotes,
      onOpenUttOpsMenu: (x, y) => setUttOpsMenu({ x, y }),
      lowConfidenceCount,
      ...(selectedMediaUrl ? { onAutoSegment: handleAutoSegment } : {}),
      autoSegmentBusy,
    };
  }, [
    autoSegmentBusy,
    canRedo,
    canUndo,
    exportMenuRef,
    globalLoopPlayback,
    handleAutoSegment,
    handleDeleteCurrentAudio,
    handleDeleteCurrentProject,
    handleExportEaf,
    handleExportFlextext,
    handleExportJym,
    handleExportJyt,
    handleExportTextGrid,
    handleExportToolbox,
    handleExportTrs,
    handleGlobalPlayPauseAction,
    handleImportFile,
    hasActiveTextId,
    hasSelectedTimelineMedia,
    importFileRef,
    loadSnapshot,
    locale,
    notePopoverOpen,
    player,
    redo,
    selectedMediaUrl,
    selectedTimelineMediaFilename,
    selectedTimelineUnit,
    setGlobalLoopPlayback,
    setShowAudioImport,
    setShowExportMenu,
    setShowProjectSetup,
    setUttOpsMenu,
    showExportMenu,
    toggleNotes,
    undo,
    undoLabel,
    utterancesOnCurrentMedia,
  ]);

  const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => ({
    headerProps: {
      duration: player.duration,
      utterances: utterancesOnCurrentMedia,
      rulerView,
      onSeek: player.seekTo,
      isReady: player.isReady,
      currentTime: player.currentTime,
      zoomPxPerSec,
      isLaneHeaderCollapsed: isTimelineLaneHeaderCollapsed,
      onToggleLaneHeader: toggleTimelineLaneHeader,
      instanceRef: player.instanceRef,
      waveCanvasRef,
      tierContainerRef,
    },
    showSearch,
    searchProps: {
      items: searchableItems,
      currentLayerId: activeLayerIdForEdits || undefined,
      currentUtteranceId: selectedTimelineUtteranceId || undefined,
      ...(searchOverlayRequest?.query !== undefined ? { initialQuery: searchOverlayRequest.query } : {}),
      ...(searchOverlayRequest?.scope !== undefined ? { initialScope: searchOverlayRequest.scope } : {}),
      ...(searchOverlayRequest?.layerKinds !== undefined ? { initialLayerKinds: searchOverlayRequest.layerKinds } : {}),
      onNavigate: (id) => {
        manualSelectTsRef.current = Date.now();
        if (player.isPlaying) {
          player.stop();
        }
        selectUtterance(id);
      },
      onReplace: handleSearchReplace,
      onClose: () => {
        setShowSearch(false);
        setSearchOverlayRequest(null);
      },
    },
  }), [
    activeLayerIdForEdits,
    handleSearchReplace,
    isTimelineLaneHeaderCollapsed,
    manualSelectTsRef,
    player,
    rulerView,
    searchOverlayRequest,
    searchableItems,
    selectUtterance,
    selectedTimelineUtteranceId,
    setSearchOverlayRequest,
    setShowSearch,
    showSearch,
    tierContainerRef,
    toggleTimelineLaneHeader,
    utterancesOnCurrentMedia,
    waveCanvasRef,
    zoomPxPerSec,
  ]);

  const timelineContentPropsView = useMemo<TranscriptionPageTimelineContentProps>(() => timelineContentProps, [timelineContentProps]);
  const { aiSidebarProps, dialogsProps } = useTranscriptionSidebarSectionsViewModel(sidebarSectionsInput);

  return {
    toolbarProps,
    timelineTopProps,
    timelineContentProps: timelineContentPropsView,
    aiSidebarProps,
    dialogsProps,
  };
}