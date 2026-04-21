import { useCallback, useEffect, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { TimelineViewportZoomBridge } from './timelineViewportTypes';
import { useLatest } from './useLatest';

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
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  playerInstanceRef: React.RefObject<WaveSurfer | null>;
  playerIsReady: boolean;
  playerDuration: number;
  playerCurrentTime: number;
  playerIsPlaying: boolean;
  selectedMediaUrl: string | undefined;
  zoomPercent: number;
  setZoomPercent: React.Dispatch<React.SetStateAction<number>>;
  setZoomMode: React.Dispatch<React.SetStateAction<'fit-all' | 'fit-selection' | 'custom'>>;
  fitPxPerSec: number;
  maxZoomPercent: number;
  zoomPxPerSec: number;
  /** 纯文本壳层：无 WaveSurfer 时以文献秒为轴做缩放/平移，并同步刻度与波形桥 scroll 状态 */
  logicalTimelineDurationSec?: number;
  onLogicalTimelineScrollSync?: (scrollLeft: number) => void;
}

export function useZoom(input: UseZoomInput): TimelineViewportZoomBridge {
  const {
    waveCanvasRef, tierContainerRef,
    playerInstanceRef, playerIsReady, playerDuration,
    playerCurrentTime, playerIsPlaying,
    selectedMediaUrl,
    zoomPercent, setZoomPercent, setZoomMode,
    fitPxPerSec, maxZoomPercent, zoomPxPerSec,
    logicalTimelineDurationSec,
    onLogicalTimelineScrollSync,
  } = input;

  const [rulerView, setRulerView] = useState<{ start: number; end: number } | null>(null);

  const logicalDur = typeof logicalTimelineDurationSec === 'number' && Number.isFinite(logicalTimelineDurationSec)
    ? Math.max(0, logicalTimelineDurationSec)
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

    if (ws) {
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

    if (!tier || !canvas || !(logicalDur > 0)) return;
    const width = Math.max(1, canvas.clientWidth);
    const scrollLeft = tier.scrollLeft;
    const anchorTime = (scrollLeft + width * frac) / zoomPxPerSec;
    setZoomPercent(clamped);
    setZoomMode(nextMode);
    requestAnimationFrame(() => {
      const t = tierContainerRef.current;
      const c = waveCanvasRef.current;
      if (!t || !c || !(logicalDur > 0)) return;
      const w = Math.max(1, c.clientWidth);
      const target = Math.max(0, anchorTime * newPxPerSec - w * frac);
      const maxScroll = Math.max(0, t.scrollWidth - t.clientWidth);
      t.scrollLeft = Math.min(maxScroll, target);
      onLogicalTimelineScrollSync?.(t.scrollLeft);
    });
  }, [
    logicalDur,
    zoomPxPerSec,
    fitPxPerSec,
    maxZoomPercent,
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

    if (ws) {
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
    if (!tier || !canvas || !(logicalDur > 0)) return;
    const width = Math.max(1, canvas.clientWidth);
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
    logicalDur,
    fitPxPerSec,
    maxZoomPercent,
    zoomPercent,
    playerInstanceRef,
    setZoomPercent,
    setZoomMode,
    tierContainerRef,
    waveCanvasRef,
    onLogicalTimelineScrollSync,
  ]);

  // ---- WaveSurfer scroll/zoom → 同步刻度尺；纯文本壳层则用 tier + 逻辑时长 ----
  useEffect(() => {
    const ws = playerInstanceRef.current;
    if (ws && playerIsReady) {
      const dur = playerDuration || 0;

      const syncFromDom = () => {
        if (dur <= 0 || zoomPxPerSec <= 0) return;
        const scrollLeft = ws.getScroll();
        const clientWidth = ws.getWidth();
        const totalWidth = Math.max(clientWidth, Math.ceil(dur * zoomPxPerSec));
        setRulerView({
          start: (scrollLeft / totalWidth) * dur,
          end: Math.min(dur, ((scrollLeft + clientWidth) / totalWidth) * dur),
        });
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = scrollLeft;
      };

      const unsubScroll = ws.on('scroll', (startTime: number, endTime: number) => {
        setRulerView({ start: startTime, end: endTime });
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = ws.getScroll();
      });
      const unsubZoom = ws.on('zoom', () => {
        requestAnimationFrame(syncFromDom);
      });

      syncFromDom();
      return () => { unsubScroll(); unsubZoom(); };
    }

    if (playerInstanceRef.current || !(logicalDur > 0) || zoomPxPerSec <= 0) {
      return undefined;
    }
    const tier = tierContainerRef.current;
    const canvas = waveCanvasRef.current;
    if (!tier || !canvas) return undefined;

    const syncFromTier = () => {
      const scrollLeft = tier.scrollLeft;
      const clientWidth = Math.max(1, canvas.clientWidth);
      const totalWidth = Math.max(clientWidth, Math.ceil(logicalDur * zoomPxPerSec));
      setRulerView({
        start: (scrollLeft / totalWidth) * logicalDur,
        end: Math.min(logicalDur, ((scrollLeft + clientWidth) / totalWidth) * logicalDur),
      });
    };

    syncFromTier();
    tier.addEventListener('scroll', syncFromTier, { passive: true });
    return () => { tier.removeEventListener('scroll', syncFromTier); };
  }, [
    zoomPxPerSec,
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    playerInstanceRef,
    tierContainerRef,
    waveCanvasRef,
    logicalDur,
  ]);

  // ---- Wheel 拦截：Ctrl/⌘+滚轮缩放，普通滚轮平移 ----
  useEffect(() => {
    const el = waveCanvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && shouldBypassTimelineWheel(e.target)) {
        return;
      }
      const ws = playerInstanceRef.current;
      if (ws) {
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
      const tier = tierContainerRef.current;
      if (playerInstanceRef.current || !tier || !(logicalDur > 0)) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
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
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [
    selectedMediaUrl,
    playerIsReady,
    playerInstanceRef,
    waveCanvasRef,
    tierContainerRef,
    logicalDur,
    onLogicalTimelineScrollSync,
  ]);

  // ---- Wheel 拦截（tier lanes）：与波形同步 ----
  useEffect(() => {
    const el = tierContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && shouldBypassTimelineWheel(e.target)) {
        return;
      }
      const ws = playerInstanceRef.current;
      if (ws) {
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
      if (playerInstanceRef.current || !(logicalDur > 0)) return;
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
    playerInstanceRef,
    tierContainerRef,
    logicalDur,
    onLogicalTimelineScrollSync,
  ]);

  // ---- 播放时视口自动跟随 ----
  useEffect(() => {
    if (!playerIsPlaying) return;
    const ws = playerInstanceRef.current;
    if (!ws) return;
    const scrollLeft = ws.getScroll();
    const width = ws.getWidth();
    const rightEdge = (scrollLeft + width * 0.85) / zoomPxPerSec;
    if (playerCurrentTime > rightEdge) {
      const target = playerCurrentTime * zoomPxPerSec - width * 0.15;
      ws.setScroll(target);
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
    }
  }, [playerCurrentTime, playerIsPlaying, zoomPxPerSec, playerInstanceRef, tierContainerRef]);

  return {
    rulerView,
    zoomToPercent,
    zoomToUnit,
  };
}
