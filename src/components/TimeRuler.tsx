import { useEffect, useMemo, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { LayerUnitDocType } from '../db';
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
  /** 全部语段（用于密度热力条）| All units for density heatmap */
  units?: LayerUnitDocType[];
}

const NICE_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const SUB_DIVS = [10, 5, 4, 2, 1];
const RULER_HEIGHT_PX = 30;
const RULER_MINOR_TICK_Y2_PX = 6;
const RULER_MAJOR_TICK_Y2_PX = 13;
const RULER_LABEL_Y_PX = 23;
const RULER_HEAT_BAND_HEIGHT_PX = 4;
const RULER_HEAT_BAND_Y_PX = RULER_HEIGHT_PX - RULER_HEAT_BAND_HEIGHT_PX;

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
  units,
}: TimeRulerProps) {
  const locale = useLocale();
  const rulerDragRef = useRef<{ dragging: boolean; startX: number; startScroll: number }>({ dragging: false, startX: 0, startScroll: 0 });
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

  /** 计算可见窗口内的语段密度色块 | Compute density segments for the heatmap strip */
  const densitySegments = useMemo(() => {
    if (!units || units.length === 0 || duration <= 0) return [];
    const BINS = 200;
    const binSize = duration / BINS;
    const counts = new Array<number>(BINS).fill(0);
    for (const utt of units) {
      const binStart = Math.floor(utt.startTime / binSize);
      const binEnd = Math.min(BINS - 1, Math.floor(utt.endTime / binSize));
      for (let b = binStart; b <= binEnd; b++) counts[b]!++;
    }
    const maxCount = Math.max(1, ...counts);
    type Segment = { start: number; end: number; level: number };
    const segments: Segment[] = [];
    let cur: Segment | null = null;
    for (let b = 0; b < BINS; b++) {
      const level = Math.round(((counts[b] ?? 0) / maxCount) * 4);
      const t = b * binSize;
      if (cur && cur.level === level) {
        cur.end = t + binSize;
      } else {
        if (cur) segments.push(cur);
        cur = { start: t, end: t + binSize, level };
      }
    }
    if (cur) segments.push(cur);
    return segments.filter((s) => s.level > 0);
  }, [units, duration]);

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
          {densitySegments.map((seg, i) => {
            const leftPct = ((seg.start - start) / windowSec) * 100;
            const widthPct = ((seg.end - seg.start) / windowSec) * 100;
            if (leftPct + widthPct < 0 || leftPct > 100) return null;
            return (
              <rect
                key={`heat-${i}`}
                className={`time-ruler-heat-band time-ruler-heat-band-level-${seg.level}`}
                x={`${Math.max(0, leftPct)}%`}
                y={RULER_HEAT_BAND_Y_PX}
                width={`${Math.min(100, leftPct + widthPct) - Math.max(0, leftPct)}%`}
                height={RULER_HEAT_BAND_HEIGHT_PX}
                rx={1}
                ry={1}
              />
            );
          })}
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
            y1={0}
            y2={RULER_HEIGHT_PX}
          />
        </svg>
      </div>
    </div>
  );
}
