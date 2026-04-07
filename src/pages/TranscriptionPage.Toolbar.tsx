import type { RefObject } from 'react';
import { WaveformToolbar } from '../components/WaveformToolbar';
import { t, tf, useLocale } from '../i18n';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';

export type TranscriptionPageToolbarProps = {
  filename: string;
  isReady: boolean;
  isPlaying: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  waveformDisplayMode: WaveformDisplayMode;
  onWaveformDisplayModeChange: (mode: WaveformDisplayMode) => void;
  waveformVisualStyle: WaveformVisualStyle;
  onWaveformVisualStyleChange: (style: WaveformVisualStyle) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onTogglePlayback: () => void;
  onSeek: (delta: number) => void;
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
  /** 低置信度句段数量，> 0 时显示徽章 | Count shown as review badge when > 0 */
  lowConfidenceCount?: number;
  /** VAD 自动分段回调 | Callback to trigger VAD auto-segmentation */
  onAutoSegment?: () => void;
  /** VAD 运行中 | True while VAD is running */
  autoSegmentBusy?: boolean;
};

export function TranscriptionPageToolbar({
  filename,
  isReady,
  isPlaying,
  playbackRate,
  onPlaybackRateChange,
  waveformDisplayMode,
  onWaveformDisplayModeChange,
  waveformVisualStyle,
  onWaveformVisualStyleChange,
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
  lowConfidenceCount,
  onAutoSegment,
  autoSegmentBusy,
}: TranscriptionPageToolbarProps) {
  const locale = useLocale();

  return (
    <WaveformToolbar
      filename={filename}
      isReady={isReady}
      isPlaying={isPlaying}
      playbackRate={playbackRate}
      onPlaybackRateChange={onPlaybackRateChange}
      waveformDisplayMode={waveformDisplayMode}
      onWaveformDisplayModeChange={onWaveformDisplayModeChange}
      waveformVisualStyle={waveformVisualStyle}
      onWaveformVisualStyleChange={onWaveformVisualStyleChange}
      volume={volume}
      onVolumeChange={onVolumeChange}
      loop={loop}
      onLoopChange={onLoopChange}
      onTogglePlayback={onTogglePlayback}
      onSeek={onSeek}
      canDeleteAudio={canDeleteAudio}
      onDeleteCurrentAudio={onDeleteCurrentAudio}
      {...(onAutoSegment ? { onAutoSegment } : {})}
      {...(autoSegmentBusy != null ? { autoSegmentBusy } : {})}
      autoSegmentRunTitle={t(locale, 'transcription.toolbar.autoSegmentRun')}
      autoSegmentRunningTitle={t(locale, 'transcription.toolbar.autoSegmentRunning')}
    >
      {lowConfidenceCount != null && lowConfidenceCount > 0 && (
        <span
          className="toolbar-confidence-badge"
          title={tf(locale, 'transcription.toolbar.lowConfidenceBadgeTitle', { count: lowConfidenceCount })}
        >
          ⚠ {lowConfidenceCount}
        </span>
      )}
    </WaveformToolbar>
  );
}
