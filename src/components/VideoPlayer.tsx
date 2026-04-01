import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';
import { useVideoPlayer } from '../hooks/useVideoPlayer';
import type { WaveSurferRegion } from '../hooks/useWaveSurfer';
import { t, useLocale } from '../i18n';

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

type VideoFitMode = 'fit' | 'fill' | 'original';

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
      console.error('[Jieyu] VideoPlayer: failed to read video fit mode from localStorage, using default', err);
      return 'fit';
    }
  });

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(VIDEO_FIT_MODE_STORAGE_KEY, videoFitMode);
    } catch (err) {
      console.error('[Jieyu] VideoPlayer: failed to persist video fit mode to localStorage', err);
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
      const video = player.videoRef.current;
      if (!bar || !video || !isReady) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * video.duration;
      player.seekTo(newTime);

      // Check if clicked on a region
      if (regions) {
        for (const region of regions) {
          if (newTime >= region.start && newTime <= region.end) {
            onRegionClick?.(region.id, newTime, e.nativeEvent);
            break;
          }
        }
      }
    },
    [player, regions, onRegionClick, isReady],
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const subSelectionStyle =
    subSelection && duration > 0
      ? {
          left: `${(subSelection.start / duration) * 100}%`,
          width: `${((subSelection.end - subSelection.start) / duration) * 100}%`,
        }
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`video-player ${className}`}
      style={{ width: '100%' }}
    >
      {/* Native HTML5 video element */}
      <video
        ref={player.videoRef}
        src={mediaUrl}
        style={{
          width: '100%',
          height: videoHeight,
          backgroundColor: 'var(--surface-overlay)',
          display: 'block',
          objectFit: videoFitMode === 'fill' ? 'cover' : videoFitMode === 'original' ? 'none' : 'contain',
        }}
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
          {/* Sub-selection highlight */}
          {subSelectionStyle && (
            <div className="video-player-subselection" style={subSelectionStyle} />
          )}

          {/* Region markers */}
          {regions?.map((region) => {
            const left = duration > 0 ? (region.start / duration) * 100 : 0;
            const width = duration > 0 ? ((region.end - region.start) / duration) * 100 : 0;
            const isActive = activeRegionIds?.has(region.id);
            const isPrimary = region.id === primaryRegionId;
            return (
              <div
                key={region.id}
                className={`video-player-region ${isActive ? 'active' : ''} ${isPrimary ? 'primary' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}

          {/* Playback progress */}
          <div className="video-player-progress-filled" style={{ width: `${progressPercent}%` }} />
          <div className="video-player-progress-thumb" style={{ left: `${progressPercent}%` }} />
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
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>

            {/* Skip back 5s */}
            <button
              className="video-player-btn"
              onClick={() => player.seekBySeconds(-5)}
              title="Rewind 5s (←)"
            >
              <SkipBack size={16} />
            </button>

            {/* Skip forward 5s */}
            <button
              className="video-player-btn"
              onClick={() => player.seekBySeconds(5)}
              title="Forward 5s (→)"
            >
              <SkipForward size={16} />
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
                <Settings size={16} />
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
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* Fit/Fill/Original display mode */}
            <button
              className="video-player-btn video-player-fit-mode-btn"
              onClick={() => setVideoFitMode((prev) => {
                if (prev === 'fit') return 'fill';
                if (prev === 'fill') return 'original';
                return 'fit';
              })}
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
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
