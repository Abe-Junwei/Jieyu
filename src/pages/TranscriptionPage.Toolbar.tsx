import type { RefObject } from 'react';
import { WaveformToolbar } from '../components/WaveformToolbar';
import { TranscriptionToolbarActions } from '../components/TranscriptionToolbarActions';

type TranscriptionPageToolbarProps = {
  filename: string;
  isReady: boolean;
  isPlaying: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onTogglePlayback: () => void;
  onSeek: (delta: number) => void;
  // TranscriptionToolbarActions
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  canDeleteAudio: boolean;
  canDeleteProject: boolean;
  canToggleNotes: boolean;
  canOpenUttOpsMenu: boolean;
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  exportCallbacks: {
    onToggleExportMenu: () => void;
    onExportEaf: () => void;
    onExportTextGrid: () => void;
    onExportTrs: () => void;
    onExportFlextext: () => void;
    onExportToolbox: () => void;
    onExportJyt: () => Promise<void>;
    onExportJym: () => Promise<void>;
    onImportFile: (file: File) => void;
  };
  onRefresh: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentAudio: () => void;
  onDeleteCurrentProject: () => void;
  onToggleNotes: () => void;
  onOpenUttOpsMenu: (x: number, y: number) => void;
};

export function TranscriptionPageToolbar({
  filename,
  isReady,
  isPlaying,
  playbackRate,
  onPlaybackRateChange,
  volume,
  onVolumeChange,
  loop,
  onLoopChange,
  onTogglePlayback,
  onSeek,
  canUndo,
  canRedo,
  undoLabel,
  canDeleteAudio,
  canDeleteProject,
  canToggleNotes,
  canOpenUttOpsMenu,
  notePopoverOpen,
  showExportMenu,
  importFileRef,
  exportMenuRef,
  exportCallbacks,
  onRefresh,
  onUndo,
  onRedo,
  onOpenProjectSetup,
  onOpenAudioImport,
  onDeleteCurrentAudio,
  onDeleteCurrentProject,
  onToggleNotes,
  onOpenUttOpsMenu,
}: TranscriptionPageToolbarProps) {
  return (
    <WaveformToolbar
      filename={filename}
      isReady={isReady}
      isPlaying={isPlaying}
      playbackRate={playbackRate}
      onPlaybackRateChange={onPlaybackRateChange}
      volume={volume}
      onVolumeChange={onVolumeChange}
      loop={loop}
      onLoopChange={onLoopChange}
      onTogglePlayback={onTogglePlayback}
      onSeek={onSeek}
    >
      <TranscriptionToolbarActions
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        canDeleteAudio={canDeleteAudio}
        canDeleteProject={canDeleteProject}
        canToggleNotes={canToggleNotes}
        canOpenUttOpsMenu={canOpenUttOpsMenu}
        notePopoverOpen={notePopoverOpen}
        showExportMenu={showExportMenu}
        importFileRef={importFileRef}
        exportMenuRef={exportMenuRef}
        exportCallbacks={exportCallbacks}
        onRefresh={onRefresh}
        onUndo={onUndo}
        onRedo={onRedo}
        onOpenProjectSetup={onOpenProjectSetup}
        onOpenAudioImport={onOpenAudioImport}
        onDeleteCurrentAudio={onDeleteCurrentAudio}
        onDeleteCurrentProject={onDeleteCurrentProject}
        onToggleNotes={onToggleNotes}
        onOpenUttOpsMenu={onOpenUttOpsMenu}
      />
    </WaveformToolbar>
  );
}
