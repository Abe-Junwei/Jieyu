/**
 * 鸟瞰导航条 | Waveform overview / minimap navigation bar
 *
 * Shows all utterances proportionally across a thin canvas strip.
 * A red viewport box tracks the visible window.
 * Click or drag to seek.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { UtteranceDocType } from '../../db';

interface WaveformOverviewBarProps {
  duration: number;
  utterances: UtteranceDocType[];
  /** Currently visible ruler window, or null while the waveform is not ready */
  rulerView: { start: number; end: number } | null;
  onSeek: (time: number) => void;
  isReady: boolean;
}

export function WaveformOverviewBar({
  duration,
  utterances,
  rulerView,
  onSeek,
  isReady,
}: WaveformOverviewBarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);

  /** 绘制鸟瞰图 | Render the overview onto the canvas */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // 每次重绘前重置变换，避免重复 scale 导致坐标系漂移 | Reset transform before each draw to avoid cumulative scaling
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景 | Background
    ctx.fillStyle = '#e8edf3';
    ctx.fillRect(0, 0, W, H);

    // 语段色块 | Utterance segments
    ctx.fillStyle = '#3b82f6';
    ctx.globalAlpha = 0.55;
    for (const utt of utterances) {
      const start = Math.max(0, Math.min(duration, utt.startTime));
      const end = Math.max(start, Math.min(duration, utt.endTime));
      const x = Math.floor((start / duration) * W);
      const w = Math.max(2, Math.ceil(((end - start) / duration) * W));
      ctx.fillRect(x, 3, w, H - 6);
    }
    ctx.globalAlpha = 1.0;

    // 视口指示框 | Viewport indicator
    if (rulerView) {
      const vx = (rulerView.start / duration) * W;
      const vw = Math.max(4, ((rulerView.end - rulerView.start) / duration) * W);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.10)';
      ctx.fillRect(vx, 0, vw, H);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx + 0.75, 0.75, vw - 1.5, H - 1.5);
    }
  }, [duration, utterances, rulerView]);

  /** 绑定 ResizeObserver，使 canvas 跟随容器宽度 | Bind ResizeObserver to follow container width */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // 数据变化时重绘 | Redraw when data changes
  useEffect(() => { draw(); }, [draw]);

  /** 将鼠标位置转换为时间并触发 seek | Convert pointer X to time and seek */
  const seekFromPointer = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(duration, ratio * duration)));
    },
    [duration, onSeek],
  );

  if (!isReady || duration <= 0) return null;

  return (
    <div className="waveform-overview-bar" title="鸟瞰导航：点击或拖动定位 | Minimap: click or drag to seek">
      <canvas
        ref={canvasRef}
        className="waveform-overview-canvas"
        style={{ width: '100%', height: 20, display: 'block' }}
        onClick={seekFromPointer}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          isDraggingRef.current = true;
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (isDraggingRef.current) seekFromPointer(e);
        }}
        onPointerUp={() => { isDraggingRef.current = false; }}
        onPointerCancel={() => { isDraggingRef.current = false; }}
      />
    </div>
  );
}
