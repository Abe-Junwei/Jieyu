import { useCallback, useEffect, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';

interface UseZoomInput {
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
}

export function useZoom(input: UseZoomInput) {
  const {
    waveCanvasRef, tierContainerRef,
    playerInstanceRef, playerIsReady, playerDuration,
    playerCurrentTime, playerIsPlaying,
    selectedMediaUrl,
    zoomPercent, setZoomPercent, setZoomMode,
    fitPxPerSec, maxZoomPercent, zoomPxPerSec,
  } = input;

  const [rulerView, setRulerView] = useState<{ start: number; end: number } | null>(null);

  // ---- 缩放（锚点保持）—— 接受百分比 ----
  const zoomToPercent = useCallback((
    newPercent: number,
    anchorFraction?: number,
    nextMode: 'fit-all' | 'fit-selection' | 'custom' = 'custom',
  ) => {
    const ws = playerInstanceRef.current;
    if (!ws) return;
    const clamped = Math.max(100, Math.min(maxZoomPercent, Math.round(newPercent)));
    const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
    const frac = anchorFraction ?? 0.5;
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
  }, [zoomPxPerSec, fitPxPerSec, maxZoomPercent, playerInstanceRef, setZoomPercent, setZoomMode, tierContainerRef]);

  // ---- 双击句段：缩放并居中 ----
  const zoomToUtterance = useCallback((startTime: number, endTime: number) => {
    const ws = playerInstanceRef.current;
    if (!ws) return;
    const uttDur = endTime - startTime;
    if (uttDur <= 0) return;
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
  }, [fitPxPerSec, maxZoomPercent, zoomPercent, playerInstanceRef, setZoomPercent, setZoomMode, tierContainerRef]);

  // ---- WaveSurfer scroll/zoom → 同步刻度尺 ----
  useEffect(() => {
    const ws = playerInstanceRef.current;
    if (!ws || !playerIsReady) return;
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
  }, [zoomPxPerSec, selectedMediaUrl, playerIsReady, playerDuration, playerInstanceRef, tierContainerRef]);

  // ---- Wheel 拦截：Ctrl/⌘+滚轮缩放，普通滚轮平移 ----
  useEffect(() => {
    const el = waveCanvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const ws = playerInstanceRef.current;
      if (!ws) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercent(zoomPercent * factor, frac);
      } else {
        e.preventDefault();
        const target = ws.getScroll() + e.deltaY + e.deltaX;
        ws.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomPercent, zoomToPercent, selectedMediaUrl, playerIsReady, playerInstanceRef, waveCanvasRef, tierContainerRef]);

  // ---- Wheel 拦截（tier lanes）：与波形同步 ----
  useEffect(() => {
    const el = tierContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const ws = playerInstanceRef.current;
      if (!ws) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercent(zoomPercent * factor, frac);
      } else {
        e.preventDefault();
        const target = ws.getScroll() + e.deltaY + e.deltaX;
        ws.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomPercent, zoomToPercent, selectedMediaUrl, playerIsReady, playerInstanceRef, tierContainerRef]);

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
    zoomToUtterance,
  };
}
