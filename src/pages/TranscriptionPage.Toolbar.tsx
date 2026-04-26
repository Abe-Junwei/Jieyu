import '../styles/pages/transcription-toolbar.css';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { WaveformToolbar } from '../components/WaveformToolbar';
import type { AcousticRuntimeStatus, VadCacheStatus } from '../contexts/AiPanelContext';
import { ToolbarAiProgress } from '../components/transcription/toolbar/ToolbarAiProgress';
import { getSidePaneSidebarMessages } from '../i18n/messages';
import { t, tf, useLocale } from '../i18n';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';
import { recordTranscriptionKeyboardAction } from '../services/transcriptionKeyboardActionTelemetry';

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
  acousticOverlayMode: AcousticOverlayMode;
  onAcousticOverlayModeChange: (mode: AcousticOverlayMode) => void;
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
  /** 派生出的全部问题数量 | Derived issue count for quick navigation */
  reviewIssueCount?: number;
  /** 各问题分类计数 | Counts for each review preset */
  reviewPresetCounts?: Partial<Record<TranscriptionReviewPreset, number>>;
  /** 当前选中的问题分类 | Current review preset shown in the toolbar */
  activeReviewPreset?: TranscriptionReviewPreset;
  /** 切换顶部问题分类 | Change the active review preset from the toolbar */
  onSelectReviewPreset?: (preset: TranscriptionReviewPreset) => void;
  /** 打开或聚焦待复核入口 | Open or focus the review queue */
  onOpenReviewIssues?: () => void;
  /** 跳到上一条待复核 | Jump to previous review item */
  onReviewPrev?: () => void;
  /** 跳到下一条待复核 | Jump to next review item */
  onReviewNext?: () => void;
  /** VAD 自动分段回调 | Callback to trigger VAD auto-segmentation */
  onAutoSegment?: () => void;
  /** VAD 运行中 | True while VAD is running */
  autoSegmentBusy?: boolean;
  acousticRuntimeStatus?: AcousticRuntimeStatus;
  vadCacheStatus?: VadCacheStatus;
  /** 波形工具栏主行尾部（与波形区同条展示）| Inline trailing on wave toolbar row */
  leftToolbarExtras?: ReactNode;
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
  acousticOverlayMode,
  onAcousticOverlayModeChange,
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
  reviewIssueCount,
  reviewPresetCounts,
  activeReviewPreset,
  onSelectReviewPreset,
  onOpenReviewIssues,
  onReviewPrev,
  onReviewNext,
  onAutoSegment,
  autoSegmentBusy,
  acousticRuntimeStatus,
  vadCacheStatus,
  leftToolbarExtras,
}: TranscriptionPageToolbarProps) {
  const locale = useLocale();
  const reviewMessages = getSidePaneSidebarMessages(locale);
  const reviewMenuRef = useRef<HTMLDivElement | null>(null);
  const [isReviewMenuOpen, setIsReviewMenuOpen] = useState(false);
  const showToolbarAiProgress = acousticRuntimeStatus?.state === 'loading'
    || acousticRuntimeStatus?.state === 'ready'
    || acousticRuntimeStatus?.state === 'error'
    || vadCacheStatus?.state === 'warming'
    || vadCacheStatus?.state === 'ready';

  const getReviewPresetLabel = (preset: TranscriptionReviewPreset): string => {
    switch (preset) {
      case 'all':
        return reviewMessages.segmentListReviewPresetAll;
      case 'time':
        return reviewMessages.segmentListReviewPresetTime;
      case 'content_concern':
        return reviewMessages.segmentListReviewPresetContentConcern;
      case 'content_missing':
        return reviewMessages.segmentListReviewPresetContentMissing;
      case 'manual_attention':
        return reviewMessages.segmentListReviewPresetManualAttention;
      case 'pending_review':
        return reviewMessages.segmentListReviewPresetPendingReview;
      default:
        return reviewMessages.segmentListReviewPresetAll;
    }
  };

  const effectiveReviewPresetCounts = useMemo(() => ({
    all: reviewIssueCount ?? 0,
    time: 0,
    content_concern: 0,
    content_missing: 0,
    manual_attention: 0,
    pending_review: 0,
    ...reviewPresetCounts,
  }), [reviewIssueCount, reviewPresetCounts]);

  const resolvedActiveReviewPreset = activeReviewPreset ?? 'all';
  const reviewPresetOptions = useMemo(() => ([
    'all',
    'time',
    'content_concern',
    'content_missing',
    'manual_attention',
    'pending_review',
  ] as const).map((preset) => ({
    value: preset,
    label: getReviewPresetLabel(preset),
    count: effectiveReviewPresetCounts[preset] ?? 0,
  })), [effectiveReviewPresetCounts]);

  const activeReviewOption = reviewPresetOptions.find((option) => option.value === resolvedActiveReviewPreset)
    ?? reviewPresetOptions[0];
  const reviewSummaryLabel = activeReviewOption ? `${activeReviewOption.label} ${activeReviewOption.count}` : reviewMessages.segmentListReviewPresetAll;
  const hasReviewNavigation = (activeReviewOption?.count ?? 0) > 0;
  const showReviewEntry = reviewIssueCount != null
    || reviewPresetCounts != null
    || onSelectReviewPreset != null
    || onOpenReviewIssues != null
    || onReviewPrev != null
    || onReviewNext != null;

  useEffect(() => {
    if (!isReviewMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (reviewMenuRef.current?.contains(target)) return;
      setIsReviewMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsReviewMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReviewMenuOpen]);

  const reviewToolbarExtras = showReviewEntry ? (
    <div className="toolbar-review-nav" role="group" aria-label={reviewMessages.segmentListReviewPresetAll}>
      <button
        type="button"
        className="toolbar-confidence-badge toolbar-confidence-badge-button"
        aria-label={reviewMessages.segmentListReviewPrev}
        title={reviewMessages.segmentListReviewPrev}
        disabled={!hasReviewNavigation}
        onClick={() => onReviewPrev?.()}
      >
        ←
      </button>
      <div className="toolbar-review-nav-menu" ref={reviewMenuRef}>
        <button
          type="button"
          className="toolbar-confidence-badge toolbar-confidence-badge-button toolbar-confidence-badge-summary"
          aria-label={reviewSummaryLabel}
          title={reviewSummaryLabel}
          aria-haspopup="dialog"
          aria-expanded={isReviewMenuOpen}
          onClick={() => {
            recordTranscriptionKeyboardAction('toolbarReviewMenuToggle');
            setIsReviewMenuOpen((prev) => !prev);
          }}
        >
          {reviewSummaryLabel}
        </button>
        {isReviewMenuOpen ? (
          <div className="toolbar-review-nav-popover" role="dialog" aria-label={reviewMessages.segmentListTitle}>
            <div className="app-side-pane-segment-list-review-presets toolbar-review-nav-popover-list" role="group" aria-label={reviewMessages.segmentListTitle}>
              {reviewPresetOptions.map((option) => {
                const selected = option.value === resolvedActiveReviewPreset;
                return (
                  <button
                    key={`toolbar-review-preset:${option.value}`}
                    type="button"
                    className={`app-side-pane-segment-list-review-preset${selected ? ' is-active' : ''}`}
                    aria-pressed={selected}
                    disabled={option.count === 0}
                    onClick={() => {
                      if (option.count === 0) return;
                      onSelectReviewPreset?.(option.value);
                      onOpenReviewIssues?.();
                      setIsReviewMenuOpen(false);
                    }}
                  >
                    <span className="app-side-pane-segment-list-review-preset-label">{option.label}</span>
                    <span className="app-side-pane-segment-list-review-preset-count">{option.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="toolbar-confidence-badge toolbar-confidence-badge-button"
        aria-label={reviewMessages.segmentListReviewNext}
        title={reviewMessages.segmentListReviewNext}
        disabled={!hasReviewNavigation}
        onClick={() => onReviewNext?.()}
      >
        →
      </button>
    </div>
  ) : null;

  const lowConfidenceBadge = lowConfidenceCount != null && lowConfidenceCount > 0 ? (
    <span
      className="toolbar-confidence-badge"
      title={tf(locale, 'transcription.toolbar.lowConfidenceBadgeTitle', { count: lowConfidenceCount })}
    >
      ⚠ {lowConfidenceCount}
    </span>
  ) : null;

  const combinedLeftToolbarExtras = (
    <>
      {leftToolbarExtras}
      {leftToolbarExtras && (reviewToolbarExtras || lowConfidenceBadge) ? (
        <span className="transcription-toolbar-sep transcription-wave-toolbar-extras-sep" aria-hidden="true" />
      ) : null}
      {reviewToolbarExtras}
      {reviewToolbarExtras && lowConfidenceBadge ? (
        <span className="transcription-toolbar-sep transcription-wave-toolbar-extras-sep" aria-hidden="true" />
      ) : null}
      {lowConfidenceBadge}
      {showToolbarAiProgress ? (
        <>
          {leftToolbarExtras || reviewToolbarExtras || lowConfidenceBadge ? (
            <span className="transcription-toolbar-sep transcription-wave-toolbar-extras-sep" aria-hidden="true" />
          ) : null}
          <ToolbarAiProgress
            acousticRuntimeStatus={acousticRuntimeStatus}
            vadCacheStatus={vadCacheStatus}
          />
        </>
      ) : null}
    </>
  );

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
      acousticOverlayMode={acousticOverlayMode}
      onAcousticOverlayModeChange={onAcousticOverlayModeChange}
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
      leftToolbarExtras={combinedLeftToolbarExtras}
    />
  );
}
