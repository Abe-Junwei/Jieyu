import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { evaluateSegmentTimeUpdateGuard, type SegmentSeekGuard } from '../utils/segmentPlaybackGuard';
import { createLogger } from '../observability/logger';

const log = createLogger('useWaveSurfer');

type RegionHandle = {
  id: string;
  start: number;
  end: number;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  remove: () => void;
};

export interface WaveSurferRegion {
  id: string;
  start: number;
  end: number;
}

export interface UseWaveSurferOptions {
  /** URL of audio to load. Instance is (re)created when this changes. */
  mediaUrl: string | undefined;
  /** Region descriptors rendered on the waveform. Memoize for stability. */
  regions?: WaveSurferRegion[];
  /** IDs of all selected regions (highlighted differently). */
  activeRegionIds?: Set<string>;
  /** ID of the primary selected region (yellow highlight). */
  primaryRegionId?: string;
  /** Fires when the user clicks a region. `clickTime` is the waveform time at the click position. */
  onRegionClick?: (regionId: string, clickTime: number, event: MouseEvent) => void;
  /** Fires during region drag / resize. */
  onRegionUpdate?: (regionId: string, start: number, end: number) => void;
  /** Fires when region drag / resize ends. */
  onRegionUpdateEnd?: (regionId: string, start: number, end: number) => void;
  /** Fires when user drag-creates a new region on empty waveform area. */
  onRegionCreate?: (start: number, end: number) => void;
  /** Enable WaveSurfer built-in empty-drag region creation. */
  enableEmptyDragCreate?: boolean;
  /** Fires on right-click of a region. */
  onRegionContextMenu?: (regionId: string, x: number, y: number) => void;
  /** Fires on double-click of a region. */
  onRegionDblClick?: (regionId: string, start: number, end: number) => void;
  /** Fires on every playback time tick. */
  onTimeUpdate?: (time: number) => void;
  /** 像素/秒缩放比例 */
  zoomLevel?: number;
  /** 键盘标记起点时间（显示为绿色标记线），undefined 表示无标记 */
  startMarker?: number | undefined;
  /** Whether the waveform area currently has keyboard focus */
  waveformFocused?: boolean;
  /** Whether segment-bounded playback should loop */
  segmentLoop?: boolean;
  /** Whether full-track playback should loop on finish */
  globalLoop?: boolean;
  /** Playback rate override for segment playback (0.25–2). When set,
   *  playRegion will use this rate instead of the global playbackRate.
   *  The global rate shown in the toolbar is unaffected. */
  segmentPlaybackRate?: number;
  /** Sub-selection range to render as a highlight inside a region */
  subSelection?: { start: number; end: number } | null;
  /** Fires when user Alt+pointerdowns on a region (for sub-range drag) */
  onRegionAltPointerDown?: (regionId: string, time: number, pointerId: number, clientX: number) => void;
  /** Whether WaveSurfer should auto-scroll/center during playback */
  autoScrollDuringPlayback?: boolean;
  /** WaveSurfer 波形区高度（像素）| Waveform canvas height in pixels */
  waveformHeight?: number;
  /** 波形增益倍率（1 = 默认，>1 峰值放大）| Amplitude scale multiplier via barHeight */
  amplitudeScale?: number;
}

export function useWaveSurfer(options: UseWaveSurferOptions) {
  const { mediaUrl, regions, activeRegionIds, primaryRegionId, startMarker, waveformFocused } = options;

  // Mirror callbacks in a ref so the heavy init effect doesn't re-run when they change.
  const cbRef = useRef(options);
  cbRef.current = options;

  const waveformRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  // Segment-bounded playback: when set, auto-stop (or loop) at this time.
  const segmentBoundsRef = useRef<{ start: number; end: number } | null>(null);
  // Guard that filters stale timeupdate events until the seek lands in segment bounds.
  const segmentSeekGuardRef = useRef<SegmentSeekGuard | null>(null);
  // True while WaveSurfer rate is overridden by segment-specific rate.
  const segmentRateActiveRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, _setRate] = useState(1);
  const [volume, _setVol] = useState(0.9);
  /** 媒体加载失败时的错误信息；null 表示无错误 | Error message when media load fails; null means no error */
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep refs in sync so the init effect can apply rate/volume without depending on state.
  const rateRef = useRef(playbackRate);
  const volRef = useRef(volume);

  const setPlaybackRate = useCallback((r: number) => {
    _setRate(r);
    rateRef.current = r;
  }, []);

  const setVolume = useCallback((v: number) => {
    _setVol(v);
    volRef.current = v;
  }, []);

  // ---- Core lifecycle: create / destroy WaveSurfer when media URL changes ----
  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;
    let disposed = false;

    instanceRef.current?.destroy();
    instanceRef.current = null;
    regionsRef.current = null;
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setLoadError(null);

    if (!mediaUrl) return;

    const plugin = RegionsPlugin.create();
    regionsRef.current = plugin;

    const ws = WaveSurfer.create({
      container,
      waveColor: '#1e3a5f',
      progressColor: '#2563eb',
      cursorColor: '#dc2626',
      height: options.waveformHeight ?? 180,
      normalize: true,
      dragToSeek: false,
      autoScroll: options.autoScrollDuringPlayback !== false,
      autoCenter: options.autoScrollDuringPlayback !== false,
      plugins: [plugin],
      minPxPerSec: options.zoomLevel ?? 40,
      barWidth: 2,
      barHeight: options.amplitudeScale ?? 1,
      barGap: 1,
      barRadius: 1,
    });

    instanceRef.current = ws;
    ws.setVolume(volRef.current);
    ws.setPlaybackRate(rateRef.current);
    ws.load(mediaUrl);

    ws.on('ready', () => {
      if (disposed) return;
      setIsReady(true);
      setLoadError(null);
      setDuration(ws.getDuration() || 0);
    });
    // 监听 WaveSurfer 的加载错误事件，将错误暴露给消费方 | Expose media load errors to consumers
    ws.on('error', (err: Error) => {
      if (disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('WaveSurfer load error', { mediaUrl, error: msg });
      setLoadError(msg);
    });
    ws.on('timeupdate', (time: number) => {
      if (disposed) return;
      const guardResult = evaluateSegmentTimeUpdateGuard(
        time,
        segmentBoundsRef.current,
        segmentSeekGuardRef.current,
      );
      segmentSeekGuardRef.current = guardResult.nextGuard;
      if (guardResult.ignore) return;

      // Auto-stop or loop at segment boundary
      const bounds = segmentBoundsRef.current;
      if (bounds && time >= bounds.end) {
        if (cbRef.current.segmentLoop) {
          segmentSeekGuardRef.current = { pending: true };
          setCurrentTime(bounds.start);
          ws.setTime(bounds.start);
          cbRef.current.onTimeUpdate?.(bounds.start);
        } else {
          ws.pause();
          // Restore global playback rate if segment rate was active
          if (segmentRateActiveRef.current) {
            segmentRateActiveRef.current = false;
            ws.setPlaybackRate(rateRef.current);
          }
          const restartAt = bounds.start;
          segmentBoundsRef.current = null; // clear BEFORE setTime to prevent recursive timeupdate
          setCurrentTime(restartAt);
          ws.setTime(restartAt);
          cbRef.current.onTimeUpdate?.(restartAt);
        }
        return;
      }

      setCurrentTime(time);
      cbRef.current.onTimeUpdate?.(time);
    });
    ws.on('play', () => {
      if (disposed) return;
      setIsPlaying(true);
    });
    ws.on('pause', () => {
      if (disposed) return;
      setIsPlaying(false);
    });
    ws.on('finish', () => {
      if (disposed) return;
      segmentBoundsRef.current = null;
      segmentSeekGuardRef.current = null;
      // Restore global rate if segment rate was active
      if (segmentRateActiveRef.current) {
        segmentRateActiveRef.current = false;
        ws.setPlaybackRate(rateRef.current);
      }
      if (cbRef.current.globalLoop) {
        ws.setTime(0);
        void ws.play();
        return;
      }
      setIsPlaying(false);
    });

    return () => {
      disposed = true;
      ws.destroy();
      instanceRef.current = null;
      regionsRef.current = null;
      regionHandlesRef.current = new Map();
      regionAbortRef.current.forEach((ac) => ac.abort());
      regionAbortRef.current = new Map();
    };
  }, [mediaUrl]);

  // ---- Incremental sync (no instance recreation) ----
  useEffect(() => {
    // Don't override the segment-specific rate while segment playback is active.
    if (segmentRateActiveRef.current) return;
    instanceRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);
  useEffect(() => { instanceRef.current?.setVolume(volume); }, [volume]);

  // ---- Region rendering ----
  // Keep a map of region handles so we can update colors without clearing.
  const regionHandlesRef = useRef<Map<string, RegionHandle>>(new Map());
  // AbortController 用于清理 region DOM 元素上的 native listener | AbortController for cleaning up native listeners on region DOM elements
  const regionAbortRef = useRef<Map<string, AbortController>>(new Map());
  const syncingRegionsRef = useRef(false);
  const activeRegionIdsRef = useRef(activeRegionIds);
  activeRegionIdsRef.current = activeRegionIds;
  const primaryRegionIdRef = useRef(primaryRegionId);
  primaryRegionIdRef.current = primaryRegionId;
  const draggingRegionRef = useRef<string | null>(null);

  // Enable drag-selection region creation and notify external handler.
  useEffect(() => {
    const rp = regionsRef.current;
    if (!rp || !isReady) return;
    if (options.enableEmptyDragCreate === false) return;

    const disableDragSelection = rp.enableDragSelection(
      {
        drag: true,
        resize: true,
        color: 'rgba(69, 121, 245, 0.24)',
      },
      3,
    );

    const unsub = rp.on('region-created', (region) => {
      if (syncingRegionsRef.current) return;
      // Skip our own programmatic regions
      if ((region as unknown as { id: string }).id === '__sub_selection__') return;
      const start = Math.min(region.start, region.end);
      const end = Math.max(region.start, region.end);
      // If the drag-created region overlaps an existing region, silently
      // discard it.  This happens when the user sub-range-selects inside a
      // region: our capture handler intercepts the pointer, but WaveSurfer's
      // enableDragSelection (inside the Shadow DOM) still fires.
      const existing = cbRef.current.regions;
      if (existing?.some((r) => r.end > start && r.start < end)) {
        region.remove();
        return;
      }
      cbRef.current.onRegionCreate?.(start, end);
      region.remove();
    });

    return () => {
      unsub();
      disableDragSelection();
    };
  }, [isReady, options.enableEmptyDragCreate]);

  useEffect(() => {
    const rp = regionsRef.current;
    const ws = instanceRef.current;
    if (!rp || !ws || !isReady) return;

    syncingRegionsRef.current = true;

    const prevHandles = regionHandlesRef.current;
    const nextHandles = new Map<string, RegionHandle>();
    const incomingIds = new Set<string>();

    const addRegionWithListeners = (r: { id: string; start: number; end: number }) => {
      // 清理旧 region 的 native listener | Clean up native listeners of previous region with same ID
      regionAbortRef.current.get(r.id)?.abort();
      const ac = new AbortController();
      regionAbortRef.current.set(r.id, ac);
      const sig = ac.signal;

      const handle = rp.addRegion({
        id: r.id, start: r.start, end: r.end,
        drag: true, resize: true,
        color: r.id === primaryRegionIdRef.current
          ? 'rgba(250, 204, 21, 0.22)'
          : activeRegionIdsRef.current?.has(r.id)
            ? 'rgba(69, 121, 245, 0.22)'
            : 'rgba(69, 121, 245, 0.06)',
      }) as unknown as RegionHandle;
      // Alt+pointerdown: intercept native region drag so we can do sub-range selection
      const elForAlt = (handle as unknown as { element?: HTMLElement }).element;
      if (elForAlt) {
        elForAlt.addEventListener('pointerdown', (ev: PointerEvent) => {
          if (!ev.altKey || ev.button !== 0) return;
          ev.stopImmediatePropagation();
          ev.preventDefault();
          // Compute the time at the click position
          const wrapper = ws.getWrapper();
          const scrollParent = wrapper?.parentElement;
          if (!wrapper || !scrollParent) return;
          const wrapperRect = scrollParent.getBoundingClientRect();
          const pxOffset = ev.clientX - wrapperRect.left + scrollParent.scrollLeft;
          const totalWidth = wrapper.scrollWidth;
          const dur = ws.getDuration() || 1;
          const time = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
          cbRef.current.onRegionAltPointerDown?.(r.id, time, ev.pointerId, ev.clientX);
        }, { capture: true, signal: sig });
      }
      handle.on('click', (...args: unknown[]) => {
        const ev = args[0] as MouseEvent | undefined;
        ev?.stopPropagation();
        // Compute the waveform time at the click position
        let clickTime = handle.start;
        if (ev) {
          const wrapper = ws.getWrapper();
          const scrollParent = wrapper?.parentElement;
          if (wrapper && scrollParent) {
            const rect = scrollParent.getBoundingClientRect();
            const pxOffset = ev.clientX - rect.left + scrollParent.scrollLeft;
            const totalWidth = wrapper.scrollWidth;
            const dur = ws.getDuration() || 1;
            clickTime = Math.max(handle.start, Math.min(handle.end, (pxOffset / totalWidth) * dur));
          }
        }
        cbRef.current.onRegionClick?.(r.id, clickTime, ev ?? new MouseEvent('click'));
      });
      handle.on('update', () => {
        draggingRegionRef.current = r.id;
        cbRef.current.onRegionUpdate?.(r.id, handle.start, handle.end);
      });
      handle.on('update-end', () => {
        draggingRegionRef.current = null;
        cbRef.current.onRegionUpdateEnd?.(r.id, handle.start, handle.end);
      });
      // Attach contextmenu on region DOM element
      const el = (handle as unknown as { element?: HTMLElement }).element;
      if (el) {
        el.addEventListener('contextmenu', (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          cbRef.current.onRegionContextMenu?.(r.id, ev.clientX, ev.clientY);
        }, { signal: sig });
        el.addEventListener('dblclick', (ev: MouseEvent) => {
          ev.stopPropagation();
          cbRef.current.onRegionDblClick?.(r.id, handle.start, handle.end);
        }, { signal: sig });
      }
      return handle;
    };

    (regions ?? []).forEach((r) => {
      incomingIds.add(r.id);
      const existing = prevHandles.get(r.id);

      if (existing) {
        // Skip the region being dragged — never touch it during active drag
        if (draggingRegionRef.current === r.id) {
          nextHandles.set(r.id, existing);
        } else if (Math.abs(existing.start - r.start) > 0.0005 || Math.abs(existing.end - r.end) > 0.0005) {
          const el = (existing as unknown as { element?: HTMLElement }).element;
          const obj = existing as unknown as { setOptions?: (o: Record<string, unknown>) => void };
          if (obj.setOptions && el) {
            obj.setOptions({ start: r.start, end: r.end });
            nextHandles.set(r.id, existing);
          } else {
            // Element destroyed or no setOptions — remove + re-add
            try {
              existing.remove();
            } catch (error) {
              log.warn('Failed to remove stale region handle before re-create', {
                regionId: r.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            nextHandles.set(r.id, addRegionWithListeners(r));
          }
        } else {
          nextHandles.set(r.id, existing);
        }
      } else {
        // New region
        nextHandles.set(r.id, addRegionWithListeners(r));
      }
    });

    // Remove deleted regions
    prevHandles.forEach((handle, id) => {
      if (!incomingIds.has(id) && id !== '__start_marker__' && id !== '__sub_selection__') {
        regionAbortRef.current.get(id)?.abort();
        regionAbortRef.current.delete(id);
        try {
          handle.remove();
        } catch (error) {
          log.warn('Failed to remove deleted region handle', {
            regionId: id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    // Always rebuild start marker (lightweight, no drag state to preserve)
    const oldMarker = prevHandles.get('__start_marker__') ?? nextHandles.get('__start_marker__');
    if (oldMarker) {
      try {
        (oldMarker as unknown as { remove: () => void }).remove();
      } catch (error) {
        log.warn('Failed to remove previous start marker region', {
          markerId: '__start_marker__',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    nextHandles.delete('__start_marker__');
    if (startMarker != null) {
      const markerHandle = rp.addRegion({
        id: '__start_marker__',
        start: startMarker, end: startMarker,
        color: '#10b981', drag: false, resize: false,
      }) as unknown as RegionHandle;
      nextHandles.set('__start_marker__', markerHandle);
    }

    regionHandlesRef.current = nextHandles;
    syncingRegionsRef.current = false;
  }, [isReady, regions, startMarker]);

  // Render sub-selection highlight as a non-interactive region.
  useEffect(() => {
    const rp = regionsRef.current;
    if (!rp || !isReady) return;
    const sub = options.subSelection;
    const prevSub = regionHandlesRef.current.get('__sub_selection__');
    if (prevSub) {
      try {
        prevSub.remove();
      } catch (error) {
        log.warn('Failed to remove previous sub-selection region', {
          markerId: '__sub_selection__',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      regionHandlesRef.current.delete('__sub_selection__');
    }
    if (sub) {
      const handle = rp.addRegion({
        id: '__sub_selection__',
        start: sub.start,
        end: sub.end,
        color: 'rgba(34, 197, 94, 0.38)',
        drag: false,
        resize: false,
      }) as unknown as RegionHandle;
      // Make the sub-selection non-interactive (pass clicks through)
      const el = (handle as unknown as { element?: HTMLElement }).element;
      if (el) el.style.pointerEvents = 'none';
      regionHandlesRef.current.set('__sub_selection__', handle);
    }
  }, [isReady, options.subSelection]);

  // Update region colors without rebuilding (avoids interrupting drag).
  useEffect(() => {
    const focused = waveformFocused !== false;
    regionHandlesRef.current.forEach((handle, id) => {
      if (id === '__start_marker__' || id === '__sub_selection__') return;
      const el = (handle as unknown as { element?: HTMLElement }).element;
      if (el) {
        el.style.backgroundColor = id === primaryRegionId
          ? (focused ? 'rgba(250, 204, 21, 0.22)' : 'rgba(34, 197, 94, 0.18)')
          : activeRegionIds?.has(id)
            ? 'rgba(69, 121, 245, 0.22)'
            : 'rgba(69, 121, 245, 0.06)';
      }
    });
  }, [activeRegionIds, primaryRegionId, waveformFocused]);

  // Toggle cursor to hair-line on region elements when Alt is held.
  useEffect(() => {
    const hairCursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='32'%3E%3Cline x1='1' y1='0' x2='1' y2='32' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E\") 1 16, text";
    const setCursor = (cursor: string) => {
      regionHandlesRef.current.forEach((handle, id) => {
        if (id === '__start_marker__' || id === '__sub_selection__') return;
        const el = (handle as unknown as { element?: HTMLElement }).element;
        if (el) el.style.cursor = cursor;
      });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setCursor(hairCursor);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setCursor('');
    };
    const onBlur = () => setCursor('');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // ---- Playback controls ----
  const togglePlayback = useCallback(() => {
    const ws = instanceRef.current;
    if (!ws) return;

    if (ws.isPlaying()) {
      ws.pause();
      segmentBoundsRef.current = null;
      segmentSeekGuardRef.current = null;
      if (segmentRateActiveRef.current) {
        segmentRateActiveRef.current = false;
        ws.setPlaybackRate(rateRef.current);
      }
      return;
    }

    // Always leave segment-bounded mode when using the global play/pause button.
    segmentBoundsRef.current = null;
    segmentSeekGuardRef.current = null;
    if (segmentRateActiveRef.current) {
      segmentRateActiveRef.current = false;
      ws.setPlaybackRate(rateRef.current);
    }

    const dur = ws.getDuration() || 0;
    const now = ws.getCurrentTime() || 0;
    const atEnd = dur > 0 && now >= dur - 0.02;

    if (atEnd) {
      ws.setTime(0);
    }
    void ws.play();
  }, []);

  /** Play a specific time range. Automatically stops (or loops) at `end`.
   *  When `resume` is true and current time is already within [start, end],
   *  continue from the current position instead of seeking to `start`. */
  const playRegion = useCallback((start: number, end: number, resume?: boolean) => {
    const ws = instanceRef.current;
    if (!ws) return;
    segmentBoundsRef.current = { start, end };
    const cur = ws.getCurrentTime();
    const canResume = resume && cur >= start && cur < end;
    if (!canResume) {
      segmentSeekGuardRef.current = { pending: true };
      setCurrentTime(start);
      ws.setTime(start);
      cbRef.current.onTimeUpdate?.(start);
    } else {
      segmentSeekGuardRef.current = { pending: false };
    }
    // Apply segment-specific playback rate if configured
    const segRate = cbRef.current.segmentPlaybackRate;
    if (segRate != null) {
      segmentRateActiveRef.current = true;
      ws.setPlaybackRate(segRate);
    }
    void ws.play();
  }, []);

  /** Stop playback and clear segment bounds. */
  const stop = useCallback(() => {
    const ws = instanceRef.current;
    if (!ws) return;
    ws.pause();
    segmentBoundsRef.current = null;
    segmentSeekGuardRef.current = null;
    if (segmentRateActiveRef.current) {
      segmentRateActiveRef.current = false;
      ws.setPlaybackRate(rateRef.current);
    }
  }, []);

  const seekBySeconds = useCallback((delta: number) => {
    const ws = instanceRef.current;
    if (!ws) return;
    const next = Math.max(0, Math.min((ws.getCurrentTime() || 0) + delta, ws.getDuration() || 0));
    ws.setTime(next);
  }, []);

  const seekTo = useCallback((time: number) => {
    const ws = instanceRef.current;
    if (!ws) return;
    const dur = ws.getDuration() || 0;
    if (dur <= 0) return;
    ws.setTime(Math.max(0, Math.min(time, dur)));
  }, []);

  // 缩放级别变化时动态 zoom | Dynamically zoom waveform when zoom level changes
  useEffect(() => {
    if (!isReady || !options.zoomLevel) return;
    try {
      instanceRef.current?.zoom(options.zoomLevel);
    } catch (err) {
      // WaveSurfer throws "No audio loaded" for video/streaming media where
      // decodedData is null even after the ready event. Safe to ignore.
      console.error('[Jieyu] useWaveSurfer: zoom failed', err);
    }
  }, [isReady, options.zoomLevel]);

  // 波形高度变化时动态更新 | Update waveform height dynamically
  useEffect(() => {
    if (!isReady || options.waveformHeight == null) return;
    instanceRef.current?.setOptions({ height: options.waveformHeight });
  }, [isReady, options.waveformHeight]);

  // 增益倍率变化时动态更新 | Update amplitude scale (barHeight) dynamically
  useEffect(() => {
    if (!isReady || options.amplitudeScale == null) return;
    instanceRef.current?.setOptions({ barHeight: options.amplitudeScale });
  }, [isReady, options.amplitudeScale]);

  // Toggle playback auto-scroll behavior (used by zoom-to-fit mode).
  useEffect(() => {
    if (!isReady) return;
    instanceRef.current?.setOptions({
      autoScroll: options.autoScrollDuringPlayback !== false,
      autoCenter: options.autoScrollDuringPlayback !== false,
    });
  }, [isReady, options.autoScrollDuringPlayback]);

  return {
    waveformRef,
    instanceRef,
    regionHandlesRef,
    isReady,
    loadError,
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
