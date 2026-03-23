import type {
  CSSProperties,
  MutableRefObject,
  PointerEventHandler,
  ReactNode,
  Ref,
  RefObject,
} from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { UtteranceDocType } from '../../../db';
import { VideoPlayer } from '../VideoPlayer';
import { TimeRuler } from '../TimeRuler';
import { WaveformOverviewBar } from '../WaveformOverviewBar';
import type { WaveSurferRegion } from '../../hooks/useWaveSurfer';

export type VideoLayoutMode = 'top' | 'right' | 'left';

type VideoPreviewSectionProps = {
  selectedMediaIsVideo: boolean;
  selectedMediaUrl: string;
  videoLayoutMode: VideoLayoutMode;
  videoPreviewHeight: number;
  videoRightPanelWidth: number;
  waveformRegions: WaveSurferRegion[];
  selectedUtteranceIds: Set<string>;
  selectedUtteranceId: string;
  segmentLoopPlayback: boolean;
  subSelectionRange: { start: number; end: number } | null;
  isResizingVideoPreview: boolean;
  isResizingVideoRightPanel: boolean;
  onVideoPreviewResizeStart: PointerEventHandler<HTMLDivElement>;
  onVideoRightPanelResizeStart: PointerEventHandler<HTMLDivElement>;
  waveformStripHeight: number;
  waveCanvasRef: MutableRefObject<HTMLDivElement | null>;
  playerWaveformRef: MutableRefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  onPlayRegion: (start: number, end: number, resume?: boolean) => void;
};

export function VideoPreviewSection({
  selectedMediaIsVideo,
  selectedMediaUrl,
  videoLayoutMode,
  videoPreviewHeight,
  videoRightPanelWidth,
  waveformRegions,
  selectedUtteranceIds,
  selectedUtteranceId,
  segmentLoopPlayback,
  subSelectionRange,
  isResizingVideoPreview,
  isResizingVideoRightPanel,
  onVideoPreviewResizeStart,
  onVideoRightPanelResizeStart,
  waveformStripHeight,
  waveCanvasRef,
  playerWaveformRef,
  onSeek,
  onPlayRegion,
}: VideoPreviewSectionProps) {
  const renderWaveCanvas = () => (
    <div
      ref={(el) => {
        waveCanvasRef.current = el;
        playerWaveformRef.current = el;
      }}
      className="wave-canvas transcription-wave-canvas"
      style={selectedMediaIsVideo
        ? ({ height: waveformStripHeight, minHeight: waveformStripHeight } as CSSProperties)
        : undefined}
    />
  );

  if (!selectedMediaIsVideo) {
    return renderWaveCanvas();
  }

  const isRightLayout = videoLayoutMode === 'right';
  const isLeftLayout = videoLayoutMode === 'left';
  const isSideLayout = isRightLayout || isLeftLayout;

  // 通过 CSS order 实现左/右布局，不重复渲染节点，保证 WaveSurfer DOM 稳定
  // Use CSS order to handle left/right layout without re-mounting nodes
  const layoutClass = isRightLayout
    ? 'video-preview-layout-right'
    : isLeftLayout
      ? 'video-preview-layout-left'
      : 'video-preview-layout-top';

  return (
    <div className={`video-preview-layout ${layoutClass}`}>
      <div className="video-preview-layout-wave">{renderWaveCanvas()}</div>

      {/* 侧边布局拖拽手柄（左/右均复用，CSS order 决定位置）| Side-layout resize handle, CSS order positions it */}
      {isSideLayout && (
        <div
          className={`video-preview-right-resize-handle ${isResizingVideoRightPanel ? 'resizing' : ''}`}
          onPointerDown={onVideoRightPanelResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="拖动调整视频面板宽度"
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
            primaryRegionId={selectedUtteranceId}
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
            subSelection={subSelectionRange}
            videoHeight={isSideLayout ? Math.max(waveformStripHeight - 56, 120) : videoPreviewHeight - 50}
          />
        </div>
        {!isSideLayout && (
          <div
            className={`video-preview-resize-handle ${isResizingVideoPreview ? 'resizing' : ''}`}
            onPointerDown={onVideoPreviewResizeStart}
            role="separator"
            aria-orientation="horizontal"
            title="拖动调整视频预览高度"
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

type TimelineScrollSectionProps = {
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
}: TimelineScrollSectionProps) {
  return (
    <div
      className="timeline-scroll"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onScroll={onScroll}
    >
      {children}
    </div>
  );
}
