import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVideoPlayerOptions {
  /** URL of video to load. */
  mediaUrl: string | undefined;
  /** Fires when user clicks a region on the time ruler. */
  onRegionClick?: (regionId: string, clickTime: number, event: MouseEvent) => void;
  /** Fires on every playback time tick. */
  onTimeUpdate?: (time: number) => void;
  /** Whether segment-bounded playback should loop */
  segmentLoop?: boolean;
  /** Whether full-track playback should loop on finish */
  globalLoop?: boolean;
  /** Sub-selection range to render as a highlight on the progress bar */
  subSelection?: { start: number; end: number } | null;
  /** Region descriptors for clickable time segments (from waveformRegions) */
  regions?: Array<{ id: string; start: number; end: number }>;
  /** IDs of selected regions (highlighted differently) */
  activeRegionIds?: Set<string>;
  /** ID of the primary selected region (yellow highlight) */
  primaryRegionId?: string;
}

export function useVideoPlayer(options: UseVideoPlayerOptions) {
  const cbRef = useRef(options);
  cbRef.current = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, _setRate] = useState(1);
  const [volume, _setVol] = useState(0.9);

  const rateRef = useRef(playbackRate);
  const volRef = useRef(volume);

  // Segment-bounded playback
  const segmentBoundsRef = useRef<{ start: number; end: number } | null>(null);

  const setPlaybackRate = useCallback((r: number) => {
    _setRate(r);
    rateRef.current = r;
  }, []);

  const setVolume = useCallback((v: number) => {
    _setVol(v);
    volRef.current = v;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekBySeconds(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekBySeconds(5);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      segmentBoundsRef.current = null;
      void video.play();
    } else {
      video.pause();
      segmentBoundsRef.current = null;
    }
  }, []);

  const playRegion = useCallback((start: number, end: number, resume?: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    const canResume = resume && video.currentTime >= start && video.currentTime < end;
    if (!canResume) {
      video.currentTime = start;
    }
    segmentBoundsRef.current = { start, end };
    void video.play();
  }, []);

  const stop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    segmentBoundsRef.current = null;
  }, []);

  const seekBySeconds = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, video.duration || 0));
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(time)) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
  }, []);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !options.mediaUrl) return;

    const onLoadedMetadata = () => {
      setIsReady(true);
      setDuration(video.duration || 0);
      video.volume = volRef.current;
      video.playbackRate = rateRef.current;
    };

    const onTimeUpdate = () => {
      const time = video.currentTime;
      const bounds = segmentBoundsRef.current;

      if (bounds && time >= bounds.end) {
        if (cbRef.current.segmentLoop) {
          video.currentTime = bounds.start;
          cbRef.current.onTimeUpdate?.(bounds.start);
        } else {
          video.pause();
          video.currentTime = bounds.start;
          segmentBoundsRef.current = null;
          cbRef.current.onTimeUpdate?.(bounds.start);
        }
        return;
      }

      setCurrentTime(time);
      cbRef.current.onTimeUpdate?.(time);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      segmentBoundsRef.current = null;
      if (cbRef.current.globalLoop) {
        video.currentTime = 0;
        void video.play();
        return;
      }
      setIsPlaying(false);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [options.mediaUrl]);

  // Sync volume and rate changes
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  return {
    videoRef,
    instanceRef: videoRef, // Alias for compatibility with useWaveSurfer interface
    isReady,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    volume,
    setVolume,
    togglePlayback,
    playRegion,
    stop,
    seekBySeconds,
    seekTo,
  };
}
