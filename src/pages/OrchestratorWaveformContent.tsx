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
import type { UtteranceDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { AcousticRuntimeStatus, VadCacheStatus } from '../contexts/AiPanelContext';
import { WaveformHoverTooltip } from '../components/transcription/WaveformHoverTooltip';
import { WaveformReadoutCard } from '../components/transcription/WaveformReadoutCard';
import { WaveformLeftStatusStrip } from '../components/transcription/WaveformLeftStatusStrip';
import { ToolbarAiProgress } from '../components/transcription/toolbar/ToolbarAiProgress';
import { RegionActionOverlay } from '../components/transcription/RegionActionOverlay';
import { NoteDocumentIcon } from '../components/NoteDocumentIcon';
import {
  VideoPreviewSection,
  type VideoLayoutMode,
} from '../components/transcription/TranscriptionTimelineSections';
import {
  WaveformAreaSection,
} from '../components/transcription/TranscriptionLayoutSections';
import type { WaveSurferRegion } from '../hooks/useWaveSurfer';
import { t, tf, type Locale } from '../i18n';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import { formatTime } from '../utils/transcriptionFormatters';

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
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType) => string | null | undefined;
  waveformHoverPreviewProps: { dir?: 'ltr' | 'rtl'; style?: React.CSSProperties };

  // Left status strip
  selectedMediaUrl: string | null | undefined;
  zoomPercent: number;
  snapEnabled: boolean;
  toggleSnapEnabled: () => void;
  playerPlaybackRate: number;
  playerCurrentTime: number;
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
  playerSpectrogramRef: MutableRefObject<HTMLDivElement | null>;
  playerWaveformRef: MutableRefObject<HTMLDivElement | null>;
  playerSeekTo: (time: number) => void;
  playerPlayRegion: (start: number, end: number, resume?: boolean) => void;

  // Lasso rect
  waveLassoRect: { x: number; y: number; w: number; h: number; mode: string } | null;
  waveLassoHintCount: number;

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
  selectedWaveformTimelineItem: { startTime: number; endTime: number } | null;
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

  // Resize handle
  handleWaveformResizeStart: React.PointerEventHandler<HTMLDivElement>;
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
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    waveformHoverPreviewProps,
    selectedMediaUrl,
    zoomPercent,
    snapEnabled,
    toggleSnapEnabled,
    playerPlaybackRate,
    playerCurrentTime,
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
    playerSpectrogramRef,
    playerWaveformRef,
    playerSeekTo,
    playerPlayRegion,
    waveLassoRect,
    waveLassoHintCount,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    acousticRuntimeStatus,
    vadCacheStatus,
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
    handleWaveformResizeStart,
  } = props;

  // 稳定引用，避免 WaveformLeftStatusStrip 不必要重渲染 | Stable ref to prevent WaveformLeftStatusStrip re-renders
  const handleAmplitudeReset = React.useCallback(() => setAmplitudeScale(1), [setAmplitudeScale]);

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
  const renderWaveformAnalysisBand = (
    bandType: 'confidence' | 'overlap' | 'gap',
    clipKey: string,
    leftPx: number,
    widthPx: number,
    title: string,
    label: string | null,
  ) => {
    const bandWidth = Math.max(2, widthPx);
    const clipPathId = `waveform-analysis-band-clip-${clipKey}`;
    return (
      <g key={clipKey}>
        <title>{title}</title>
        <clipPath id={clipPathId}>
          <rect x={leftPx} y={4} width={bandWidth} height={92} rx={8} ry={8} />
        </clipPath>
        <rect
          className={`waveform-analysis-band-shape waveform-analysis-band-${bandType}`}
          x={leftPx}
          y={4}
          width={bandWidth}
          height={92}
          rx={8}
          ry={8}
        />
        {label ? (
          <text
            className={`waveform-analysis-band-label waveform-analysis-band-label-${bandType}`}
            x={leftPx + 8}
            y={11}
            clipPath={`url(#${clipPathId})`}
          >
            {label}
          </text>
        ) : null}
      </g>
    );
  };

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
        onKeyDown={handleWaveformKeyDown}
        onFocus={handleWaveformAreaFocus}
        onBlur={handleWaveformAreaBlur}
        onMouseMove={handleWaveformAreaMouseMove}
        onMouseLeave={handleWaveformAreaMouseLeave}
      >
        {hoverTime && (
          <WaveformHoverTooltip
            time={hoverTime.time}
            x={hoverTime.x}
            y={hoverTime.y}
            utterances={utterancesOnCurrentMedia}
            getUtteranceTextForLayer={getUtteranceTextForLayer}
            formatTime={formatTime}
            {...(waveformHoverPreviewProps.dir !== undefined ? { previewDir: waveformHoverPreviewProps.dir } : {})}
            {...(waveformHoverPreviewProps.style !== undefined ? { previewStyle: waveformHoverPreviewProps.style } : {})}
          />
        )}
        {selectedMediaUrl && (
          <WaveformLeftStatusStrip
            zoomPercent={zoomPercent}
            snapEnabled={snapEnabled}
            onSnapToggle={toggleSnapEnabled}
            playbackRate={playerPlaybackRate}
            currentTime={playerCurrentTime}
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
        )}
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
                onVideoPreviewResizeStart={handleVideoPreviewResizeStart}
                onVideoRightPanelResizeStart={handleVideoRightPanelResizeStart}
                waveformStripHeight={waveformHeight}
                waveformDisplayMode={waveformDisplayMode}
                waveCanvasRef={waveCanvasRef}
                playerSpectrogramRef={playerSpectrogramRef}
                playerWaveformRef={playerWaveformRef}
                onSeek={playerSeekTo}
                onPlayRegion={playerPlayRegion}
                spectrogramOverlay={(
                  <div
                    className="transcription-wave-spectrogram-overlay"
                    onMouseMove={handleSpectrogramMouseMove}
                    onMouseLeave={handleSpectrogramMouseLeave}
                    onClick={handleSpectrogramClick}
                    role="presentation"
                  />
                )}
                waveformShellOverlay={(
                  <div className="waveform-analysis-overlay" aria-hidden="true">
                    <svg
                      className="waveform-analysis-band-overlay"
                      viewBox={`0 0 ${waveformGuideOverlayWidth} 100`}
                      preserveAspectRatio="none"
                    >
                      {waveformLowConfidenceOverlays.map(({ id, leftPx, widthPx, confidence }, index) => renderWaveformAnalysisBand(
                        'confidence',
                        `confidence-${index}-${id}`,
                        leftPx,
                        widthPx,
                        tf(locale, 'transcription.wave.analysis.lowConfidenceTitle', { confidence: Math.round(confidence * 100) }),
                        widthPx >= 46 ? t(locale, 'transcription.wave.analysis.lowConfidence') : null,
                      ))}
                      {waveformOverlapOverlays.map(({ id, leftPx, widthPx, concurrentCount }, index) => renderWaveformAnalysisBand(
                        'overlap',
                        `overlap-${index}-${id}`,
                        leftPx,
                        widthPx,
                        tf(locale, 'transcription.wave.analysis.overlapTitle', { count: concurrentCount }),
                        widthPx >= 120 ? tf(locale, 'transcription.wave.analysis.overlap', { count: concurrentCount }) : null,
                      ))}

                    </svg>
                    <div className="waveform-runtime-status">
                      <ToolbarAiProgress
                        {...(acousticRuntimeStatus !== undefined ? { acousticRuntimeStatus } : {})}
                        {...(vadCacheStatus !== undefined ? { vadCacheStatus } : {})}
                      />
                    </div>
                    {activeReadout ? (
                      <WaveformReadoutCard readout={activeReadout} formatTime={formatTime} />
                    ) : null}
                  </div>
                )}
                waveformOverlay={(
                  <>
                    {(shouldRenderSelectedHotspot || snapGuideLeftPx != null || snapGuideRightPx != null) ? (
                      <svg
                        className="waveform-guide-overlay"
                        viewBox={`0 0 ${waveformGuideOverlayWidth} ${waveformGuideOverlayHeight}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {shouldRenderSelectedHotspot ? (
                          <line
                            className="waveform-analysis-hotspot-line"
                            x1={selectedHotspotLeftPx as number}
                            x2={selectedHotspotLeftPx as number}
                            y1={waveformGuideHotspotTopY}
                            y2={waveformGuideHotspotBottomY}
                          />
                        ) : null}
                        {snapGuideLeftPx != null ? (
                          <g>
                            <line
                              className={`waveform-snap-guide-line waveform-snap-guide-line-left ${snapGuideNearSideValue === 'left' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-line-near' : ''}`}
                              x1={snapGuideLeftPx}
                              x2={snapGuideLeftPx}
                              y1={0}
                              y2={waveformGuideOverlayHeight}
                            />
                            <text
                              className={`waveform-snap-guide-label waveform-snap-guide-label-left ${snapGuideNearSideValue === 'left' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-label-near' : ''}`}
                              x={snapGuideLeftPx}
                              y={waveformGuideLabelY}
                              textAnchor="middle"
                            >
                              L
                            </text>
                          </g>
                        ) : null}
                        {snapGuideRightPx != null ? (
                          <g>
                            <line
                              className={`waveform-snap-guide-line waveform-snap-guide-line-right ${snapGuideNearSideValue === 'right' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-line-near' : ''}`}
                              x1={snapGuideRightPx}
                              x2={snapGuideRightPx}
                              y1={0}
                              y2={waveformGuideOverlayHeight}
                            />
                            <text
                              className={`waveform-snap-guide-label waveform-snap-guide-label-right ${snapGuideNearSideValue === 'right' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-label-near' : ''}`}
                              x={snapGuideRightPx}
                              y={waveformGuideLabelY}
                              textAnchor="middle"
                            >
                              R
                            </text>
                          </g>
                        ) : null}
                      </svg>
                    ) : null}
                    {acousticOverlayMode !== 'none' ? (
                      <div className="waveform-acoustic-overlay" aria-hidden="true">
                        <svg
                          viewBox={`0 0 ${Math.max(1, acousticOverlayViewportWidth)} 100`}
                          preserveAspectRatio="none"
                        >
                          {acousticOverlayIntensityPath ? (
                            <path className="waveform-acoustic-path waveform-acoustic-path-intensity" d={acousticOverlayIntensityPath} />
                          ) : null}
                          {acousticOverlayF0Path ? (
                            <path className="waveform-acoustic-path waveform-acoustic-path-f0" d={acousticOverlayF0Path} />
                          ) : null}
                        </svg>
                        <div className="waveform-acoustic-legend">
                          {acousticOverlayLoading ? (
                            <span className="waveform-acoustic-chip waveform-acoustic-chip-neutral">
                              {t(locale, 'transcription.wave.acoustic.loading')}
                            </span>
                          ) : null}
                          {!activeReadout && acousticOverlayMode !== 'intensity' ? (
                            <span className="waveform-acoustic-chip waveform-acoustic-chip-f0">
                              {t(locale, 'transcription.wave.acoustic.f0')}
                              {' '}
                              {acousticOverlayVisibleSummary?.f0MeanHz != null ? `${Math.round(acousticOverlayVisibleSummary.f0MeanHz)} Hz` : '—'}
                            </span>
                          ) : null}
                          {!activeReadout && acousticOverlayMode !== 'f0' ? (
                            <span className="waveform-acoustic-chip waveform-acoustic-chip-intensity">
                              {t(locale, 'transcription.wave.acoustic.intensity')}
                              {' '}
                              {acousticOverlayVisibleSummary?.intensityPeakDb != null ? `${acousticOverlayVisibleSummary.intensityPeakDb.toFixed(1)} dB` : '—'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {waveLassoRect ? (
                      <svg className="wave-lasso-overlay" aria-hidden="true">
                        <rect
                          className={`wave-lasso-rect ${waveLassoRect.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
                          x={waveLassoRect.x}
                          y={waveLassoRect.y}
                          width={Math.max(2, waveLassoRect.w)}
                          height={Math.max(2, waveLassoRect.h)}
                          rx={waveLassoRect.mode === 'create' ? 0 : 2}
                          ry={waveLassoRect.mode === 'create' ? 0 : 2}
                        />
                        {waveLassoRect.mode === 'select' && (
                          <foreignObject
                            x={waveLassoRect.x + 8}
                            y={waveLassoRect.y + 8}
                            width={172}
                            height={28}
                          >
                            <div className="wave-lasso-hint">
                              {tf(locale, 'transcription.wave.selectionHint', { count: waveLassoHintCount })}
                            </div>
                          </foreignObject>
                        )}
                      </svg>
                    ) : null}
                    {waveformNoteIndicators.map(({ uttId, leftPx, widthPx, count, layerId }) => (
                      <div
                        key={`note-${uttId}`}
                        className="waveform-note-indicator-trigger"
                        style={{ left: leftPx + widthPx - 26 }}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotePopover({ x: e.clientX, y: e.clientY, uttId, ...(layerId ? { layerId } : {}), scope: 'waveform' });
                        }}
                      >
                        <NoteDocumentIcon
                          className="waveform-note-indicator-icon"
                          ariaLabel={tf(locale, 'transcription.notes.count', { count })}
                          title={tf(locale, 'transcription.notes.count', { count })}
                        />
                      </div>
                    ))}
                  </>
                )}
              />
              {!selectedMediaIsVideo && selectedWaveformTimelineItem && playerIsReady && (
                <RegionActionOverlay
                  utteranceStartTime={selectedWaveformTimelineItem.startTime}
                  utteranceEndTime={selectedWaveformTimelineItem.endTime}
                  zoomPxPerSec={zoomPxPerSec}
                  scrollLeft={waveformScrollLeft}
                  waveAreaWidth={playerInstanceGetWidth()}
                  isPlaying={playerIsPlaying}
                  segmentPlaybackRate={segmentPlaybackRate}
                  segmentLoopPlayback={segmentLoopPlayback}
                  onPlaybackRateChange={handleSegmentPlaybackRateChange}
                  onToggleLoop={handleToggleSelectedWaveformLoop}
                  onTogglePlay={handleToggleSelectedWaveformPlay}
                />
              )}
            </>
          ) : (
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
          )}
          {segMarkStart !== null && (
            <div className="seg-mark-status">
              ✦ {tf(locale, 'transcription.wave.markingHint', { start: formatTime(segMarkStart) })}
            </div>
          )}
        </div>
      </WaveformAreaSection>
      {selectedMediaUrl ? (
        <div
          className={`transcription-waveform-resize-handle ${isResizingWaveform ? 'transcription-waveform-resize-handle-resizing' : ''}`}
          onPointerDown={handleWaveformResizeStart}
          role="separator"
          aria-orientation="horizontal"
          title={t(locale, 'transcription.wave.resizeHeight')}
        >
          <div className="transcription-waveform-resize-dots" />
        </div>
      ) : null}
    </>
  );
});
