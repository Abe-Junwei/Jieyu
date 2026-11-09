import { useCallback, useEffect, useRef, useState } from 'react';
import { JieyuIcon } from './ui/JieyuIcon';
import { JIEYU_ICON_WAVE, JIEYU_ICON_WAVE_PLAY } from '../utils/jieyuIcon';
import { useVideoPlayer } from '~/hooks/media/useVideoPlayer';
import type { WaveSurferRegion } from '~/hooks/media/useWaveSurfer';
import { t, useLocale } from '../i18n';
import { createLogger } from '../observability/logger';

type VideoPlayerProps = {
  mediaUrl: string | undefined;
  regions?: WaveSurferRegion[];
  activeRegionIds?: Set<string>;
  primaryRegionId?: string;
  onRegionClick?: (regionId: string, clickTime: number, event: MouseEvent) => void;
  onTimeUpdate?: (time: number) => void;
  segmentLoop?: boolean;
  globalLoop?: boolean;
  subSelection?: { start: number; end: number } | null;
  className?: string;
  autoPlay?: boolean;
  /** Pixel height of the video element */
  videoHeight?: number;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VIDEO_FIT_MODE_STORAGE_KEY = 'jieyu.video.fitMode';
const VIDEO_PROGRESS_OVERLAY_WIDTH = 1000;
const VIDEO_PROGRESS_OVERLAY_HEIGHT = 140;
const VIDEO_PROGRESS_BAR_Y = 40;
const VIDEO_PROGRESS_BAR_HEIGHT = 60;
const VIDEO_PROGRESS_BAR_RADIUS = 30;
const VIDEO_PROGRESS_THUMB_RADIUS = 70;

type VideoFitMode = 'fit' | 'fill' | 'original';

const log = createLogger('VideoPlayer');

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VideoPlayer({
  mediaUrl,
  regions,
  activeRegionIds,
  primaryRegionId,
  onRegionClick,
  onTimeUpdate,
  segmentLoop,
  globalLoop,
  subSelection,
  className = '',
  autoPlay = false,
  videoHeight = 360,
}: VideoPlayerProps) {
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoFitMode, setVideoFitMode] = useState<VideoFitMode>(() => {
    try {
      if (typeof window === 'undefined') return 'fit';
      const stored = window.localStorage.getItem(VIDEO_FIT_MODE_STORAGE_KEY);
      if (stored === 'fill' || stored === 'original') return stored as VideoFitMode;
      return 'fit';
    } catch (err) {
      log.error('failed to read video fit mode from localStorage, using default', { err });
      return 'fit';
    }
  });

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(VIDEO_FIT_MODE_STORAGE_KEY, videoFitMode);
    } catch (err) {
      log.error('failed to persist video fit mode to localStorage', { err });
    }
  }, [videoFitMode]);

  const player = useVideoPlayer({
    mediaUrl,
    ...(onTimeUpdate !== undefined && { onTimeUpdate }),
    ...(segmentLoop !== undefined && { segmentLoop }),
    ...(globalLoop !== undefined && { globalLoop }),
    ...(subSelection !== undefined && { subSelection }),
    ...(regions !== undefined && { regions }),
    ...(activeRegionIds !== undefined && { activeRegionIds }),
    ...(primaryRegionId !== undefined && { primaryRegionId }),
  });

  const { isReady, isPlaying, currentTime, duration, playbackRate, volume } = player;

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !isReady || duration <= 0) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * duration;

      // Region hit: force replay from region.start so video stays in sync with the waveform seek (#495).
      if (regions) {
        for (const region of regions) {
          if (newTime >= region.start && newTime <= region.end) {
            player.playRegion(region.start, region.end, false);
            onRegionClick?.(region.id, newTime, e.nativeEvent);
            return;
          }
        }
      }
      player.seekTo(newTime);
    },
    [player, regions, onRegionClick, isReady, duration],
  );

  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const progressOverlayX = progressRatio * VIDEO_PROGRESS_OVERLAY_WIDTH;
  const subSelectionOverlay =
    subSelection && duration > 0
      ? {
          x: (subSelection.start / duration) * VIDEO_PROGRESS_OVERLAY_WIDTH,
          width:
            ((subSelection.end - subSelection.start) / duration) * VIDEO_PROGRESS_OVERLAY_WIDTH,
        }
      : null;

  return (
    <div
      ref={containerRef}
      className={`video-player video-player-fit-${videoFitMode} ${className}`}
      style={{ '--video-player-height': `${videoHeight}px` } as React.CSSProperties}
    >
      {/* Native HTML5 video element */}
      <video
        ref={player.videoRef}
        src={mediaUrl}
        className="video-player-media"
        onClick={() => player.togglePlayback()}
        playsInline
        autoPlay={autoPlay}
      />

      {/* Controls overlay */}
      <div className="video-player-controls">
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="video-player-progress"
          onClick={handleProgressClick}
          title={formatTime(currentTime)}
        >
          <svg
            className="video-player-progress-overlay"
            viewBox={`0 0 ${VIDEO_PROGRESS_OVERLAY_WIDTH} ${VIDEO_PROGRESS_OVERLAY_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {subSelectionOverlay ? (
              <rect
                className="video-player-subselection"
                x={subSelectionOverlay.x}
                y={VIDEO_PROGRESS_BAR_Y}
                width={subSelectionOverlay.width}
                height={VIDEO_PROGRESS_BAR_HEIGHT}
                rx={VIDEO_PROGRESS_BAR_RADIUS}
                ry={VIDEO_PROGRESS_BAR_RADIUS}
              />
            ) : null}
            {regions?.map((region) => {
              const left =
                duration > 0 ? (region.start / duration) * VIDEO_PROGRESS_OVERLAY_WIDTH : 0;
              const width =
                duration > 0
                  ? ((region.end - region.start) / duration) * VIDEO_PROGRESS_OVERLAY_WIDTH
                  : 0;
              const isActive = activeRegionIds?.has(region.id);
              const isPrimary = region.id === primaryRegionId;
              return (
                <rect
                  key={region.id}
                  className={`video-player-region ${isActive ? 'active' : ''} ${isPrimary ? 'primary' : ''}`}
                  x={left}
                  y={VIDEO_PROGRESS_BAR_Y}
                  width={width}
                  height={VIDEO_PROGRESS_BAR_HEIGHT}
                  rx={20}
                  ry={20}
                />
              );
            })}
            <rect
              className="video-player-progress-filled"
              x={0}
              y={VIDEO_PROGRESS_BAR_Y}
              width={progressOverlayX}
              height={VIDEO_PROGRESS_BAR_HEIGHT}
              rx={VIDEO_PROGRESS_BAR_RADIUS}
              ry={VIDEO_PROGRESS_BAR_RADIUS}
            />
            <circle
              className="video-player-progress-thumb"
              cx={progressOverlayX}
              cy={VIDEO_PROGRESS_OVERLAY_HEIGHT / 2}
              r={VIDEO_PROGRESS_THUMB_RADIUS}
            />
          </svg>
        </div>

        {/* Control buttons row */}
        <div className="video-player-btn-row">
          <div className="video-player-left-controls">
            {/* Play/Pause */}
            <button
              className="video-player-btn"
              onClick={() => player.togglePlayback()}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <JieyuIcon name="Pause" className={JIEYU_ICON_WAVE_PLAY} />
              ) : (
                <JieyuIcon name="Play" className={JIEYU_ICON_WAVE_PLAY} />
              )}
            </button>

            {/* Skip back 5s */}
            <button
              className="video-player-btn"
              onClick={() => player.seekBySeconds(-5)}
              title="Rewind 5s (←)"
            >
              <JieyuIcon name="SkipBack" className={JIEYU_ICON_WAVE} />
            </button>

            {/* Skip forward 5s */}
            <button
              className="video-player-btn"
              onClick={() => player.seekBySeconds(5)}
              title="Forward 5s (→)"
            >
              <JieyuIcon name="SkipForward" className={JIEYU_ICON_WAVE} />
            </button>

            {/* Time display */}
            <span className="video-player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="video-player-right-controls">
            {/* Playback rate */}
            <div className="video-player-rate-wrap">
              <button
                className="video-player-btn video-player-rate-btn"
                onClick={() => setShowSettings((v) => !v)}
                title="Playback speed"
              >
                <JieyuIcon name="Settings" className={JIEYU_ICON_WAVE} />
                <span className="video-player-rate-label">{playbackRate}x</span>
              </button>
              {showSettings && (
                <div className="video-player-rate-menu">
                  {PLAYBACK_RATES.map((r) => (
                    <button
                      key={r}
                      className={`video-player-rate-option ${r === playbackRate ? 'active' : ''}`}
                      onClick={() => {
                        player.setPlaybackRate(r);
                        setShowSettings(false);
                      }}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume */}
            <button
              className="video-player-btn"
              onClick={() => {
                setIsMuted((m) => {
                  const next = !m;
                  player.setVolume(next ? 0 : volume);
                  return next;
                });
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <JieyuIcon name="VolumeX" className={JIEYU_ICON_WAVE_PLAY} />
              ) : (
                <JieyuIcon name="Volume2" className={JIEYU_ICON_WAVE_PLAY} />
              )}
            </button>

            {/* Fit/Fill/Original display mode */}
            <button
              className="video-player-btn video-player-fit-mode-btn"
              onClick={() =>
                setVideoFitMode((prev) => {
                  if (prev === 'fit') return 'fill';
                  if (prev === 'fill') return 'original';
                  return 'fit';
                })
              }
              title={
                videoFitMode === 'fit'
                  ? t(locale, 'transcription.video.fitMode.fitTitle')
                  : videoFitMode === 'fill'
                    ? t(locale, 'transcription.video.fitMode.fillTitle')
                    : t(locale, 'transcription.video.fitMode.originalTitle')
              }
            >
              {videoFitMode === 'fit' ? 'Fit' : videoFitMode === 'fill' ? 'Fill' : 'Orig'}
            </button>

            {/* Volume slider */}
            <input
              type="range"
              className="video-player-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                player.setVolume(v);
                setIsMuted(v === 0);
              }}
              title="Volume"
            />

            {/* Fullscreen */}
            <button
              className="video-player-btn"
              onClick={() => {
                const video = player.videoRef.current;
                if (!video) return;
                if (video.requestFullscreen) {
                  void video.requestFullscreen();
                }
              }}
              title="Fullscreen"
            >
              <JieyuIcon name="Maximize2" className={JIEYU_ICON_WAVE} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
