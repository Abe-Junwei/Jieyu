import type { ComponentPropsWithoutRef, CSSProperties, MutableRefObject, PointerEventHandler, ReactNode, Ref, RefObject } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { LayerUnitDocType } from '../../db';
import { VideoPlayer } from '../VideoPlayer';
import { TimeRuler } from '../TimeRuler';
import { TimelineStyledContainer } from './TimelineStyledContainer';
import type { WaveSurferRegion } from '../../hooks/useWaveSurfer';
import { t, useLocale } from '../../i18n';
import { getWaveformDisplayHeights, type WaveformDisplayMode } from '../../utils/waveformDisplayMode';

export type VideoLayoutMode = 'top' | 'right' | 'left';

type VideoPreviewSectionProps = {
  selectedMediaIsVideo: boolean;
  selectedMediaUrl: string;
  videoLayoutMode: VideoLayoutMode;
  videoPreviewHeight: number;
  videoRightPanelWidth: number;
  waveformRegions: WaveSurferRegion[];
  selectedUnitIds: Set<string>;
  activeUnitId: string;
  segmentLoopPlayback: boolean;
  subSelectionRange: { start: number; end: number } | null;
  isResizingVideoPreview: boolean;
  isResizingVideoRightPanel: boolean;
  onVideoPreviewResizeStart: PointerEventHandler<HTMLDivElement>;
  onVideoRightPanelResizeStart: PointerEventHandler<HTMLDivElement>;
  waveformStripHeight: number;
  waveformDisplayMode: WaveformDisplayMode;
  waveCanvasRef: MutableRefObject<HTMLDivElement | null>;
  playerSpectrogramRef: MutableRefObject<HTMLDivElement | null>;
  playerWaveformRef: MutableRefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  onPlayRegion: (start: number, end: number, resume?: boolean) => void;
  waveformOverlay?: ReactNode;
  waveformShellOverlay?: ReactNode;
  spectrogramOverlay?: ReactNode;
};

export function VideoPreviewSection({
  selectedMediaIsVideo,
  selectedMediaUrl,
  videoLayoutMode,
  videoPreviewHeight,
  videoRightPanelWidth,
  waveformRegions,
  selectedUnitIds,
  activeUnitId,
  segmentLoopPlayback,
  subSelectionRange,
  isResizingVideoPreview,
  isResizingVideoRightPanel,
  onVideoPreviewResizeStart,
  onVideoRightPanelResizeStart,
  waveformStripHeight,
  waveformDisplayMode,
  waveCanvasRef,
  playerSpectrogramRef,
  playerWaveformRef,
  onSeek,
  onPlayRegion,
  waveformOverlay,
  waveformShellOverlay,
  spectrogramOverlay,
}: VideoPreviewSectionProps) {
  const locale = useLocale();
  const { waveformPrimaryHeight, spectrogramHeight } = getWaveformDisplayHeights(waveformStripHeight, waveformDisplayMode);
  const renderWaveDisplay = () => (
    <TimelineStyledContainer
      className={`waveform-display-shell waveform-display-shell-${waveformDisplayMode}`}
      layoutStyle={{
        '--waveform-height': `${waveformPrimaryHeight}px`,
        '--waveform-primary-height': `${waveformPrimaryHeight}px`,
        '--waveform-spectrogram-height': `${spectrogramHeight}px`,
        '--waveform-shell-height': `${waveformStripHeight}px`,
      } as CSSProperties}
    >
      <div className="waveform-primary-stage">
        <div
          ref={(el) => {
            waveCanvasRef.current = el;
            playerWaveformRef.current = el;
          }}
          className={`wave-canvas transcription-wave-canvas transcription-wave-canvas-${waveformDisplayMode}`}
        />
        {waveformOverlay}
      </div>
      <div
        ref={playerSpectrogramRef}
        className={`transcription-wave-spectrogram ${waveformDisplayMode === 'waveform' ? 'transcription-wave-spectrogram-hidden' : ''}`}
        aria-hidden={waveformDisplayMode === 'waveform'}
      >
        {waveformDisplayMode !== 'waveform' ? spectrogramOverlay : null}
      </div>
      {waveformShellOverlay}
    </TimelineStyledContainer>
  );

  if (!selectedMediaIsVideo) {
    return (
      <div className="video-preview-layout-wave">
        {renderWaveDisplay()}
      </div>
    );
  }

  const isRightLayout = videoLayoutMode === 'right';
  const isLeftLayout = videoLayoutMode === 'left';
  const isSideLayout = isRightLayout || isLeftLayout;
  const videoSubSelection = isSideLayout ? null : subSelectionRange;

  // 通过 CSS order 实现左/右布局，不重复渲染节点，保证 WaveSurfer DOM 稳定
  // Use CSS order to handle left/right layout without re-mounting nodes
  const layoutClass = isRightLayout
    ? 'video-preview-layout-right'
    : isLeftLayout
      ? 'video-preview-layout-left'
      : 'video-preview-layout-top';

  return (
    <TimelineStyledContainer
      className={`video-preview-layout ${layoutClass}`}
      layoutStyle={{
        '--video-preview-panel-width': isSideLayout ? `${videoRightPanelWidth}px` : '100%',
        '--video-preview-panel-height': `${isSideLayout ? waveformStripHeight : videoPreviewHeight}px`,
      } as CSSProperties}
    >
      <div className="video-preview-layout-wave">
        {renderWaveDisplay()}
      </div>

      {/* 侧边布局拖拽手柄（左/右均复用，CSS order 决定位置）| Side-layout resize handle, CSS order positions it */}
      {isSideLayout && (
        <div
          className={`video-preview-right-resize-handle ${isResizingVideoRightPanel ? 'resizing' : ''}`}
          onPointerDown={onVideoRightPanelResizeStart}
          role="separator"
          aria-orientation="vertical"
          title={t(locale, 'transcription.timeline.video.resizePanelWidth')}
        >
          <div className="video-preview-right-resize-dots" />
        </div>
      )}

      <div className="video-preview-layout-video">
        {/* 视频预览面板（可拖动）| Video preview panel (drag-resizable) */}
        <div className="video-preview-panel">
          <VideoPlayer
            mediaUrl={selectedMediaUrl}
            regions={waveformRegions}
            activeRegionIds={selectedUnitIds}
            primaryRegionId={activeUnitId}
            onRegionClick={(regionId) => {
              const region = waveformRegions.find((r) => r.id === regionId);
              if (!region) return;
              onSeek(region.start);
              onPlayRegion(region.start, region.end, true);
            }}
            onTimeUpdate={(time) => {
              onSeek(time);
            }}
            segmentLoop={segmentLoopPlayback}
            subSelection={videoSubSelection}
            videoHeight={isSideLayout ? Math.max(waveformStripHeight - 56, 120) : videoPreviewHeight - 50}
          />
        </div>
        {!isSideLayout && (
          <div
            className={`video-preview-resize-handle ${isResizingVideoPreview ? 'resizing' : ''}`}
            onPointerDown={onVideoPreviewResizeStart}
            role="separator"
            aria-orientation="horizontal"
            title={t(locale, 'transcription.timeline.video.resizePreviewHeight')}
          >
            <div className="video-preview-resize-dots" />
          </div>
        )}
      </div>
    </TimelineStyledContainer>
  );
}

type TimelineHeaderSectionProps = {
  duration: number;
  units: LayerUnitDocType[];
  rulerView: { start: number; end: number } | null;
  onSeek: (time: number) => void;
  isReady: boolean;
  currentTime: number;
  zoomPxPerSec: number;
  isLaneHeaderCollapsed: boolean;
  onToggleLaneHeader: () => void;
  instanceRef: RefObject<WaveSurfer | null>;
  waveCanvasRef: RefObject<HTMLDivElement | null>;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  onWaveformResizeStart?: PointerEventHandler<HTMLDivElement>;
  isResizingWaveform?: boolean;
};

export function TimelineHeaderSection({
  duration,
  units,
  rulerView,
  onSeek,
  isReady,
  currentTime,
  zoomPxPerSec,
  isLaneHeaderCollapsed,
  onToggleLaneHeader,
  instanceRef,
  waveCanvasRef,
  tierContainerRef,
  onWaveformResizeStart,
  isResizingWaveform,
}: TimelineHeaderSectionProps) {
  const onResizeStart = onWaveformResizeStart;
  const hasTimelineContext = isReady || duration > 0 || Boolean(rulerView) || units.length > 0;
  const canRenderTimeRuler = isReady && duration > 0 && Boolean(rulerView);
  const shouldReserveTimeRulerSlot = hasTimelineContext;

  return canRenderTimeRuler && rulerView ? (
    <TimeRuler
      duration={duration}
      currentTime={currentTime}
      rulerView={rulerView}
      zoomPxPerSec={zoomPxPerSec}
      isLaneHeaderCollapsed={isLaneHeaderCollapsed}
      onToggleLaneHeader={onToggleLaneHeader}
      seekTo={onSeek}
      instanceRef={instanceRef}
      waveCanvasRef={waveCanvasRef}
      tierContainerRef={tierContainerRef}
      {...(onResizeStart ? { onWaveformResizeStart: onResizeStart } : {})}
      {...(isResizingWaveform !== undefined ? { isResizingWaveform } : {})}
    />
  ) : shouldReserveTimeRulerSlot ? (
    <div className="time-ruler time-ruler-placeholder" aria-hidden="true" />
  ) : null;
}

type TimelineRailSectionProps = {
  children: ReactNode;
};

export function TimelineRailSection({ children }: TimelineRailSectionProps) {
  return <>{children}</>;
}

type TimelineScrollSectionProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'ref' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onScroll'> & {
  containerRef: Ref<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onScroll: React.UIEventHandler<HTMLDivElement>;
  children: ReactNode;
};

export function TimelineScrollSection({
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onScroll,
  children,
  ...divProps
}: TimelineScrollSectionProps) {
  return (
    <div
      className="timeline-scroll"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onScroll={onScroll}
      {...divProps}
    >
      {children}
    </div>
  );
}
