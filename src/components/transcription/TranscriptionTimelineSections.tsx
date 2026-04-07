import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  MutableRefObject,
  PointerEventHandler,
  ReactNode,
  Ref,
  RefObject,
} from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { UtteranceDocType } from '../../db';
import { VideoPlayer } from '../VideoPlayer';
import { TimeRuler } from '../TimeRuler';
import { WaveformOverviewBar } from '../WaveformOverviewBar';
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
  selectedUtteranceIds: Set<string>;
  activeUtteranceUnitId: string;
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
};

export function VideoPreviewSection({
  selectedMediaIsVideo,
  selectedMediaUrl,
  videoLayoutMode,
  videoPreviewHeight,
  videoRightPanelWidth,
  waveformRegions,
  selectedUtteranceIds,
  activeUtteranceUnitId,
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
}: VideoPreviewSectionProps) {
  const locale = useLocale();
  const { waveformPrimaryHeight, spectrogramHeight } = getWaveformDisplayHeights(waveformStripHeight, waveformDisplayMode);
  const renderWaveDisplay = () => (
    <div
      className={`waveform-display-shell waveform-display-shell-${waveformDisplayMode}`}
      style={{
        '--waveform-primary-height': `${waveformPrimaryHeight}px`,
        '--waveform-spectrogram-height': `${spectrogramHeight}px`,
        height: waveformStripHeight,
        minHeight: waveformStripHeight,
      } as CSSProperties}
    >
      <div className="waveform-primary-stage">
        <div
          ref={(el) => {
            waveCanvasRef.current = el;
            playerWaveformRef.current = el;
          }}
          className={`wave-canvas transcription-wave-canvas transcription-wave-canvas-${waveformDisplayMode}`}
          style={{ height: waveformPrimaryHeight, minHeight: waveformPrimaryHeight } as CSSProperties}
        />
        {waveformOverlay}
      </div>
      <div
        ref={playerSpectrogramRef}
        className={`transcription-wave-spectrogram ${waveformDisplayMode === 'waveform' ? 'transcription-wave-spectrogram-hidden' : ''}`}
        aria-hidden={waveformDisplayMode === 'waveform'}
      />
      {waveformShellOverlay}
    </div>
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
    <div className={`video-preview-layout ${layoutClass}`}>
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

      <div
        className="video-preview-layout-video"
        style={isSideLayout
          ? { width: videoRightPanelWidth, maxWidth: 'calc(100% - 220px)' }
          : { width: '100%' }}
      >
        {/* 视频预览面板（可拖动）| Video preview panel (drag-resizable) */}
        <div className="video-preview-panel" style={{ height: isSideLayout ? waveformStripHeight : videoPreviewHeight }}>
          <VideoPlayer
            mediaUrl={selectedMediaUrl}
            regions={waveformRegions}
            activeRegionIds={selectedUtteranceIds}
            primaryRegionId={activeUtteranceUnitId}
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
    </div>
  );
}

type TimelineHeaderSectionProps = {
  duration: number;
  utterances: UtteranceDocType[];
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
};

export function TimelineHeaderSection({
  duration,
  utterances,
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
}: TimelineHeaderSectionProps) {
  return (
    <>
      <WaveformOverviewBar
        duration={duration}
        utterances={utterances}
        rulerView={rulerView}
        onSeek={onSeek}
        isReady={isReady}
      />
      {isReady && duration > 0 && rulerView && (
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
          utterances={utterances}
        />
      )}
    </>
  );
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
