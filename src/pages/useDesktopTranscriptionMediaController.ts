import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useWaveSurfer, type UseWaveSurferOptions } from '../hooks/media/useWaveSurfer';
import { useTimelineViewport } from '../hooks/transcription/useTimelineViewport';
import { getEffectiveKeymap, matchKeyEvent } from '../services/KeybindingService';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';

export interface DesktopPlaybackUnit {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export function formatPlaybackTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export function useDesktopTranscriptionMediaController(input: {
  mediaUrl: string | null;
  units: readonly DesktopPlaybackUnit[];
  selectedUnitId: string | null;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  waveformWheelCaptureRootRef?: RefObject<HTMLElement | null>;
  onSelectUnit: (unitId: string) => void;
}) {
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [, setZoomMode] = useState<'fit-all' | 'fit-selection' | 'custom'>('fit-all');
  const [scrollLeftPx, setScrollLeftPx] = useState(0);
  const [waveWidth, setWaveWidth] = useState(0);
  const [waveformDisplayMode, setWaveformDisplayMode] = useState<WaveformDisplayMode>('waveform');
  const [waveformVisualStyle, setWaveformVisualStyle] = useState<WaveformVisualStyle>('balanced');
  const [acousticOverlayMode, setAcousticOverlayMode] = useState<AcousticOverlayMode>('none');
  const unitsRef = useRef(input.units);
  const selectedRef = useRef(input.selectedUnitId);
  unitsRef.current = input.units;
  selectedRef.current = input.selectedUnitId;

  const regions = useMemo(
    () => input.units.map((unit) => ({ id: unit.id, start: unit.startTime, end: unit.endTime })),
    [input.units],
  );
  const activeRegionIds = useMemo(
    () => new Set(input.selectedUnitId ? [input.selectedUnitId] : []),
    [input.selectedUnitId],
  );

  const seekToRef = useRef<(time: number) => void>(() => undefined);
  const waveformOptions: UseWaveSurferOptions = {
    mediaUrl: input.mediaUrl ?? undefined,
    regions,
    activeRegionIds,
    globalLoop: loop,
    waveformHeight: 168,
    cursorWidth: 2,
    waveColor: 'color-mix(in srgb, var(--text-secondary) 42%, transparent)',
    progressColor: 'color-mix(in srgb, var(--text-secondary) 42%, transparent)',
    cursorColor: 'var(--timeline-playhead-color)',
    primaryRegionColor: 'var(--brand-tint)',
    primaryRegionEdgeColor: 'var(--mark-secondary)',
    regionsInteractive: false,
    waveformDisplayMode,
    waveformVisualStyle,
    onRegionClick: (regionId) => {
      const unit = unitsRef.current.find((item) => item.id === regionId);
      input.onSelectUnit(regionId);
      if (unit) seekToRef.current(unit.startTime);
    },
  };
  if (input.selectedUnitId) waveformOptions.primaryRegionId = input.selectedUnitId;
  const player = useWaveSurfer(waveformOptions);
  const fitPxPerSec = player.duration > 0 && waveWidth > 0 ? waveWidth / player.duration : 0;
  const maxZoomPercent =
    fitPxPerSec > 0 ? Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100)) : 200;
  const zoomPxPerSec = fitPxPerSec > 0 ? Math.max(1e-9, fitPxPerSec * (zoomPercent / 100)) : 0;
  const viewport = useTimelineViewport({
    waveCanvasRef: player.waveformRef,
    ...(input.waveformWheelCaptureRootRef
      ? { waveformWheelCaptureRootRef: input.waveformWheelCaptureRootRef }
      : {}),
    tierContainerRef: input.tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    playerIsPlaying: player.isPlaying,
    selectedMediaUrl: input.mediaUrl ?? undefined,
    zoomPercent,
    setZoomPercent,
    setZoomMode,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
    documentSpanSec: player.duration,
    onLogicalTimelineScrollSync: setScrollLeftPx,
    onBatchedRulerFrameScrollLeft: setScrollLeftPx,
    waveformScrollLeft: scrollLeftPx,
  });
  const { setVolume: applyVolume, setPlaybackRate: applyRate } = player;
  seekToRef.current = player.seekTo;
  const playRegionRef = useRef(player.playRegion);
  const toggleRef = useRef(player.togglePlayback);
  playRegionRef.current = player.playRegion;
  toggleRef.current = player.togglePlayback;
  const playSegment = () => {
    const selected = unitsRef.current.find((unit) => unit.id === selectedRef.current);
    if (selected) playRegionRef.current(selected.startTime, selected.endTime, true);
  };

  useEffect(() => {
    applyVolume(volume);
  }, [applyVolume, volume]);

  useEffect(() => {
    applyRate(playbackRate);
  }, [applyRate, playbackRate]);

  useEffect(() => {
    const el = player.waveformRef.current;
    if (!el) {
      setWaveWidth(0);
      return undefined;
    }
    const update = () => setWaveWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [player.waveformRef, input.mediaUrl]);

  useEffect(() => {
    const ws = player.instanceRef.current;
    if (!player.isReady || !(zoomPxPerSec > 0) || !ws) return;
    if (typeof ws.getDecodedData === 'function' && !ws.getDecodedData()) return;
    try {
      ws.zoom(zoomPxPerSec);
    } catch {
      // Decoded audio is not available yet.
    }
  }, [player.instanceRef, player.isReady, zoomPxPerSec]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      const keymap = getEffectiveKeymap();
      const playPause = keymap.get('playPause');
      if (playPause && matchKeyEvent(event, playPause)) {
        event.preventDefault();
        toggleRef.current();
        return;
      }
      const playSegmentKey = keymap.get('playSegment');
      if (playSegmentKey && matchKeyEvent(event, playSegmentKey)) {
        event.preventDefault();
        playSegment();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    waveformRef: player.waveformRef,
    instanceRef: player.instanceRef,
    spectrogramRef: player.spectrogramRef,
    isReady: player.isReady,
    isPlaying: player.isPlaying,
    duration: player.duration,
    waveWidth,
    zoomPercent,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
    scrollLeftPx,
    rulerView: viewport.projection.rulerView as { start: number; end: number } | null,
    zoomToPercent: viewport.zoomToPercent,
    zoomToUnit: viewport.zoomToUnit,
    playbackRate,
    volume,
    loop,
    waveformDisplayMode,
    waveformVisualStyle,
    acousticOverlayMode,
    setPlaybackRate,
    setVolume,
    setLoop,
    setWaveformDisplayMode,
    setWaveformVisualStyle,
    setAcousticOverlayMode,
    togglePlayback: player.togglePlayback,
    playSegment,
    seekBySeconds: player.seekBySeconds,
    seekTo: player.seekTo,
  };
}
