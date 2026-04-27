import '../styles/foundation/waveform-display.css';
import '../styles/pages/transcription-waveform.css';

/**
 * OrchestratorWaveformContent — 波形区域内容组件
 * Renders WaveformAreaSection children: hover tooltip, status strip, video preview,
 * overlay indicators (lasso, snap guides, note icons), region action overlay,
 * empty state, segment mark status, and the waveform resize handle.
 *
 * 从 TranscriptionPage.Orchestrator.tsx 中提取。
 * Extracted from TranscriptionPage.Orchestrator.tsx.
 */

import React, { useEffect, type MutableRefObject, type RefObject } from 'react';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { AcousticRuntimeStatus, VadCacheStatus } from '../contexts/AiPanelContext';
import { WaveformHoverTooltip } from '../components/transcription/WaveformHoverTooltip';
import { WaveformAnalysisBands } from '../components/transcription/WaveformAnalysisBands';
import { WaveformOverlayDecorations } from '../components/transcription/WaveformOverlayDecorations';
import { WaveformRegionActionLayer } from '../components/transcription/WaveformRegionActionLayer';
import { WaveformShellOverlay } from '../components/transcription/WaveformShellOverlay';
import { WaveformLeftStatusStrip } from '../components/transcription/WaveformLeftStatusStrip';
import { VideoPreviewSection, type VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
import { WaveformAreaSection } from '../components/transcription/TranscriptionLayoutSections';
import type { WaveSurferRegion } from '../hooks/useWaveSurfer';
import { t, tf, type Locale } from '../i18n';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';
import type { AcousticStripContract } from '../hooks/timelineViewportTypes';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import { formatTime } from '../utils/transcriptionFormatters';
import { mapAcousticToTimelineChrome } from '../utils/mapAcousticToTimelineChrome';
import type { SegmentRangeGesturePreviewReadModel } from '../utils/segmentRangeGesturePreviewReadModel';
import { waveLassoOverlayFromSegmentRangeGesturePreview } from '../utils/segmentRangeGesturePreviewReadModel';

interface WaveformNoteIndicator {
  uttId: string;
  leftPx: number;
  widthPx: number;
  count: number;
  layerId?: string;
}

interface WaveformLowConfidenceOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  confidence: number;
}

interface WaveformOverlapOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  concurrentCount: number;
}


interface AcousticOverlayVisibleSummary {
  f0MeanHz: number | null;
  intensityPeakDb: number | null;
  voicedFrameCount: number;
  frameCount: number;
}

interface SpectrogramHoverReadout {
  timeSec: number;
  frequencyHz: number;
  f0Hz: number | null;
  intensityDb: number | null;
}

interface WaveformHoverReadout {
  timeSec: number;
  f0Hz: number | null;
  intensityDb: number | null;
}

export interface OrchestratorWaveformContentProps {
  locale: Locale;

  // WaveformAreaSection wrapper props
  waveformAreaRef: RefObject<HTMLDivElement | null>;
  snapGuideNearSide: string | null | undefined;
  segMarkStart: number | null;
  isResizingWaveform: boolean;
  waveformHeight: number;
  handleWaveformKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  handleWaveformAreaFocus: React.FocusEventHandler<HTMLDivElement>;
  handleWaveformAreaBlur: React.FocusEventHandler<HTMLDivElement>;
  handleWaveformAreaMouseMove: React.MouseEventHandler<HTMLDivElement>;
  handleWaveformAreaMouseLeave: React.MouseEventHandler<HTMLDivElement>;
  handleWaveformAreaWheel: (event: WheelEvent) => void;

  // Hover tooltip
  hoverTime: { time: number; x: number; y: number } | null;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType) => string | null | undefined;
  waveformHoverPreviewProps: { dir?: 'ltr' | 'rtl'; style?: React.CSSProperties };

  // Left status strip
  selectedMediaUrl: string | null | undefined;
  zoomPercent: number;
  snapEnabled: boolean;
  toggleSnapEnabled: () => void;
  playerPlaybackRate: number;
  selectedUnitDuration: number | null;
  amplitudeScale: number;
  setAmplitudeScale: (v: number) => void;
  selectedMediaIsVideo: boolean;
  videoLayoutMode: VideoLayoutMode;
  setVideoLayoutMode: (v: VideoLayoutMode) => void;
  handleLaneLabelWidthResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;

  // Video preview
  videoPreviewHeight: number;
  videoRightPanelWidth: number;
  waveformRegions: WaveSurferRegion[];
  selectedUnitIds: Set<string>;
  activeTimelineUnitId: string;
  segmentLoopPlayback: boolean;
  subSelectionRange: { start: number; end: number } | null;
  isResizingVideoPreview: boolean;
  isResizingVideoRightPanel: boolean;
  handleVideoPreviewResizeStart: React.PointerEventHandler<HTMLDivElement>;
  handleVideoRightPanelResizeStart: React.PointerEventHandler<HTMLDivElement>;
  waveformDisplayMode: WaveformDisplayMode;
  waveCanvasRef: MutableRefObject<HTMLDivElement | null>;
  /** 波形+频谱外壳：供滚轮 capture 与波形横滑对齐（分屏下半区）| Shell for wheel capture (split-mode pan) */
  waveformStripWheelShellRef: MutableRefObject<HTMLDivElement | null>;
  playerSpectrogramRef: MutableRefObject<HTMLDivElement | null>;
  playerWaveformRef: MutableRefObject<HTMLDivElement | null>;
  playerSeekTo: (time: number) => void;
  playerPlayRegion: (start: number, end: number, resume?: boolean) => void;

  /** 阶段 F·1：主波形套索预览由读模型派生（与编排层 `lassoRect` / `timingDragPreview` 同源）。 */
  segmentRangeGesturePreviewReadModel: SegmentRangeGesturePreviewReadModel;

  // Note indicators
  waveformNoteIndicators: WaveformNoteIndicator[];
  waveformLowConfidenceOverlays: WaveformLowConfidenceOverlay[];
  waveformOverlapOverlays: WaveformOverlapOverlay[];
  acousticOverlayMode: AcousticOverlayMode;
  acousticOverlayViewportWidth: number;
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
  acousticOverlayLoading: boolean;
  acousticRuntimeStatus?: AcousticRuntimeStatus;
  vadCacheStatus?: VadCacheStatus;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
  selectedHotspotTimeSec?: number | null;
  handleSpectrogramMouseMove: React.MouseEventHandler<HTMLDivElement>;
  handleSpectrogramMouseLeave: React.MouseEventHandler<HTMLDivElement>;
  handleSpectrogramClick: React.MouseEventHandler<HTMLDivElement>;
  setNotePopover: (v: NotePopoverState) => void;

  // Snap guides
  snapGuideVisible: boolean;
  snapGuideLeft: number | null | undefined;
  snapGuideRight: number | null | undefined;
  snapGuideNearSideValue: string | null | undefined;
  playerDuration: number;
  rulerView: { start: number; end: number } | null;

  // Region action overlay
  selectedWaveformTimelineItem: { id?: string; layerId?: string; startTime: number; endTime: number; tags?: Record<string, boolean> } | null;
  playerIsReady: boolean;
  playerIsPlaying: boolean;
  playerInstanceGetWidth: () => number;
  zoomPxPerSec: number;
  waveformScrollLeft: number;
  segmentPlaybackRate: number;
  handleSegmentPlaybackRateChange: (rate: number) => void;
  handleToggleSelectedWaveformLoop: () => void;
  handleToggleSelectedWaveformPlay: () => void;

  // Empty state
  mediaFileInputRef: RefObject<HTMLInputElement | null>;

  /**
   * Acoustic strip plugin contract: read-model slice + tier/wave DOM refs.
   * When omitted, `waveCanvasRef` above is the sole canvas ref; a11y shell attrs stay unset.
   */
  acousticStrip?: AcousticStripContract;

}

export const OrchestratorWaveformContent = React.memo(function OrchestratorWaveformContent(props: OrchestratorWaveformContentProps) {
  const {
    locale,
    waveformAreaRef,
    snapGuideNearSide,
    segMarkStart,
    isResizingWaveform,
    waveformHeight,
    handleWaveformKeyDown,
    handleWaveformAreaFocus,
    handleWaveformAreaBlur,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel,
    hoverTime,
    unitsOnCurrentMedia,
    getUnitTextForLayer,
    waveformHoverPreviewProps,
    selectedMediaUrl,
    zoomPercent,
    snapEnabled,
    toggleSnapEnabled,
    playerPlaybackRate,
    selectedUnitDuration,
    amplitudeScale,
    setAmplitudeScale,
    selectedMediaIsVideo,
    videoLayoutMode,
    setVideoLayoutMode,
    handleLaneLabelWidthResizeStart,
    videoPreviewHeight,
    videoRightPanelWidth,
    waveformRegions,
    selectedUnitIds,
    activeTimelineUnitId,
    segmentLoopPlayback,
    subSelectionRange,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    waveformDisplayMode,
    waveCanvasRef,
    waveformStripWheelShellRef,
    playerSpectrogramRef,
    playerWaveformRef,
    playerSeekTo,
    playerPlayRegion,
    segmentRangeGesturePreviewReadModel,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    selectedHotspotTimeSec,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
    setNotePopover,
    snapGuideVisible,
    snapGuideLeft,
    snapGuideRight,
    snapGuideNearSideValue,
    playerDuration,
    rulerView,
    selectedWaveformTimelineItem,
    playerIsReady,
    playerIsPlaying,
    playerInstanceGetWidth,
    zoomPxPerSec,
    waveformScrollLeft,
    segmentPlaybackRate,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
    mediaFileInputRef,
    acousticStrip,
  } = props;

  const waveLassoOverlay = waveLassoOverlayFromSegmentRangeGesturePreview(segmentRangeGesturePreviewReadModel);

  const effectiveWaveCanvasRef = acousticStrip?.waveCanvasRef ?? waveCanvasRef;
  const acousticReadModelSlice = acousticStrip?.acoustic;
  /** 页顶波形区 chrome：`shell` 仍用宿主合同；`state` 用全局可播事实，避免纵向下合同态 `no_media` 盖住解码中 `aria-busy` 等反馈。 */
  const acousticChrome = acousticReadModelSlice
    ? mapAcousticToTimelineChrome({
      shell: acousticReadModelSlice.shell,
      state: acousticReadModelSlice.globalState,
    })
    : null;

  // 稳定引用，避免 WaveformLeftStatusStrip 不必要重渲染 | Stable ref to prevent WaveformLeftStatusStrip re-renders
  const handleAmplitudeReset = React.useCallback(() => setAmplitudeScale(1), [setAmplitudeScale]);

  const waveformLeftStatusStripNode = React.useMemo(() => {
    if (!selectedMediaUrl) return null;
    return (
      <WaveformLeftStatusStrip
        zoomPercent={zoomPercent}
        snapEnabled={snapEnabled}
        onSnapToggle={toggleSnapEnabled}
        playbackRate={playerPlaybackRate}
        selectedUnitDuration={selectedUnitDuration}
        amplitudeScale={amplitudeScale}
        onAmplitudeChange={setAmplitudeScale}
        onAmplitudeReset={handleAmplitudeReset}
        selectedMediaIsVideo={selectedMediaIsVideo}
        videoLayoutMode={videoLayoutMode}
        onVideoLayoutModeChange={setVideoLayoutMode}
        onLaneLabelWidthResize={handleLaneLabelWidthResizeStart}
        formatTime={formatTime}
      />
    );
  }, [
    amplitudeScale,
    handleAmplitudeReset,
    handleLaneLabelWidthResizeStart,
    playerPlaybackRate,
    selectedMediaIsVideo,
    selectedMediaUrl,
    selectedUnitDuration,
    setAmplitudeScale,
    setVideoLayoutMode,
    snapEnabled,
    toggleSnapEnabled,
    videoLayoutMode,
    zoomPercent,
  ]);

  const waveformHoverTooltipNode = React.useMemo(() => {
    if (!hoverTime) return null;
    return (
      <WaveformHoverTooltip
        time={hoverTime.time}
        x={hoverTime.x}
        y={hoverTime.y}
        units={unitsOnCurrentMedia}
        getUnitTextForLayer={getUnitTextForLayer}
        formatTime={formatTime}
        {...(waveformHoverPreviewProps.dir !== undefined ? { previewDir: waveformHoverPreviewProps.dir } : {})}
        {...(waveformHoverPreviewProps.style !== undefined ? { previewStyle: waveformHoverPreviewProps.style } : {})}
      />
    );
  }, [
    getUnitTextForLayer,
    hoverTime,
    unitsOnCurrentMedia,
    waveformHoverPreviewProps.dir,
    waveformHoverPreviewProps.style,
  ]);

  const activeReadout = spectrogramHoverReadout
    ? {
        source: 'spectrogram' as const,
        timeSec: spectrogramHoverReadout.timeSec,
        frequencyHz: spectrogramHoverReadout.frequencyHz,
        f0Hz: spectrogramHoverReadout.f0Hz,
        intensityDb: spectrogramHoverReadout.intensityDb,
      }
    : waveformHoverReadout
      ? {
          source: 'waveform' as const,
          timeSec: waveformHoverReadout.timeSec,
          f0Hz: waveformHoverReadout.f0Hz,
          intensityDb: waveformHoverReadout.intensityDb,
        }
      : null;
  const selectedHotspotLeftPx = typeof selectedHotspotTimeSec === 'number'
    ? (selectedHotspotTimeSec * zoomPxPerSec) - waveformScrollLeft
    : null;
  const waveformOverlayTranslateX = -waveformScrollLeft;
  const waveformGuideOverlayWidth = Math.max(1, acousticOverlayViewportWidth);
  const waveformGuideOverlayHeight = Math.max(1, waveformHeight);
  const waveformGuideLabelY = Math.max(1, Math.min(14, waveformGuideOverlayHeight - 1));
  const waveformGuideHotspotTopY = Math.min(4, Math.max(0, waveformGuideOverlayHeight - 1));
  const waveformGuideHotspotBottomY = Math.max(
    waveformGuideHotspotTopY,
    waveformGuideOverlayHeight - waveformGuideHotspotTopY,
  );
  const shouldRenderSelectedHotspot = waveformDisplayMode === 'waveform'
    && selectedHotspotLeftPx != null
    && Number.isFinite(selectedHotspotLeftPx)
    && selectedHotspotLeftPx >= -6
    && selectedHotspotLeftPx <= acousticOverlayViewportWidth + 6;
  const snapGuideWindowSec = snapEnabled && snapGuideVisible && playerDuration > 0 && rulerView
    ? rulerView.end - rulerView.start
    : null;
  const snapGuideLeftPx = snapGuideWindowSec && snapGuideWindowSec > 0
    ? (((snapGuideLeft ?? 0) - (rulerView?.start ?? 0)) / snapGuideWindowSec) * waveformGuideOverlayWidth
    : null;
  const snapGuideRightPx = snapGuideWindowSec && snapGuideWindowSec > 0 && typeof snapGuideRight === 'number'
    ? ((snapGuideRight - (rulerView?.start ?? 0)) / snapGuideWindowSec) * waveformGuideOverlayWidth
    : null;
  const waveformAnalysisBandNodes = React.useMemo(() => (
    <WaveformAnalysisBands
      locale={locale}
      waveformLowConfidenceOverlays={waveformLowConfidenceOverlays}
      waveformOverlapOverlays={waveformOverlapOverlays}
    />
  ), [locale, waveformLowConfidenceOverlays, waveformOverlapOverlays]);

  const handleWaveformNotePopoverOpen = React.useCallback((input: { x: number; y: number; uttId: string; layerId?: string }) => {
    setNotePopover({ x: input.x, y: input.y, uttId: input.uttId, ...(input.layerId ? { layerId: input.layerId } : {}), scope: 'waveform' });
  }, [setNotePopover]);

  const spectrogramOverlayNode = React.useMemo(() => (
    <div
      className="transcription-wave-spectrogram-overlay"
      onMouseMove={handleSpectrogramMouseMove}
      onMouseLeave={handleSpectrogramMouseLeave}
      onClick={handleSpectrogramClick}
      role="presentation"
    />
  ), [handleSpectrogramClick, handleSpectrogramMouseLeave, handleSpectrogramMouseMove]);

  const waveformShellOverlayNode = React.useMemo(() => (
    <WaveformShellOverlay
      waveformGuideOverlayWidth={waveformGuideOverlayWidth}
      waveformOverlayTranslateX={waveformOverlayTranslateX}
      waveformAnalysisBandNodes={waveformAnalysisBandNodes}
      activeReadout={activeReadout}
      formatTime={formatTime}
    />
  ), [activeReadout, waveformAnalysisBandNodes, waveformGuideOverlayWidth, waveformOverlayTranslateX]);

  const waveformOverlayNode = React.useMemo(() => (
    <WaveformOverlayDecorations
      locale={locale}
      waveformGuideOverlayWidth={waveformGuideOverlayWidth}
      waveformGuideOverlayHeight={waveformGuideOverlayHeight}
      waveformGuideLabelY={waveformGuideLabelY}
      waveformGuideHotspotTopY={waveformGuideHotspotTopY}
      waveformGuideHotspotBottomY={waveformGuideHotspotBottomY}
      shouldRenderSelectedHotspot={shouldRenderSelectedHotspot}
      selectedHotspotLeftPx={selectedHotspotLeftPx}
      snapGuideLeftPx={snapGuideLeftPx}
      snapGuideRightPx={snapGuideRightPx}
      snapGuideNearSideValue={snapGuideNearSideValue}
      acousticOverlayMode={acousticOverlayMode}
      acousticOverlayViewportWidth={acousticOverlayViewportWidth}
      acousticOverlayF0Path={acousticOverlayF0Path}
      acousticOverlayIntensityPath={acousticOverlayIntensityPath}
      acousticOverlayVisibleSummary={acousticOverlayVisibleSummary}
      acousticOverlayLoading={acousticOverlayLoading}
      hasActiveReadout={activeReadout != null}
      waveLassoOverlay={waveLassoOverlay}
      waveformOverlayTranslateX={waveformOverlayTranslateX}
      waveformNoteIndicators={waveformNoteIndicators}
      onOpenWaveformNotePopover={handleWaveformNotePopoverOpen}
    />
  ), [
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayLoading,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayVisibleSummary,
    activeReadout,
    locale,
    selectedHotspotLeftPx,
    shouldRenderSelectedHotspot,
    snapGuideLeftPx,
    snapGuideNearSideValue,
    snapGuideRightPx,
    waveformGuideHotspotBottomY,
    waveformGuideHotspotTopY,
    waveformGuideLabelY,
    waveformGuideOverlayHeight,
    waveformGuideOverlayWidth,
    waveformNoteIndicators,
    handleWaveformNotePopoverOpen,
    waveformOverlayTranslateX,
    waveLassoOverlay,
  ]);

  const segMarkStatusNode = React.useMemo(() => {
    if (segMarkStart === null) return null;
    return (
      <div className="seg-mark-status">
        ✦ {tf(locale, 'transcription.wave.markingHint', { start: formatTime(segMarkStart) })}
      </div>
    );
  }, [locale, segMarkStart]);

  // Attach wheel handler natively with { passive: false } so preventDefault() works.
  // React 18 registers wheel as a passive listener, causing errors on preventDefault().
  useEffect(() => {
    const el = waveformAreaRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWaveformAreaWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWaveformAreaWheel);
  }, [waveformAreaRef, handleWaveformAreaWheel]);

  return (
    <>
      <WaveformAreaSection
        containerRef={waveformAreaRef}
        className={`transcription-waveform-area ${snapEnabled && snapGuideNearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''} ${isResizingWaveform ? 'waveform-area-resizing' : ''}`}
        layoutStyle={{ '--waveform-height': `${waveformHeight}px` } as React.CSSProperties}
        tabIndex={0}
        aria-busy={acousticChrome?.waveformAreaAttrs.ariaBusy}
        data-timeline-acoustic-shell={acousticChrome?.waveformAreaAttrs.dataTimelineAcousticShell}
        onKeyDown={handleWaveformKeyDown}
        onFocus={handleWaveformAreaFocus}
        onBlur={handleWaveformAreaBlur}
        onMouseMove={handleWaveformAreaMouseMove}
        onMouseLeave={handleWaveformAreaMouseLeave}
      >
        {waveformHoverTooltipNode}
        {waveformLeftStatusStripNode}
        <div className="waveform-content-offset">
          {selectedMediaUrl ? (
            <>
              <VideoPreviewSection
                selectedMediaIsVideo={selectedMediaIsVideo}
                selectedMediaUrl={selectedMediaUrl}
                videoLayoutMode={videoLayoutMode}
                videoPreviewHeight={videoPreviewHeight}
                videoRightPanelWidth={videoRightPanelWidth}
                waveformRegions={waveformRegions}
                selectedUnitIds={selectedUnitIds}
                activeUnitId={activeTimelineUnitId}
                segmentLoopPlayback={segmentLoopPlayback}
                subSelectionRange={subSelectionRange}
                isResizingVideoPreview={isResizingVideoPreview}
                isResizingVideoRightPanel={isResizingVideoRightPanel}
                onVideoPreviewResizeStart={(event) => {
                  recordTranscriptionKeyboardAction('timelineVideoResizeHandle');
                  handleVideoPreviewResizeStart(event);
                }}
                onVideoRightPanelResizeStart={(event) => {
                  recordTranscriptionKeyboardAction('timelineVideoResizeHandle');
                  handleVideoRightPanelResizeStart(event);
                }}
                waveformStripHeight={waveformHeight}
                waveformDisplayMode={waveformDisplayMode}
                waveCanvasRef={effectiveWaveCanvasRef}
                waveformStripWheelShellRef={waveformStripWheelShellRef}
                playerSpectrogramRef={playerSpectrogramRef}
                playerWaveformRef={playerWaveformRef}
                onSeek={playerSeekTo}
                onPlayRegion={playerPlayRegion}
                spectrogramOverlay={spectrogramOverlayNode}
                waveformShellOverlay={waveformShellOverlayNode}
                waveformOverlay={waveformOverlayNode}
              />
              <WaveformRegionActionLayer
                selectedMediaIsVideo={selectedMediaIsVideo}
                selectedWaveformTimelineItem={selectedWaveformTimelineItem}
                playerIsReady={playerIsReady}
                zoomPxPerSec={zoomPxPerSec}
                waveformScrollLeft={waveformScrollLeft}
                playerInstanceGetWidth={playerInstanceGetWidth}
                playerIsPlaying={playerIsPlaying}
                segmentPlaybackRate={segmentPlaybackRate}
                segmentLoopPlayback={segmentLoopPlayback}
                handleSegmentPlaybackRateChange={handleSegmentPlaybackRateChange}
                handleToggleSelectedWaveformLoop={handleToggleSelectedWaveformLoop}
                handleToggleSelectedWaveformPlay={handleToggleSelectedWaveformPlay}
              />
            </>
          ) : (
            <>
              {/*
                纯文本/无声学也挂载 waveCanvasRef：与有波形时一样供 useZoom 量宽、绑滚轮与底部缩放，避免 ref 恒为 null 时缩放/标尺失效。
                Text-only: keep waveCanvasRef on a 0-height viewport so useZoom and zoom controls work.
              */}
              <div
                ref={effectiveWaveCanvasRef}
                className="transcription-logical-waveform-viewport"
                aria-hidden
              />
              <div className="wave-empty transcription-wave-empty-centered">
                {!selectedMediaUrl ? (
                  <button
                    className="transcription-import-media-btn"
                    onClick={() => mediaFileInputRef.current?.click()}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {t(locale, 'transcription.wave.emptyImportMedia')}
                  </button>
                ) : (
                  t(locale, 'transcription.wave.emptyNoMedia')
                )}
              </div>
            </>
          )}
          {segMarkStatusNode}
        </div>
      </WaveformAreaSection>
    </>
  );
});
