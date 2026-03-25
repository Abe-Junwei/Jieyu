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
  /** 低置信度句段数量，> 0 时显示徽章 | Count shown as review badge when > 0 */
  lowConfidenceCount?: number;
  /** VAD 自动分段回调 | Callback to trigger VAD auto-segmentation */
  onAutoSegment?: () => void;
  /** VAD 运行中 | True while VAD is running */
  autoSegmentBusy?: boolean;
  /** 轨道模式标签 | Track mode label */
  trackModeLabel?: string;
  /** 锁定说话人数 | Locked speaker count */
  laneLockCount?: number;
  /** 锁定冲突计数 | Lock conflict count */
  lockConflictCount?: number;
  /** 锁定冲突说话人摘要 | Lock conflict speaker names */
  lockConflictSpeakerNames?: string[];
  /** 查看锁定冲突详情 | Open lock conflict details */
  onOpenLockConflictDetails?: () => void;
  /** 说话人聚焦模式 | Speaker focus mode */
  speakerFocusMode?: 'all' | 'focus-soft' | 'focus-hard';
  /** 当前聚焦目标名称 | Current focus target name */
  speakerFocusTargetName?: string;
  /** 可选聚焦说话人列表 | Focusable speaker options */
  speakerFocusOptions?: Array<{ key: string; name: string }>;
  /** 当前聚焦目标 key；空字符串表示跟随当前选中句段 | Focus target key; empty means follow current selection */
  speakerFocusTargetKey?: string;
  /** 选择聚焦目标 | Change focus target */
  onSpeakerFocusTargetKeyChange?: (speakerKey: string) => void;
  /** 切换说话人聚焦模式 | Cycle speaker focus mode */
  onCycleSpeakerFocusMode?: () => void;
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
  lowConfidenceCount,
  onAutoSegment,
  autoSegmentBusy,
  trackModeLabel,
  laneLockCount,
  lockConflictCount,
  lockConflictSpeakerNames,
  onOpenLockConflictDetails,
  speakerFocusMode,
  speakerFocusTargetName,
  speakerFocusOptions,
  speakerFocusTargetKey,
  onSpeakerFocusTargetKeyChange,
  onCycleSpeakerFocusMode,
}: TranscriptionPageToolbarProps) {
  const speakerFocusLabel = speakerFocusMode === 'focus-hard'
    ? `仅${speakerFocusTargetName ?? '目标'}`
    : speakerFocusMode === 'focus-soft'
      ? `柔和${speakerFocusTargetName ? `·${speakerFocusTargetName}` : ''}`
      : '全部';

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
      {lowConfidenceCount != null && lowConfidenceCount > 0 && (
        <span
          className="toolbar-confidence-badge"
          title={`${lowConfidenceCount} 个低置信度句段，按 [ / ] 跳转 | ${lowConfidenceCount} low-confidence segments, use [ / ] to navigate`}
        >
          ⚠ {lowConfidenceCount}
        </span>
      )}
      {trackModeLabel && (
        <span
          className="toolbar-track-mode-badge"
          title={`当前轨道模式：${trackModeLabel} | Current track mode: ${trackModeLabel}`}
        >
          轨道：{trackModeLabel}（锁定 {laneLockCount ?? 0}）
        </span>
      )}
      {lockConflictCount != null && lockConflictCount > 0 && (
        <button
          type="button"
          className="toolbar-lock-conflict-badge"
          onClick={onOpenLockConflictDetails}
          title={`锁定冲突 ${lockConflictCount} 项：${(lockConflictSpeakerNames ?? []).join('、') || '未知说话人'} | ${lockConflictCount} lock conflicts`}
        >
          锁冲突：{lockConflictCount}
        </button>
      )}
      {onCycleSpeakerFocusMode && (
        <>
          <button
            type="button"
            className={`toolbar-focus-mode-badge${speakerFocusMode && speakerFocusMode !== 'all' ? ' toolbar-focus-mode-badge-active' : ''}`}
            title={`说话人聚焦：${speakerFocusLabel}（点击切换） | Speaker focus: ${speakerFocusLabel} (click to cycle)`}
            onClick={onCycleSpeakerFocusMode}
          >
            聚焦：{speakerFocusLabel}
          </button>
          {onSpeakerFocusTargetKeyChange && (
            <select
              className="toolbar-focus-target-select"
              title="选择聚焦说话人 | Select focus speaker"
              value={speakerFocusTargetKey ?? ''}
              onChange={(event) => onSpeakerFocusTargetKeyChange(event.target.value)}
            >
              <option value="">跟随当前选中</option>
              {(speakerFocusOptions ?? []).map((option) => (
                <option key={option.key} value={option.key}>{option.name}</option>
              ))}
            </select>
          )}
        </>
      )}
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
          {...(onAutoSegment ? { onAutoSegment } : {})}
          {...(autoSegmentBusy != null ? { autoSegmentBusy } : {})}
      />
    </WaveformToolbar>
  );
}
