/**
 * OrchestratorWaveformContent — 波形区域内容组件
 * Renders WaveformAreaSection children: hover tooltip, status strip, video preview,
 * overlay indicators (lasso, snap guides, note icons), region action overlay,
 * empty state, segment mark status, and the waveform resize handle.
 *
 * 从 TranscriptionPage.Orchestrator.tsx 中提取。
 * Extracted from TranscriptionPage.Orchestrator.tsx.
 */

import React, { type MutableRefObject, type RefObject } from 'react';
import type { UtteranceDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import { WaveformHoverTooltip } from '../components/transcription/WaveformHoverTooltip';
import { WaveformReadoutCard } from '../components/transcription/WaveformReadoutCard';
import { WaveformLeftStatusStrip } from '../components/transcription/WaveformLeftStatusStrip';
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

interface WaveformGapOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  gapSeconds: number;
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
  handleWaveformAreaWheel: React.WheelEventHandler<HTMLDivElement>;

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
  selectedUtteranceDuration: number | null;
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
  selectedUtteranceIds: Set<string>;
  selectedTimelineUtteranceId: string;
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
  waveformGapOverlays: WaveformGapOverlay[];
  acousticOverlayMode: AcousticOverlayMode;
  acousticOverlayViewportWidth: number;
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
  acousticOverlayLoading: boolean;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
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

export function OrchestratorWaveformContent(props: OrchestratorWaveformContentProps) {
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
    selectedUtteranceDuration,
    amplitudeScale,
    setAmplitudeScale,
    selectedMediaIsVideo,
    videoLayoutMode,
    setVideoLayoutMode,
    handleLaneLabelWidthResizeStart,
    videoPreviewHeight,
    videoRightPanelWidth,
    waveformRegions,
    selectedUtteranceIds,
    selectedTimelineUtteranceId,
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
    waveformGapOverlays,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
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

  return (
    <>
      <WaveformAreaSection
        containerRef={waveformAreaRef}
        className={`transcription-waveform-area ${snapGuideNearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''} ${isResizingWaveform ? 'waveform-area-resizing' : ''}`}
        style={{ '--waveform-height': `${waveformHeight}px` } as React.CSSProperties}
        tabIndex={0}
        onKeyDown={handleWaveformKeyDown}
        onFocus={handleWaveformAreaFocus}
        onBlur={handleWaveformAreaBlur}
        onMouseMove={handleWaveformAreaMouseMove}
        onMouseLeave={handleWaveformAreaMouseLeave}
        onWheel={handleWaveformAreaWheel}
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
            selectedUtteranceDuration={selectedUtteranceDuration}
            amplitudeScale={amplitudeScale}
            onAmplitudeChange={setAmplitudeScale}
            onAmplitudeReset={() => setAmplitudeScale(1)}
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
                selectedUtteranceIds={selectedUtteranceIds}
                activeUtteranceUnitId={selectedTimelineUtteranceId}
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
                    {activeReadout ? (
                      <WaveformReadoutCard readout={activeReadout} formatTime={formatTime} />
                    ) : null}
                    {waveformLowConfidenceOverlays.map(({ id, leftPx, widthPx, confidence }) => (
                      <div
                        key={`confidence-${id}`}
                        className="waveform-analysis-band waveform-analysis-band-confidence"
                        style={{ left: leftPx, width: widthPx }}
                        title={tf(locale, 'transcription.wave.analysis.lowConfidenceTitle', { confidence: Math.round(confidence * 100) })}
                      >
                        {widthPx >= 46 ? <span>{t(locale, 'transcription.wave.analysis.lowConfidence')}</span> : null}
                      </div>
                    ))}
                    {waveformOverlapOverlays.map(({ id, leftPx, widthPx, concurrentCount }) => (
                      <div
                        key={`overlap-${id}`}
                        className="waveform-analysis-band waveform-analysis-band-overlap"
                        style={{ left: leftPx, width: widthPx }}
                        title={tf(locale, 'transcription.wave.analysis.overlapTitle', { count: concurrentCount })}
                      >
                        {widthPx >= 52 ? <span>{tf(locale, 'transcription.wave.analysis.overlap', { count: concurrentCount })}</span> : null}
                      </div>
                    ))}
                    {waveformGapOverlays.map(({ id, leftPx, widthPx, gapSeconds }) => (
                      <div
                        key={`gap-${id}`}
                        className="waveform-analysis-band waveform-analysis-band-gap"
                        style={{ left: leftPx, width: widthPx }}
                        title={tf(locale, 'transcription.wave.analysis.gapTitle', { seconds: gapSeconds.toFixed(1) })}
                      >
                        {widthPx >= 52 ? <span>{tf(locale, 'transcription.wave.analysis.gap', { seconds: gapSeconds.toFixed(1) })}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
                waveformOverlay={(
                  <>
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
                      <div
                        className={`wave-lasso-rect ${waveLassoRect.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
                        style={{
                          left: waveLassoRect.x,
                          top: waveLassoRect.y,
                          width: Math.max(2, waveLassoRect.w),
                          height: Math.max(2, waveLassoRect.h),
                        }}
                      >
                        {waveLassoRect.mode === 'select' && (
                          <div className="wave-lasso-hint">
                            {tf(locale, 'transcription.wave.selectionHint', { count: waveLassoHintCount })}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {waveformNoteIndicators.map(({ uttId, leftPx, widthPx, count, layerId }) => (
                      <div
                        key={`note-${uttId}`}
                        style={{
                          position: 'absolute', top: 0, left: leftPx + widthPx - 26,
                          width: 16, height: '100%', pointerEvents: 'auto', zIndex: 6,
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                          paddingBottom: 2, cursor: 'pointer',
                        }}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotePopover({ x: e.clientX, y: e.clientY, uttId, ...(layerId ? { layerId } : {}), scope: 'waveform' });
                        }}
                      >
                        <NoteDocumentIcon
                          ariaLabel={tf(locale, 'transcription.notes.count', { count })}
                          title={tf(locale, 'transcription.notes.count', { count })}
                          style={{ width: 16, height: 16, color: 'var(--state-info-border)', opacity: 0.92 }}
                        />
                      </div>
                    ))}
                    {snapGuideVisible && playerDuration > 0 && rulerView && (() => {
                      const windowSec = rulerView.end - rulerView.start;
                      if (windowSec <= 0) return null;
                      const pctL = ((snapGuideLeft ?? 0) - rulerView.start) / windowSec * 100;
                      const pctR = typeof snapGuideRight === 'number' ? (snapGuideRight - rulerView.start) / windowSec * 100 : null;
                      return (
                        <>
                          <div
                            className={`snap-line snap-line-left ${snapGuideNearSideValue === 'left' || snapGuideNearSideValue === 'both' ? 'snap-line-near' : ''}`}
                            style={{ left: `${pctL}%` }}
                          >
                            <span>L</span>
                          </div>
                          {pctR !== null && (
                            <div
                              className={`snap-line snap-line-right ${snapGuideNearSideValue === 'right' || snapGuideNearSideValue === 'both' ? 'snap-line-near' : ''}`}
                              style={{ left: `${pctR}%` }}
                            >
                              <span>R</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
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
            <div className="wave-empty transcription-wave-empty" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
}
