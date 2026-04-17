import { useCallback, useEffect, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { t, useLocale } from '../i18n';

interface TimeRulerProps {
  duration: number;
  currentTime: number;
  rulerView: { start: number; end: number };
  zoomPxPerSec: number;
  isLaneHeaderCollapsed: boolean;
  onToggleLaneHeader: () => void;
  seekTo: (time: number) => void;
  instanceRef: React.RefObject<WaveSurfer | null>;
  waveCanvasRef: React.RefObject<HTMLDivElement | null>;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  onWaveformResizeStart?: React.PointerEventHandler<HTMLDivElement>;
  isResizingWaveform?: boolean;
}

const NICE_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const SUB_DIVS = [10, 5, 4, 2, 1];
const RULER_HEIGHT_PX = 22;
const RULER_MINOR_TICK_Y2_PX = 4;
const RULER_MAJOR_TICK_Y2_PX = 8;
const RULER_LABEL_Y_PX = 16;
const RULER_CURSOR_TOP_OFFSET_PX = 8;
const RULER_CURSOR_JOIN_OVERLAP_PX = 2;

export function TimeRuler({
  duration,
  currentTime,
  rulerView,
  zoomPxPerSec,
  isLaneHeaderCollapsed,
  onToggleLaneHeader,
  seekTo,
  instanceRef,
  waveCanvasRef,
  tierContainerRef,
  onWaveformResizeStart,
  isResizingWaveform,
}: TimeRulerProps) {
  const locale = useLocale();
  const rulerDragRef = useRef<{ dragging: boolean; startX: number; startScroll: number }>({ dragging: false, startX: 0, startScroll: 0 });
  const overviewDragRef = useRef(false);
  const clearDragFlagTimerRef = useRef<number | null>(null);
  const moveListenerRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const upListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (moveListenerRef.current) {
        window.removeEventListener('mousemove', moveListenerRef.current);
        moveListenerRef.current = null;
      }
      if (upListenerRef.current) {
        window.removeEventListener('mouseup', upListenerRef.current);
        upListenerRef.current = null;
      }
      if (clearDragFlagTimerRef.current !== null) {
        window.clearTimeout(clearDragFlagTimerRef.current);
        clearDragFlagTimerRef.current = null;
      }
    };
  }, []);

  const dur = duration;
  const { start, end } = rulerView;
  const windowSec = end - start;

  if (windowSec <= 0) return null;

  const approxPxPerSec = Math.max(zoomPxPerSec, 1);
  const majorStep = NICE_STEPS.find((s) => s * approxPxPerSec >= 120) ?? 600;
  const subDiv = SUB_DIVS.find((d) => (majorStep / d) * approxPxPerSec >= 28) ?? 1;
  const minorStep = majorStep / subDiv;

  const showMs = majorStep < 1;
  const showHour = dur >= 3600;
  const fmtLabel = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sRaw = t % 60;
    if (showMs) {
      const sStr = sRaw.toFixed(1).padStart(4, '0');
      return showHour ? `${h}:${String(m).padStart(2, '0')}:${sStr}` : `${m}:${sStr}`;
    }
    let sInt = Math.round(sRaw);
    let mAdj = m;
    let hAdj = h;
    if (sInt >= 60) { sInt = 0; mAdj += 1; }
    if (mAdj >= 60) { mAdj = 0; hAdj += 1; }
    const ss = String(sInt).padStart(2, '0');
    return showHour
      ? `${hAdj}:${String(mAdj).padStart(2, '0')}:${ss}`
      : `${mAdj}:${ss}`;
  };

  const ticks: Array<{ time: number; kind: 'major' | 'minor' }> = [];
  const t0 = Math.max(0, Math.floor(start / minorStep) * minorStep);
  for (let t = t0; t <= Math.min(end, dur) + 1e-9; t += minorStep) {
    const rounded = Math.round(t * 1e6) / 1e6;
    if (rounded > dur) break;
    const ratio = rounded / majorStep;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    ticks.push({ time: rounded, kind: isMajor ? 'major' : 'minor' });
  }

  const seekFromOverview = useCallback((clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    seekTo(Math.max(0, Math.min(dur, ratio * dur)));
  }, [dur, seekTo]);

  const overviewViewportLeft = `${(Math.max(0, start) / dur) * 100}%`;
  const overviewViewportWidth = `${Math.max(0.8, ((Math.min(dur, end) - Math.max(0, start)) / dur) * 100)}%`;
  const cursorLineTopY = -Math.max(
    RULER_CURSOR_TOP_OFFSET_PX,
    Math.max(0, waveCanvasRef.current?.clientHeight ?? 0) + RULER_CURSOR_JOIN_OVERLAP_PX,
  );

  return (
    <div className="time-ruler">
      <button
        type="button"
        className="time-ruler-lane-toggle"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleLaneHeader}
        aria-label={isLaneHeaderCollapsed ? t(locale, 'transcription.timeRuler.expandLaneHeader') : t(locale, 'transcription.timeRuler.collapseLaneHeader')}
        title={isLaneHeaderCollapsed ? t(locale, 'transcription.timeRuler.expandLaneHeader') : t(locale, 'transcription.timeRuler.collapseLaneHeader')}
      >
        <span
          className={`time-ruler-lane-toggle-triangle ${isLaneHeaderCollapsed ? 'time-ruler-lane-toggle-triangle-right' : 'time-ruler-lane-toggle-triangle-left'}`}
          aria-hidden="true"
        />
      </button>
      <div
        className="time-ruler-inner"
        onClick={(e) => {
          if (rulerDragRef.current.dragging) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seekTo(Math.max(0, Math.min(dur, start + ratio * windowSec)));
        }}
        onMouseDown={(e) => {
          const el = waveCanvasRef.current;
          if (!el) return;
          const ws = instanceRef.current;
          rulerDragRef.current = { dragging: false, startX: e.clientX, startScroll: ws ? ws.getScroll() : 0 };
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - rulerDragRef.current.startX;
            if (Math.abs(dx) > 3) rulerDragRef.current.dragging = true;
            if (rulerDragRef.current.dragging && ws) {
              const target = rulerDragRef.current.startScroll - dx;
              ws.setScroll(target);
              if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
            }
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (clearDragFlagTimerRef.current !== null) {
              window.clearTimeout(clearDragFlagTimerRef.current);
            }
            clearDragFlagTimerRef.current = window.setTimeout(() => {
              rulerDragRef.current.dragging = false;
              clearDragFlagTimerRef.current = null;
            }, 0);
          };
          moveListenerRef.current = onMove;
          upListenerRef.current = onUp;
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <svg className="time-ruler-overlay" aria-hidden="true">
          {ticks.map((tk) => {
            const leftPct = ((tk.time - start) / windowSec) * 100;
            const left = `${leftPct}%`;
            return (
              <g key={`tk-${tk.time}`}>
                <line
                  className={`time-ruler-tick-line ${tk.kind === 'major' ? 'time-ruler-tick-line-major' : ''}`}
                  x1={left}
                  x2={left}
                  y1={0}
                  y2={tk.kind === 'major' ? RULER_MAJOR_TICK_Y2_PX : RULER_MINOR_TICK_Y2_PX}
                />
                {tk.kind === 'major' ? (
                  <text
                    className="time-ruler-label-text"
                    x={left}
                    y={RULER_LABEL_Y_PX}
                    dx={2}
                  >
                    {fmtLabel(tk.time)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            className="time-ruler-cursor-line"
            x1={`${((currentTime - start) / windowSec) * 100}%`}
            x2={`${((currentTime - start) / windowSec) * 100}%`}
            y1={cursorLineTopY}
            y2={RULER_HEIGHT_PX}
          />
        </svg>
        <div
          className="time-ruler-overview"
          title={t(locale, 'transcription.wave.overviewTooltip')}
          onClick={(e) => {
            e.stopPropagation();
            seekFromOverview(e.clientX, e.currentTarget);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            overviewDragRef.current = true;
            seekFromOverview(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (overviewDragRef.current) seekFromOverview(e.clientX, e.currentTarget);
          }}
          onPointerUp={(e) => {
            overviewDragRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            overviewDragRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        >
          <div className="time-ruler-overview-track" />
          <div
            className="time-ruler-overview-viewport"
            style={{ left: overviewViewportLeft, width: overviewViewportWidth }}
            aria-hidden="true"
          />
        </div>
      </div>
      {onWaveformResizeStart ? (
        <div
          className={`waveform-overview-resize-handle${isResizingWaveform ? ' waveform-overview-resize-handle-resizing' : ''}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            onWaveformResizeStart(event);
          }}
          role="separator"
          aria-orientation="horizontal"
          title={t(locale, 'transcription.wave.resizeHeight')}
          aria-label={t(locale, 'transcription.wave.resizeHeight')}
        >
          <div className="waveform-overview-resize-handle-dots" />
        </div>
      ) : null}
    </div>
  );
}
