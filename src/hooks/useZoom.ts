import { useCallback, useEffect, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { TimelineViewportZoomBridge } from './timelineViewportTypes';
import { getTranscriptionPlaybackClockSnapshot, subscribeTranscriptionPlaybackClock } from './transcriptionPlaybackClock';
import { useLatest } from './useLatest';

/** 文献秒轴 > 已解码媒体时长时：tier 为横向主滚动，把 WaveSurfer 像素滚动钳在有效波形范围内 */
function syncWaveScrollToTier(
  ws: WaveSurfer,
  tierScrollLeftPx: number,
  zoomPxPerSec: number,
  mediaDurSec: number,
) {
  if (mediaDurSec <= 0 || zoomPxPerSec <= 0) return;
  const w = ws.getWidth();
  const wrapper = ws.getWrapper();
  if (!wrapper) return;
  const tSec = tierScrollLeftPx / zoomPxPerSec;
  const maxWsScroll = Math.max(0, wrapper.scrollWidth - w);
  if (tSec >= mediaDurSec) {
    ws.setScroll(maxWsScroll);
  } else {
    const desired = Math.min(tSec * zoomPxPerSec, maxWsScroll);
    ws.setScroll(Math.max(0, desired));
  }
}

/**
 * 输入框/局部滚动区内优先保留原生滚轮行为，避免时间轴劫持导致“有滚动条但滚不动” |
 * Preserve native wheel scrolling inside editors/local scrollers so timeline pan does not hijack them.
 */
export function shouldBypassTimelineWheel(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('textarea, input, select, [contenteditable="true"], [data-allow-native-scroll="true"]')) {
    return true;
  }

  let node: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export interface UseZoomInput {
  waveCanvasRef: React.RefObject<HTMLDivElement | null>;
  /**
   * 可选：包裹波形+频谱的壳层（上下分屏时含下半区）。滚轮用 capture 绑在此节点上，避免只在 `.wave-canvas` 上能横滑、在频谱区无效（尤其 WebKit）。
   * Optional shell around wave+spectrogram; wheel uses capture so pan works over the spectrogram pane too.
   */
  waveformWheelCaptureRootRef?: React.RefObject<HTMLElement | null>;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  playerInstanceRef: React.RefObject<WaveSurfer | null>;
  playerIsReady: boolean;
  playerDuration: number;
  playerIsPlaying: boolean;
  selectedMediaUrl: string | undefined;
  zoomPercent: number;
  setZoomPercent: React.Dispatch<React.SetStateAction<number>>;
  setZoomMode: React.Dispatch<React.SetStateAction<'fit-all' | 'fit-selection' | 'custom'>>;
  fitPxPerSec: number;
  maxZoomPercent: number;
  zoomPxPerSec: number;
  /** 纯文本壳层：无 WaveSurfer 时以文献秒为轴做缩放/平移，并同步刻度与波形桥 scroll 状态 */
  documentSpanSec?: number;
  onLogicalTimelineScrollSync?: (scrollLeft: number) => void;
  /**
   * 与 `setRulerView` 同一 rAF 提交波形横向像素滚动（`commit` 而非额外套一层 rAF），
   * 避免 WaveSurfer `scroll` 上「标尺一帧、scrollLeft 又一帧」的双提交卡顿 |
   * Pair pixel scroll with batched ruler updates (single rAF, single React commit with ruler).
   */
  onBatchedRulerFrameScrollLeft?: (scrollLeftPx: number) => void;
}

/**
 * 时间轴 zoom / 标尺窗口的底层实现。
 * **架构约定**：页面与编排请通过 `useTimelineViewport` 的 `projection`（`TimelineViewportProjection`）消费视口，
 * 勿在 `src/pages` 中直接调用本函数，以免与「视口单写者」分叉。
 */
export function useZoom(input: UseZoomInput): TimelineViewportZoomBridge {
  const {
    waveCanvasRef,
    waveformWheelCaptureRootRef,
    tierContainerRef,
    playerInstanceRef, playerIsReady, playerDuration,
    playerIsPlaying,
    selectedMediaUrl,
    zoomPercent, setZoomPercent, setZoomMode,
    fitPxPerSec, maxZoomPercent, zoomPxPerSec,
    documentSpanSec: documentSpanIn,
    onLogicalTimelineScrollSync,
    onBatchedRulerFrameScrollLeft,
  } = input;

  const [rulerView, setRulerView] = useState<{ start: number; end: number } | null>(null);

  const docSpanSec = typeof documentSpanIn === 'number' && Number.isFinite(documentSpanIn)
    ? Math.max(0, documentSpanIn)
    : 0;

  // 避免 wheel listener 重绑 | Ref to avoid wheel listener rebinding on every zoom change
  const zoomPercentRef = useLatest(zoomPercent);

  // ---- 缩放（锚点保持）—— 接受百分比 ----
  const zoomToPercent = useCallback((
    newPercent: number,
    anchorFraction?: number,
    nextMode: 'fit-all' | 'fit-selection' | 'custom' = 'custom',
  ) => {
    const ws = playerInstanceRef.current;
    const tier = tierContainerRef.current;
    const canvas = waveCanvasRef.current;
    const clamped = Math.max(100, Math.min(maxZoomPercent, Math.round(newPercent)));
    const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
    const frac = anchorFraction ?? 0.5;
    const mediaDur = playerDuration || 0;

    if (ws && playerIsReady) {
      if (mediaDur > 0 && docSpanSec > mediaDur && tier && canvas) {
        const width = Math.max(1, canvas.clientWidth);
        const scrollLeft = tier.scrollLeft;
        const anchorTime = (scrollLeft + width * frac) / zoomPxPerSec;
        setZoomPercent(clamped);
        setZoomMode(nextMode);
        requestAnimationFrame(() => {
          const t2 = tierContainerRef.current;
          const c2 = waveCanvasRef.current;
          const ws2 = playerInstanceRef.current;
          if (!t2 || !c2 || !ws2) return;
          const w = Math.max(1, c2.clientWidth);
          const target = Math.max(0, anchorTime * newPxPerSec - w * frac);
          const maxScroll = Math.max(0, t2.scrollWidth - t2.clientWidth);
          t2.scrollLeft = Math.min(maxScroll, target);
          onLogicalTimelineScrollSync?.(t2.scrollLeft);
          syncWaveScrollToTier(ws2, t2.scrollLeft, newPxPerSec, mediaDur);
        });
        return;
      }
      const scrollLeft = ws.getScroll();
      const width = ws.getWidth();
      const anchorTime = (scrollLeft + width * frac) / zoomPxPerSec;
      setZoomPercent(clamped);
      setZoomMode(nextMode);
      requestAnimationFrame(() => {
        const ws2 = playerInstanceRef.current;
        if (!ws2) return;
        const target = anchorTime * newPxPerSec - width * frac;
        ws2.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      });
      return;
    }

    const widthEl = canvas ?? tier;
    if (!tier || !widthEl || !(docSpanSec > 0)) return;
    const width = Math.max(1, widthEl.clientWidth);
    const scrollLeft = tier.scrollLeft;
    const anchorTime = (scrollLeft + width * frac) / zoomPxPerSec;
    setZoomPercent(clamped);
    setZoomMode(nextMode);
    requestAnimationFrame(() => {
      const t = tierContainerRef.current;
      const c = waveCanvasRef.current;
      if (!t || !c || !(docSpanSec > 0)) return;
      const w = Math.max(1, c.clientWidth);
      const target = Math.max(0, anchorTime * newPxPerSec - w * frac);
      const maxScroll = Math.max(0, t.scrollWidth - t.clientWidth);
      t.scrollLeft = Math.min(maxScroll, target);
      onLogicalTimelineScrollSync?.(t.scrollLeft);
    });
  }, [
    docSpanSec,
    zoomPxPerSec,
    fitPxPerSec,
    maxZoomPercent,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    setZoomPercent,
    setZoomMode,
    tierContainerRef,
    waveCanvasRef,
    onLogicalTimelineScrollSync,
  ]);

  const zoomToPercentRef = useLatest(zoomToPercent);

  // ---- 双击句段：缩放并居中 ----
  const zoomToUnit = useCallback((startTime: number, endTime: number) => {
    const ws = playerInstanceRef.current;
    const uttDur = endTime - startTime;
    if (uttDur <= 0) return;
    const mediaDur = playerDuration || 0;

    if (ws && playerIsReady) {
      if (mediaDur > 0 && docSpanSec > mediaDur && waveCanvasRef.current && tierContainerRef.current) {
        const width = Math.max(1, waveCanvasRef.current.clientWidth);
        const targetPxPerSec = (width * 0.7) / uttDur;
        const targetPercent = Math.round((targetPxPerSec / fitPxPerSec) * 100);
        const clamped = Math.max(100, Math.min(maxZoomPercent, targetPercent));
        const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
        const midTime = (startTime + endTime) / 2;
        const scrollTarget = Math.max(0, midTime * newPxPerSec - width / 2);
        setZoomMode('fit-selection');
        const run = () => {
          const t = tierContainerRef.current;
          const w = playerInstanceRef.current;
          if (!t || !w) return;
          const maxScroll = Math.max(0, t.scrollWidth - t.clientWidth);
          t.scrollLeft = Math.min(maxScroll, scrollTarget);
          onLogicalTimelineScrollSync?.(t.scrollLeft);
          syncWaveScrollToTier(w, t.scrollLeft, newPxPerSec, mediaDur);
        };
        if (clamped === zoomPercent) {
          run();
        } else {
          setZoomPercent(clamped);
          ws.once('zoom', () => { requestAnimationFrame(run); });
        }
        return;
      }
      const width = ws.getWidth();
      const targetPxPerSec = (width * 0.7) / uttDur;
      const targetPercent = Math.round((targetPxPerSec / fitPxPerSec) * 100);
      const clamped = Math.max(100, Math.min(maxZoomPercent, targetPercent));
      const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
      const midTime = (startTime + endTime) / 2;
      const scrollTarget = Math.max(0, midTime * newPxPerSec - width / 2);
      const applyScroll = () => {
        ws.setScroll(scrollTarget);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = scrollTarget;
      };
      setZoomMode('fit-selection');
      if (clamped === zoomPercent) {
        applyScroll();
      } else {
        ws.once('zoom', applyScroll);
        setZoomPercent(clamped);
      }
      return;
    }

    const tier = tierContainerRef.current;
    const canvas = waveCanvasRef.current;
    const widthEl = canvas ?? tier;
    if (!tier || !widthEl || !(docSpanSec > 0)) return;
    const width = Math.max(1, widthEl.clientWidth);
    const targetPxPerSec = (width * 0.7) / uttDur;
    const targetPercent = Math.round((targetPxPerSec / fitPxPerSec) * 100);
    const clamped = Math.max(100, Math.min(maxZoomPercent, targetPercent));
    const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
    const midTime = (startTime + endTime) / 2;
    const scrollTarget = Math.max(0, midTime * newPxPerSec - width / 2);
    setZoomMode('fit-selection');
    setZoomPercent(clamped);
    requestAnimationFrame(() => {
      const t = tierContainerRef.current;
      if (!t) return;
      const maxScroll = Math.max(0, t.scrollWidth - t.clientWidth);
      t.scrollLeft = Math.min(maxScroll, scrollTarget);
      onLogicalTimelineScrollSync?.(t.scrollLeft);
    });
  }, [
    docSpanSec,
    fitPxPerSec,
    maxZoomPercent,
    zoomPercent,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    setZoomPercent,
    setZoomMode,
    tierContainerRef,
    waveCanvasRef,
    onLogicalTimelineScrollSync,
  ]);

  // ---- WaveSurfer scroll/zoom → 同步刻度尺；纯文本壳层则用 tier + 逻辑时长 ----
  useEffect(() => {
    // 惯性滚动时 `scroll` 事件极密；`setRulerView` 若每次同步会拖垮主线程。合并到每帧最多一次 |
    // Trackpad inertia fires scroll events very densely; coalesce ruler React updates to rAF.
    let rulerRaf: number | null = null;
    let pendingRuler: { start: number; end: number } | null = null;
    let pendingScrollLeftForRulerFrame: number | null = null;
    const flushRuler = () => {
      rulerRaf = null;
      if (pendingRuler) {
        setRulerView(pendingRuler);
        pendingRuler = null;
      }
      if (pendingScrollLeftForRulerFrame != null) {
        onBatchedRulerFrameScrollLeft?.(pendingScrollLeftForRulerFrame);
        pendingScrollLeftForRulerFrame = null;
      }
    };
    const scheduleRulerView = (v: { start: number; end: number }, scrollLeftPx: number) => {
      pendingRuler = v;
      pendingScrollLeftForRulerFrame = scrollLeftPx;
      if (rulerRaf == null) {
        rulerRaf = requestAnimationFrame(flushRuler);
      }
    };
    const cancelRulerRaf = () => {
      if (rulerRaf != null) {
        cancelAnimationFrame(rulerRaf);
        rulerRaf = null;
        pendingRuler = null;
        pendingScrollLeftForRulerFrame = null;
      }
    };

    const ws = playerInstanceRef.current;
    if (ws && playerIsReady) {
      const dur = playerDuration || 0;
      const tier = tierContainerRef.current;
      const canvas = waveCanvasRef.current;

      if (dur > 0 && docSpanSec > dur && tier && canvas && zoomPxPerSec > 0) {
        const span = Math.max(dur, docSpanSec);
        const rulerFromTier = (scrollLeft: number) => {
          const clientWidth = Math.max(1, canvas.clientWidth);
          const totalWidth = Math.max(clientWidth, Math.ceil(span * zoomPxPerSec));
          return {
            start: (scrollLeft / totalWidth) * span,
            end: Math.min(span, ((scrollLeft + clientWidth) / totalWidth) * span),
          };
        };
        const syncRulerFromTier = () => {
          const scrollLeft = tier.scrollLeft;
          syncWaveScrollToTier(ws, scrollLeft, zoomPxPerSec, dur);
          const waveSl = ws.getScroll();
          scheduleRulerView(rulerFromTier(scrollLeft), waveSl);
        };
        {
          const sl = tier.scrollLeft;
          setRulerView(rulerFromTier(sl));
        }
        syncWaveScrollToTier(ws, tier.scrollLeft, zoomPxPerSec, dur);
        onBatchedRulerFrameScrollLeft?.(ws.getScroll());
        tier.addEventListener('scroll', syncRulerFromTier, { passive: true });
        return () => {
          cancelRulerRaf();
          tier.removeEventListener('scroll', syncRulerFromTier);
        };
      }

      const readRulerFromDom = () => {
        if (dur <= 0 || zoomPxPerSec <= 0) return null;
        const scrollLeft = ws.getScroll();
        const clientWidth = ws.getWidth();
        const totalWidth = Math.max(clientWidth, Math.ceil(dur * zoomPxPerSec));
        return {
          view: {
            start: (scrollLeft / totalWidth) * dur,
            end: Math.min(dur, ((scrollLeft + clientWidth) / totalWidth) * dur),
          },
          scrollLeft,
        };
      };

      const syncFromDom = (rulerMode: 'immediate' | 'rAF' = 'rAF') => {
        const r = readRulerFromDom();
        if (!r) return;
        if (rulerMode === 'immediate') {
          setRulerView(r.view);
          onBatchedRulerFrameScrollLeft?.(r.scrollLeft);
        } else {
          scheduleRulerView(r.view, r.scrollLeft);
        }
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = r.scrollLeft;
      };

      const unsubScroll = ws.on('scroll', (startTime: number, endTime: number) => {
        const sl = ws.getScroll();
        scheduleRulerView({ start: startTime, end: endTime }, sl);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = sl;
      });
      const unsubZoom = ws.on('zoom', () => {
        requestAnimationFrame(() => { syncFromDom('rAF'); });
      });

      syncFromDom('immediate');
      return () => {
        cancelRulerRaf();
        unsubScroll();
        unsubZoom();
      };
    }

    // 与首分支一致：仅当 WaveSurfer 已就绪时才由实例接管；否则允许文献轴兜底（避免「实例已建但未 ready」时缩放/标尺失效）
    if ((playerInstanceRef.current && playerIsReady) || !(docSpanSec > 0) || zoomPxPerSec <= 0) {
      return undefined;
    }
    const tier = tierContainerRef.current;
    const canvas = waveCanvasRef.current;
    const widthEl = canvas ?? tier;
    if (!tier || !widthEl) return undefined;

    const syncFromTier = () => {
      const scrollLeft = tier.scrollLeft;
      const clientWidth = Math.max(1, widthEl.clientWidth);
      const totalWidth = Math.max(clientWidth, Math.ceil(docSpanSec * zoomPxPerSec));
      scheduleRulerView({
        start: (scrollLeft / totalWidth) * docSpanSec,
        end: Math.min(docSpanSec, ((scrollLeft + clientWidth) / totalWidth) * docSpanSec),
      }, scrollLeft);
    };

    {
      const scrollLeft = tier.scrollLeft;
      const clientWidth = Math.max(1, widthEl.clientWidth);
      const totalWidth = Math.max(clientWidth, Math.ceil(docSpanSec * zoomPxPerSec));
      setRulerView({
        start: (scrollLeft / totalWidth) * docSpanSec,
        end: Math.min(docSpanSec, ((scrollLeft + clientWidth) / totalWidth) * docSpanSec),
      });
      onBatchedRulerFrameScrollLeft?.(scrollLeft);
    }
    tier.addEventListener('scroll', syncFromTier, { passive: true });
    return () => {
      cancelRulerRaf();
      tier.removeEventListener('scroll', syncFromTier);
    };
  }, [
    zoomPxPerSec,
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    tierContainerRef,
    waveCanvasRef,
    docSpanSec,
    onBatchedRulerFrameScrollLeft,
  ]);

  // ---- Wheel 拦截：Ctrl/⌘+滚轮缩放，普通滚轮平移 ----
  useEffect(() => {
    const wheelRoot = waveformWheelCaptureRootRef?.current ?? waveCanvasRef.current;
    if (!wheelRoot) return;
    /** 缩放锚点仍以波形视口为准（壳层可能比 wave canvas 宽/含 gap）| Zoom anchor uses wave canvas width when available */
    const anchorEl = waveCanvasRef.current ?? wheelRoot;
    const onWheel = (e: WheelEvent) => {
      // Alt+滚轮保留给波形振幅调节（由上层波形容器处理）| Reserve Alt+wheel for waveform amplitude adjustment in parent container.
      if (e.altKey) return;
      if (!e.ctrlKey && !e.metaKey && shouldBypassTimelineWheel(e.target)) {
        return;
      }
      const ws = playerInstanceRef.current;
      const mediaDurPan = playerDuration || 0;
      if (ws && playerIsReady) {
        if (mediaDurPan > 0 && docSpanSec > mediaDurPan) {
          const tier = tierContainerRef.current;
          if (tier) {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const rect = anchorEl.getBoundingClientRect();
              const frac = (e.clientX - rect.left) / rect.width;
              const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
              zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
            } else {
              e.preventDefault();
              const next = tier.scrollLeft + e.deltaY + e.deltaX;
              const maxScroll = Math.max(0, tier.scrollWidth - tier.clientWidth);
              tier.scrollLeft = Math.min(maxScroll, Math.max(0, next));
              onLogicalTimelineScrollSync?.(tier.scrollLeft);
              syncWaveScrollToTier(ws, tier.scrollLeft, zoomPxPerSec, mediaDurPan);
            }
            return;
          }
        }
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = anchorEl.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
          zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
        } else {
          e.preventDefault();
          const target = ws.getScroll() + e.deltaY + e.deltaX;
          ws.setScroll(target);
          if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
        }
        return;
      }
      const tier = tierContainerRef.current;
      if ((playerInstanceRef.current && playerIsReady) || !tier || !(docSpanSec > 0)) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = anchorEl.getBoundingClientRect();
        const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
      } else {
        e.preventDefault();
        const next = tier.scrollLeft + e.deltaY + e.deltaX;
        const maxScroll = Math.max(0, tier.scrollWidth - tier.clientWidth);
        tier.scrollLeft = Math.min(maxScroll, Math.max(0, next));
        onLogicalTimelineScrollSync?.(tier.scrollLeft);
      }
    };
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    wheelRoot.addEventListener('wheel', onWheel, opts);
    return () => wheelRoot.removeEventListener('wheel', onWheel, opts);
  }, [
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    waveCanvasRef,
    waveformWheelCaptureRootRef,
    tierContainerRef,
    docSpanSec,
    zoomPxPerSec,
    onLogicalTimelineScrollSync,
  ]);

  // ---- Wheel 拦截（tier lanes）：与波形同步 ----
  useEffect(() => {
    const el = tierContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Alt+滚轮保留给波形振幅调节（由上层波形容器处理）| Reserve Alt+wheel for waveform amplitude adjustment in parent container.
      if (e.altKey) return;
      if (!e.ctrlKey && !e.metaKey && shouldBypassTimelineWheel(e.target)) {
        return;
      }
      const ws = playerInstanceRef.current;
      const mediaDurPan = playerDuration || 0;
      if (ws && playerIsReady) {
        if (mediaDurPan > 0 && docSpanSec > mediaDurPan) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / rect.width;
            const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
            zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
          } else {
            e.preventDefault();
            const next = el.scrollLeft + e.deltaY + e.deltaX;
            const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
            el.scrollLeft = Math.min(maxScroll, Math.max(0, next));
            onLogicalTimelineScrollSync?.(el.scrollLeft);
            syncWaveScrollToTier(ws, el.scrollLeft, zoomPxPerSec, mediaDurPan);
          }
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
          zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
        } else {
          e.preventDefault();
          const target = ws.getScroll() + e.deltaY + e.deltaX;
          ws.setScroll(target);
          if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
        }
        return;
      }
      if ((playerInstanceRef.current && playerIsReady) || !(docSpanSec > 0)) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercentRef.current(zoomPercentRef.current * factor, frac);
      } else {
        e.preventDefault();
        const next = el.scrollLeft + e.deltaY + e.deltaX;
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
        el.scrollLeft = Math.min(maxScroll, Math.max(0, next));
        onLogicalTimelineScrollSync?.(el.scrollLeft);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    tierContainerRef,
    docSpanSec,
    zoomPxPerSec,
    onLogicalTimelineScrollSync,
  ]);

  // ---- 播放时视口自动跟随（读 `transcriptionPlaybackClock`，避免依赖上层 `playerCurrentTime` state）----
  useEffect(() => {
    if (!playerIsPlaying) return;
    const mediaDur = playerDuration || 0;
    const maybeFollow = () => {
      const t = getTranscriptionPlaybackClockSnapshot();
      if (mediaDur > 0 && docSpanSec > mediaDur) {
        const ws = playerInstanceRef.current;
        const tier = tierContainerRef.current;
        if (!ws || !tier) return;
        const width = ws.getWidth();
        const scrollLeft = tier.scrollLeft;
        const rightEdge = (scrollLeft + width * 0.85) / zoomPxPerSec;
        if (t > rightEdge) {
          const target = Math.max(0, t * zoomPxPerSec - width * 0.15);
          const maxScroll = Math.max(0, tier.scrollWidth - tier.clientWidth);
          tier.scrollLeft = Math.min(maxScroll, target);
          onLogicalTimelineScrollSync?.(tier.scrollLeft);
          syncWaveScrollToTier(ws, tier.scrollLeft, zoomPxPerSec, mediaDur);
        }
        return;
      }
      const ws = playerInstanceRef.current;
      if (!ws) return;
      const scrollLeft = ws.getScroll();
      const width = ws.getWidth();
      const rightEdge = (scrollLeft + width * 0.85) / zoomPxPerSec;
      if (t > rightEdge) {
        const target = t * zoomPxPerSec - width * 0.15;
        ws.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      }
    };
    maybeFollow();
    return subscribeTranscriptionPlaybackClock(maybeFollow);
  }, [
    playerIsPlaying,
    zoomPxPerSec,
    playerInstanceRef,
    tierContainerRef,
    playerDuration,
    docSpanSec,
    onLogicalTimelineScrollSync,
  ]);

  return {
    rulerView,
    zoomToPercent,
    zoomToUnit,
  };
}
